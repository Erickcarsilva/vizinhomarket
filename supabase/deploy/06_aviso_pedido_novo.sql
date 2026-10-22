-- VizinhoMarket — ATUALIZAÇÃO 06: aviso de pedido novo com o painel fechado (22/10/2026).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Pré-requisitos: 05 aplicado e a função novo-pedido publicada (GitHub → Actions → "Publicar funções do Supabase").
-- Projeto: ehmgvgzeiqhsjhkzvzsj (vizinhomarket-teste). Para outro projeto, troque o código na linha do endereço, no fim.
begin;

-- ================= migrations/202610220004_supabase_platform_aviso_pedido.sql =================
-- VizinhoMarket — aviso de pedido novo com o painel fechado (só no Supabase: usa pg_net).
-- Quando entra um pedido, o banco chama a função novo-pedido (supabase/functions/novo-pedido),
-- que manda o aviso para os aparelhos da equipe da loja. O endereço da função fica em
-- platform_settings.push_function_url; sem ele, nada é chamado. Falha no aviso nunca impede o pedido.
create extension if not exists pg_net with schema extensions; -- funções ficam no esquema net

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

insert into public.platform_settings (key, value)
values ('push_function_url', '"https://ehmgvgzeiqhsjhkzvzsj.supabase.co/functions/v1/novo-pedido"')
on conflict (key) do update set value = excluded.value;
commit;

-- Conferência: gatilho = true e endereço preenchido
select exists (select 1 from pg_trigger where tgname = 'orders_notify_new') as gatilho,
       (select value #>> '{}' from public.platform_settings where key = 'push_function_url') as endereco;
