-- Rode este SQL no Supabase (SQL Editor) para ativar afiliados + histórico.

-- Código único de cada conta
alter table public.profiles
  add column if not exists affiliate_code text;

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id);

alter table public.profiles
  add column if not exists affiliate_earnings numeric default 0;

create unique index if not exists profiles_affiliate_code_uidx
  on public.profiles (affiliate_code)
  where affiliate_code is not null;

alter table public.profiles
  drop constraint if exists profiles_no_self_referral;

alter table public.profiles
  add constraint profiles_no_self_referral
  check (referred_by is null or referred_by <> id);

-- Histórico de comissões
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

-- Afiliado só lê o próprio histórico
drop policy if exists "commissions_select_own" on public.affiliate_commissions;
create policy "commissions_select_own"
  on public.affiliate_commissions for select
  using (auth.uid() = affiliate_id);

-- RPC: credita 10% + registra histórico
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

  select referred_by into v_ref
  from public.profiles
  where id = p_winner;

  if v_ref is null or v_ref = p_winner then
    return 0;
  end if;

  update public.profiles
  set
    balance = coalesce(balance, 0) + v_commission,
    affiliate_earnings = coalesce(affiliate_earnings, 0) + v_commission
  where id = v_ref;

  insert into public.affiliate_commissions (
    affiliate_id, from_user_id, win_amount, commission
  ) values (
    v_ref, p_winner, p_win_amount, v_commission
  );

  return v_commission;
end;
$$;

grant execute on function public.credit_affiliate_commission(uuid, integer) to authenticated;
grant execute on function public.credit_affiliate_commission(uuid, integer) to anon;

-- ---------------------------------------------------------------------------
-- Ranking "Mais ricos" (bypassa RLS — só devolve top por saldo)
-- ---------------------------------------------------------------------------

create or replace function public.get_richest_players(p_limit integer default 10)
returns table (
  id uuid,
  email text,
  balance numeric
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email::text, coalesce(p.balance, 0)::numeric as balance
  from public.profiles p
  order by coalesce(p.balance, 0) desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.get_richest_players(integer) to authenticated;
grant execute on function public.get_richest_players(integer) to anon;

-- Ranking em tempo real (opcional)
-- No Dashboard: Database → Replication → ative "profiles"
-- ou rode:
-- alter publication supabase_realtime add table public.profiles;
