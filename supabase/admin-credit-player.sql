-- =============================================================================
-- Admin: dar dinheiro a um jogador por email
-- Rode no Supabase → SQL Editor (conta banca precisa is_admin/is_house)
-- =============================================================================

create or replace function public.admin_credit_player(
  p_email text,
  p_amount integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_target uuid;
  v_email text;
  v_amt integer;
  v_new_bal numeric;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'not authenticated');
  end if;

  select (is_admin = true or is_house = true)
  into v_ok
  from profiles
  where id = v_uid;

  if not coalesce(v_ok, false) then
    select exists (
      select 1 from auth.users u
      where u.id = v_uid
        and lower(u.email) = lower('donodabanca@gmail.com')
    ) into v_ok;
  end if;

  if not coalesce(v_ok, false) then
    return json_build_object('ok', false, 'error', 'not admin');
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  v_amt := coalesce(p_amount, 0);

  if v_email = '' or position('@' in v_email) = 0 then
    return json_build_object('ok', false, 'error', 'email invalido');
  end if;

  if v_amt < 1 then
    return json_build_object('ok', false, 'error', 'valor minimo 1');
  end if;

  if v_amt > 1000000 then
    return json_build_object('ok', false, 'error', 'valor maximo 1000000');
  end if;

  -- 1) profiles.email
  select id into v_target
  from profiles
  where lower(email) = v_email
  limit 1;

  -- 2) auth.users
  if v_target is null then
    select id into v_target
    from auth.users
    where lower(email) = v_email
    limit 1;
  end if;

  if v_target is null then
    return json_build_object('ok', false, 'error', 'jogador nao encontrado');
  end if;

  insert into profiles (id, email, balance)
  values (v_target, v_email, 0)
  on conflict (id) do update
    set email = coalesce(profiles.email, excluded.email);

  update profiles
  set balance = coalesce(balance, 0) + v_amt
  where id = v_target
  returning balance into v_new_bal;

  insert into house_ledger (amount, game, detail, from_user_id)
  values (
    v_amt,
    'admin_grant',
    'credito admin para ' || v_email,
    v_target
  );

  return json_build_object(
    'ok', true,
    'email', v_email,
    'user_id', v_target,
    'amount', v_amt,
    'new_balance', v_new_bal
  );
end;
$$;

grant execute on function public.admin_credit_player(text, integer) to authenticated;
