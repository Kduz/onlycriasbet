-- OBRIGATÓRIO para o Aviator ficar sincronizado entre amigos.
-- Rode no SQL Editor do Supabase (uma vez por projeto).
-- Sem isto, o app cai no header Date (~1s) e relógios de telemóvel
-- podem ficar vários segundos desalinhados.

create or replace function public.server_now_ms()
returns bigint
language sql
volatile
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

grant execute on function public.server_now_ms() to anon, authenticated;
grant execute on function public.server_now_ms() to service_role;
