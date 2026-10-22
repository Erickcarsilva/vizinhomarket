-- VizinhoMarket — ajustes apontados pelo verificador de segurança do Supabase (22/10).
-- Funções sem search_path fixo e uma função de gatilho que não precisa ser chamável pela API.
alter function public.touch_updated_at() set search_path = public;
alter function public.forbid_product_store_change() set search_path = public;
alter function public._slugify(text) set search_path = public;
revoke execute on function public._stores_staff_guard() from public, anon, authenticated;
