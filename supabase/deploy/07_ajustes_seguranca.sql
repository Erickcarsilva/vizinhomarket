-- VizinhoMarket — ATUALIZAÇÃO 07: ajustes do verificador de segurança do Supabase (22/10/2026).
-- Para quem já rodou o 05 e o 06 antes destes ajustes. Não apaga dados.
begin;
alter function public.touch_updated_at() set search_path = public;
alter function public.forbid_product_store_change() set search_path = public;
alter function public._slugify(text) set search_path = public;
revoke execute on function public._stores_staff_guard() from public, anon, authenticated;
commit;
