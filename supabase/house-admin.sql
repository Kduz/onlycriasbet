-- =============================================================================
-- BANCA + ADMIN — rode no Supabase SQL Editor (uma vez)
-- Conta da banca: donodabanca@gmail.com
-- =============================================================================

-- 1) Flags no profile
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.profiles
  add column if not exists is_house boolean not null default false;

-- 2) Ledger da banca (histórico do que entrou)
create table if not exists public.house_ledger (
  id uuid primary key default gen_random_uuid(),
  amount integer not null check (amount > 0),
  game text,
  detail text,
  from_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists house_ledger_created_idx
  on public.house_ledger (created_at desc);

alter table public.house_ledger enable row level security;

-- Só admin/banca lê o ledger
drop policy if exists "house_ledger_admin_select" on public.house_ledger;
create policy "house_ledger_admin_select"
  on public.house_ledger for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin = true or p.is_house = true)
    )
  );

-- Inserts só via RPC security definer
drop policy if exists "house_ledger_no_direct_insert" on public.house_ledger;

-- 3) Marca a conta da banca se já existir
update public.profiles p
set is_admin = true, is_house = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('donodabanca@gmail.com');

update public.profiles
set is_admin = true, is_house = true
where lower(email) = lower('donodabanca@gmail.com');

-- 4) Credita perdas na banca (qualquer jogador autenticado chama após perder)
create or replace function public.credit_house_bank(
  p_amount integer,
  p_game text default null,
  p_detail text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_house uuid;
  v_from uuid := auth.uid();
  v_amt integer;
begin
  if v_from is null then
    raise exception 'not authenticated';
  end if;

  v_amt := coalesce(p_amount, 0);
  if v_amt < 1 then
    return 0;
  end if;

  -- não credita se quem perdeu é a própria banca
  if exists (
    select 1 from profiles
    where id = v_from and (is_house = true or is_admin = true)
  ) then
    return 0;
  end if;

  select id into v_house
  from profiles
  where is_house = true
  order by id
  limit 1;

  -- fallback por email
  if v_house is null then
    select id into v_house
    from profiles
    where lower(email) = lower('donodabanca@gmail.com')
    limit 1;
  end if;

  if v_house is null then
    -- tenta auth.users
    select u.id into v_house
    from auth.users u
    where lower(u.email) = lower('donodabanca@gmail.com')
    limit 1;

    if v_house is not null then
      insert into profiles (id, email, balance, is_admin, is_house)
      values (v_house, 'donodabanca@gmail.com', 0, true, true)
      on conflict (id) do update
        set is_admin = true, is_house = true, email = coalesce(profiles.email, excluded.email);
    end if;
  end if;

  if v_house is null then
    return 0;
  end if;

  if v_house = v_from then
    return 0;
  end if;

  update profiles
  set balance = coalesce(balance, 0) + v_amt
  where id = v_house;

  insert into house_ledger (amount, game, detail, from_user_id)
  values (v_amt, p_game, p_detail, v_from);

  return v_amt;
end;
$$;

grant execute on function public.credit_house_bank(integer, text, text) to authenticated;
grant execute on function public.credit_house_bank(integer, text, text) to anon;

-- 5) Stats do painel admin
create or replace function public.get_admin_dashboard()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_house_bal numeric := 0;
  v_house_id uuid;
  v_players int := 0;
  v_total_bal numeric := 0;
  v_ledger_sum bigint := 0;
  v_ledger json;
  v_top json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'not authenticated');
  end if;

  select (is_admin = true or is_house = true)
  into v_ok
  from profiles
  where id = v_uid;

  if not coalesce(v_ok, false) then
    -- email fallback
    select exists (
      select 1 from auth.users u
      where u.id = v_uid and lower(u.email) = lower('donodabanca@gmail.com')
    ) into v_ok;
  end if;

  if not coalesce(v_ok, false) then
    return json_build_object('ok', false, 'error', 'not admin');
  end if;

  select id, coalesce(balance, 0)
  into v_house_id, v_house_bal
  from profiles
  where is_house = true
  order by id
  limit 1;

  if v_house_id is null then
    select id, coalesce(balance, 0)
    into v_house_id, v_house_bal
    from profiles
    where lower(email) = lower('donodabanca@gmail.com')
    limit 1;
  end if;

  select count(*)::int,
         coalesce(sum(coalesce(balance, 0)), 0)
  into v_players, v_total_bal
  from profiles
  where coalesce(is_house, false) = false;

  select coalesce(sum(amount), 0)::bigint into v_ledger_sum from house_ledger;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_ledger
  from (
    select
      h.id,
      h.amount,
      h.game,
      h.detail,
      h.from_user_id,
      p.email as from_email,
      h.created_at
    from house_ledger h
    left join profiles p on p.id = h.from_user_id
    order by h.created_at desc
    limit 40
  ) t;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_top
  from (
    select id, email, balance, is_admin, is_house
    from profiles
    order by balance desc nulls last
    limit 25
  ) t;

  return json_build_object(
    'ok', true,
    'house_id', v_house_id,
    'house_balance', v_house_bal,
    'players_count', v_players,
    'players_total_balance', v_total_bal,
    'ledger_total', v_ledger_sum,
    'ledger', v_ledger,
    'players', v_top
  );
end;
$$;

grant execute on function public.get_admin_dashboard() to authenticated;

-- 6) Ranking sem a banca (opcional — atualiza se a função existir)
create or replace function public.get_richest_players(p_limit integer default 10)
returns table (id uuid, email text, balance numeric)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.balance
  from public.profiles p
  where coalesce(p.is_house, false) = false
  order by p.balance desc nulls last
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.get_richest_players(integer) to anon, authenticated;

-- 7) Helper: marcar banca por email (após criar o user no Auth)
create or replace function public.promote_house_account(p_email text default 'donodabanca@gmail.com')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_id is null then
    return json_build_object('ok', false, 'error', 'user not found — crie a conta no site primeiro');
  end if;

  insert into profiles (id, email, balance, is_admin, is_house)
  values (v_id, lower(p_email), 0, true, true)
  on conflict (id) do update
    set is_admin = true,
        is_house = true,
        email = coalesce(profiles.email, excluded.email);

  return json_build_object('ok', true, 'id', v_id, 'email', lower(p_email));
end;
$$;

grant execute on function public.promote_house_account(text) to authenticated;
grant execute on function public.promote_house_account(text) to anon;
