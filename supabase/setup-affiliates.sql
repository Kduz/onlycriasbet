-- =============================================================================
-- AFILIADOS — rode TUDO de uma vez no Supabase → SQL Editor → Run
-- =============================================================================

-- 1) Colunas no profiles
alter table public.profiles
  add column if not exists affiliate_code text;

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id);

alter table public.profiles
  add column if not exists affiliate_earnings numeric default 0 not null;

-- 2) Código único
create unique index if not exists profiles_affiliate_code_uidx
  on public.profiles (affiliate_code)
  where affiliate_code is not null;

-- 3) Sem auto-indicação
alter table public.profiles drop constraint if exists profiles_no_self_referral;
alter table public.profiles
  add constraint profiles_no_self_referral
  check (referred_by is null or referred_by <> id);

-- 4) Histórico
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.profiles(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  win_amount integer not null,
  commission integer not null,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_commissions_affiliate_idx
  on public.affiliate_commissions (affiliate_id, created_at desc);

-- 5) RLS
alter table public.profiles enable row level security;
alter table public.affiliate_commissions enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "commissions_select_own" on public.affiliate_commissions;
create policy "commissions_select_own"
  on public.affiliate_commissions for select
  using (auth.uid() = affiliate_id);

-- 6) Gera código se faltar (RPC)
create or replace function public.ensure_affiliate_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try text;
  i int;
begin
  if auth.uid() is distinct from p_user then
    raise exception 'not allowed';
  end if;

  select affiliate_code into v_code from profiles where id = p_user;
  if v_code is not null and length(v_code) > 0 then
    return v_code;
  end if;

  for i in 1..12 loop
    v_try := upper(substr(md5(p_user::text || clock_timestamp()::text || i::text), 1, 8));
    begin
      update profiles set affiliate_code = v_try where id = p_user;
      return v_try;
    exception when unique_violation then
      continue;
    end;
  end loop;

  v_try := 'C' || upper(substr(replace(p_user::text, '-', ''), 1, 7));
  update profiles set affiliate_code = v_try where id = p_user;
  return v_try;
end;
$$;

-- 7) Vincular indicação (RPC — encontra código de qualquer um)
create or replace function public.link_affiliate_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_ref uuid;
  v_my_code text;
  v_already uuid;
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', 'Faça login.');
  end if;

  if v_code is null or length(v_code) < 3 then
    return json_build_object('ok', false, 'error', 'Código inválido.');
  end if;

  select referred_by, affiliate_code into v_already, v_my_code
  from profiles where id = v_me;

  if v_already is not null then
    return json_build_object('ok', false, 'error', 'Você já está vinculado a um afiliado.');
  end if;

  if v_my_code is not null and upper(v_my_code) = v_code then
    return json_build_object('ok', false, 'error', 'Você não pode usar o seu próprio código.');
  end if;

  select id into v_ref
  from profiles
  where upper(affiliate_code) = v_code
  limit 1;

  if v_ref is null then
    return json_build_object('ok', false, 'error', 'Código de afiliado não encontrado.');
  end if;

  if v_ref = v_me then
    return json_build_object('ok', false, 'error', 'Você não pode se afiliar a si mesmo.');
  end if;

  update profiles set referred_by = v_ref where id = v_me and referred_by is null;

  return json_build_object('ok', true, 'referrer_id', v_ref);
end;
$$;

-- 8) Pagar 10% de comissão
create or replace function public.credit_affiliate_commission(
  p_winner uuid,
  p_win_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_commission integer;
begin
  if auth.uid() is distinct from p_winner then
    raise exception 'not allowed';
  end if;

  if p_win_amount is null or p_win_amount <= 0 then
    return 0;
  end if;

  v_commission := floor(p_win_amount * 0.1)::integer;
  if v_commission < 1 then
    return 0;
  end if;

  select referred_by into v_ref from profiles where id = p_winner;

  if v_ref is null or v_ref = p_winner then
    return 0;
  end if;

  update profiles
  set
    balance = coalesce(balance, 0) + v_commission,
    affiliate_earnings = coalesce(affiliate_earnings, 0) + v_commission
  where id = v_ref;

  insert into affiliate_commissions (affiliate_id, from_user_id, win_amount, commission)
  values (v_ref, p_winner, p_win_amount, v_commission);

  return v_commission;
end;
$$;

-- 9) Perfil de afiliado completo
create or replace function public.get_affiliate_profile(p_user uuid default auth.uid())
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_ref uuid;
  v_ref_code text;
  v_earn numeric;
  v_count int;
begin
  if p_user is null then
    return json_build_object('ok', false, 'error', 'sem user');
  end if;

  -- só o próprio user (ou anon com id)
  if auth.uid() is not null and auth.uid() is distinct from p_user then
    return json_build_object('ok', false, 'error', 'not allowed');
  end if;

  v_code := public.ensure_affiliate_code(p_user);

  select referred_by, coalesce(affiliate_earnings, 0)
    into v_ref, v_earn
  from profiles where id = p_user;

  if v_ref is not null then
    select affiliate_code into v_ref_code from profiles where id = v_ref;
  end if;

  select count(*)::int into v_count from profiles where referred_by = p_user;

  return json_build_object(
    'ok', true,
    'affiliate_code', v_code,
    'referred_by', v_ref,
    'referred_by_code', v_ref_code,
    'affiliate_earnings', v_earn,
    'referrals_count', v_count
  );
end;
$$;

-- 10) Ranking (já pode existir)
create or replace function public.get_richest_players(p_limit integer default 10)
returns table (id uuid, email text, balance numeric)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email::text, coalesce(p.balance, 0)::numeric
  from public.profiles p
  order by coalesce(p.balance, 0) desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- 11) Gera código para quem já existe
do $$
declare
  r record;
begin
  for r in select id from profiles where affiliate_code is null loop
    perform public.ensure_affiliate_code(r.id);
  end loop;
exception when others then
  -- se ensure exige auth.uid, gera direto
  update profiles
  set affiliate_code = upper(substr(md5(id::text), 1, 8))
  where affiliate_code is null;
end $$;

-- Grants
grant execute on function public.ensure_affiliate_code(uuid) to authenticated, anon;
grant execute on function public.link_affiliate_code(text) to authenticated, anon;
grant execute on function public.credit_affiliate_commission(uuid, integer) to authenticated, anon;
grant execute on function public.get_affiliate_profile(uuid) to authenticated, anon;
grant execute on function public.get_richest_players(integer) to authenticated, anon;

-- Fix: ensure_affiliate_code for backfill without auth check when called from DO block
-- (already handled by exception fallback above)

select 'Afiliados configurados com sucesso!' as status;
