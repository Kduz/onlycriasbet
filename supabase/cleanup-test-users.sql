-- =============================================================================
-- RESET TOTAL DE CADASTROS — Cria's Bet
-- Supabase → SQL Editor → cole e Run
--
-- Apaga: auth.users + profiles + affiliate_commissions
-- ⚠️ Irreversível. Todos precisam se cadastrar de novo.
-- =============================================================================

-- Antes (opcional — veja quantos são)
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.affiliate_commissions) as commissions;

-- Limpeza total
do $$
declare
  n_auth int;
  n_prof int;
  n_aff int;
begin
  -- quebra FKs de indicação entre profiles
  update public.profiles set referred_by = null;

  delete from public.affiliate_commissions;
  get diagnostics n_aff = row_count;

  delete from public.profiles;
  get diagnostics n_prof = row_count;

  delete from auth.users;
  get diagnostics n_auth = row_count;

  raise notice 'Removidos — auth: %, profiles: %, comissões: %', n_auth, n_prof, n_aff;
end $$;

-- Depois (deve ser 0 / 0 / 0)
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.affiliate_commissions) as commissions;
