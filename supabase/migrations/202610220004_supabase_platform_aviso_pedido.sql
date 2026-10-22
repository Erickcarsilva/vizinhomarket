-- VizinhoMarket — aviso de pedido novo com o painel fechado (só no Supabase: usa pg_net).
-- Quando entra um pedido, o banco chama a função novo-pedido (supabase/functions/novo-pedido),
-- que manda o aviso para os aparelhos da equipe da loja. O endereço da função fica em
-- platform_settings.push_function_url; sem ele, nada é chamado. Falha no aviso nunca impede o pedido.
create extension if not exists pg_net;

create function public._notify_new_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select value #>> '{}' into v_url from public.platform_settings where key = 'push_function_url';
  if coalesce(v_url, '') = '' then return new; end if;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  exception when others then
    null; -- o aviso é extra: o pedido continua valendo
  end;
  return new;
end $$;
revoke execute on function public._notify_new_order() from public, anon, authenticated;

create trigger orders_notify_new after insert on public.orders
  for each row when (new.status = 'CREATED') execute function public._notify_new_order();
