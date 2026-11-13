-- VizinhoMarket — ligações dos pagamentos que só existem no Supabase (pg_cron + pg_net). Não roda nos testes locais.
-- 1) A cada 5 minutos chama a função pagamentos-estornos (executa no gateway os estornos aprovados).
--    Endereço e segredo ficam em platform_settings: refunds_function_url e cron_secret (o mesmo valor do segredo CRON_SECRET da função).
-- 2) O aviso de pedido novo para a loja: pedido offline avisa ao ser criado; pedido online avisa quando o pagamento é confirmado.
-- 3) Tempo real dos pagamentos (o app do cliente vê o Pix confirmado na hora).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public._call_refunds_function() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value #>> '{}' into v_url from public.platform_settings where key = 'refunds_function_url';
  select value #>> '{}' into v_secret from public.platform_settings where key = 'cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return; end if;
  if not exists (select 1 from public.refunds where status in ('approved', 'processing') and mode = 'gateway') then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), timeout_milliseconds := 10000);
end $$;
revoke execute on function public._call_refunds_function() from public, anon, authenticated;

select cron.schedule('vm-estornos', '*/5 * * * *', $$select public._call_refunds_function()$$);

-- Aviso de pedido novo: só quando a loja já pode aceitar.
drop trigger if exists orders_notify_new on public.orders;
create trigger orders_notify_new after insert on public.orders
  for each row when (new.status = 'CREATED' and new.payment_mode = 'offline') execute function public._notify_new_order();
create trigger orders_notify_paid after update of payment_status on public.orders
  for each row when (new.status = 'CREATED' and new.payment_mode = 'online' and new.payment_status = 'paid' and old.payment_status <> 'paid')
  execute function public._notify_new_order();

alter publication supabase_realtime add table public.payments;
