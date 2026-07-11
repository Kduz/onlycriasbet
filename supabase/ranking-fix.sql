-- Cole e rode no Supabase → SQL Editor para o ranking "Mais ricos" funcionar.

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
