-- VizinhoMarket — Bloco 1 (piloto): Pix da loja no pedido, tempo limite de aceite,
-- exclusão de conta (Play Store / LGPD) e registro de erros do app.

-- =====================================================================
-- 1. Permitir excluir usuário sem apagar o histórico de vendas da loja
--    (pedidos e avaliações ficam, sem o vínculo com a pessoa)
-- =====================================================================
alter table public.orders alter column customer_id drop not null;
alter table public.reviews alter column customer_id drop not null;
alter table public.orders alter column customer_phone drop not null;  -- telefone apagado quando a conta é excluída
-- ...mas só nesse caso: pedido de cliente ativo continua exigindo telefone.
alter table public.orders add constraint orders_phone_required check (customer_phone is not null or customer_id is null);

do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'a'  -- 'a' = no action
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null', r.tbl, r.conname, r.col);
  end loop;
end $$;
-- stores.created_by continua obrigatório: dono de loja precisa encerrar a loja antes (verificado em delete_my_account).
alter table public.stores drop constraint if exists stores_created_by_fkey;
alter table public.stores add constraint stores_created_by_fkey foreign key (created_by) references auth.users(id) on delete restrict;

-- =====================================================================
-- 2. Chave Pix da loja para o cliente que escolheu Pix na entrega
--    A chave continua privada: só o cliente daquele pedido (e a loja/admin) recebe.
-- =====================================================================
create function public.order_payment_info(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.orders%rowtype; sp public.store_private%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (o.customer_id = public._uid() or public.is_store_member(o.store_id) or public.is_admin()) then
    raise exception 'Pedido não encontrado';
  end if;
  if o.payment_method <> 'pix' then return null; end if;
  select * into sp from public.store_private where store_id = o.store_id;
  return jsonb_build_object(
    'pix_key', sp.pix_key,
    'receiver', coalesce(nullif(sp.legal_name, ''), sp.owner_name),
    'amount', o.total
  );
end $$;

-- =====================================================================
-- 3. Tempo limite: pedido que a loja não aceita é cancelado sozinho
-- =====================================================================
insert into public.platform_settings (key, value) values ('order_accept_timeout_min', '15'::jsonb)
on conflict (key) do nothing;

create function public.expire_stale_orders() returns int
language plpgsql security definer set search_path = public as $$
declare v_min numeric := coalesce(public._setting_numeric('order_accept_timeout_min'), 15); r record; n int := 0;
begin
  for r in
    select id from public.orders
    where status = 'CREATED' and created_at < now() - make_interval(mins => v_min::int)
    for update skip locked
  loop
    update public.orders set status = 'CANCELLED', cancelled_at = now(),
      cancel_reason = 'A loja não respondeu a tempo. Nenhum valor foi cobrado.' where id = r.id;
    perform public._restock(r.id);
    perform public._log_order(r.id, 'CANCELLED', 'system', 'tempo limite de aceite');
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- 4. Excluir a própria conta (exigência da Google Play e direito do titular na LGPD)
--    Apaga dados pessoais; pedidos ficam anônimos para a contabilidade da loja.
-- =====================================================================
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := public._uid();
begin
  if v_uid is null then raise exception 'Faça login para continuar'; end if;
  if exists (select 1 from public.stores where created_by = v_uid) then
    raise exception 'Você é dono de uma loja. Fale com o suporte para encerrar a loja antes de excluir a conta.';
  end if;
  if exists (select 1 from public.orders where (customer_id = v_uid or courier_id = v_uid)
             and status not in ('DELIVERED', 'CANCELLED')) then
    raise exception 'Você tem um pedido em andamento. Aguarde a conclusão para excluir a conta.';
  end if;

  update public.orders set customer_id = null, customer_name = 'Cliente removido', customer_phone = null,
    address_line = null, address_reference = null, notes = null
  where customer_id = v_uid;
  update public.reviews set comment = null where customer_id = v_uid;

  insert into public.audit_log (actor_id, action, entity, entity_id) values (null, 'account_deleted', 'user', null);
  delete from auth.users where id = v_uid;  -- perfil, papéis, endereços e tokens saem em cascata
end $$;

-- =====================================================================
-- 5. Registro de erros do app (para saber quando algo quebra no celular de alguém)
-- =====================================================================
create table public.client_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  message    text not null,
  stack      text,
  url        text,
  user_agent text,
  app_version text,
  created_at timestamptz not null default now()
);
create index on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
-- Tabela nova: começa sem nenhuma permissão (o padrão do Supabase pode liberar tabelas novas).
revoke all on public.client_errors from anon, authenticated;
grant select on public.client_errors to authenticated;
create policy client_errors_admin on public.client_errors for select to authenticated using (public.is_admin());

create function public.log_client_error(p_message text, p_stack text default null, p_url text default null,
  p_user_agent text default null, p_app_version text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- proteção contra enxurrada: no máximo 300 registros por minuto no total e 30 por usuário
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 300 then return; end if;
  if auth.uid() is not null and (select count(*) from public.client_errors
      where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then return; end if;
  insert into public.client_errors (user_id, message, stack, url, user_agent, app_version)
  values (auth.uid(), left(coalesce(p_message, '?'), 1000), left(p_stack, 4000), left(p_url, 500),
          left(p_user_agent, 300), left(p_app_version, 40));
end $$;

-- =====================================================================
-- Permissões das funções novas
-- =====================================================================
revoke execute on function public.order_payment_info(uuid), public.expire_stale_orders(),
  public.delete_my_account(), public.log_client_error(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.order_payment_info(uuid), public.delete_my_account() to authenticated;
grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated;
-- expire_stale_orders: só o agendador (pg_cron) e o admin pelo SQL Editor.
