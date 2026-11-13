-- VizinhoMarket — expansão e equipe interna (13/11/2026)
--  * Cidades: o admin cadastra e ativa cidades (expansão sem mexer no banco).
--  * Equipe interna com permissões por área (sem dar acesso total de admin):
--      financeiro  → pagamentos, conciliação, saldos, reembolsos
--      atendimento → atendimentos e reembolsos (decisão continua só com admin ou financeiro)
--      operacao    → monitor de entregas e reatribuição
--    O admin (papel 'admin') continua com acesso total. Toda concessão fica na auditoria.
--  * CPF do pagador (exigido por alguns gateways no pagamento online): guardado no perfil só se a pessoa informar,
--    validado (dígitos verificadores), visível só para a própria pessoa, o admin e o serviço de pagamentos.
--  * Fila de avisos (push) para cliente e entregador: o banco registra o evento; a função "avisos" envia.

-- =====================================================================
-- 1. Cidades
-- =====================================================================
create function public.admin_upsert_city(p_id uuid, p_name text, p_state text, p_timezone text default 'America/Campo_Grande', p_active boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_slug text;
begin
  perform public._require_admin();
  if coalesce(char_length(trim(p_name)), 0) < 2 then raise exception 'Informe o nome da cidade'; end if;
  if p_state !~ '^[A-Z]{2}$' then raise exception 'UF inválida (ex.: MS)'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Fuso horário inválido'; end if;
  v_slug := public._slugify(trim(p_name) || '-' || p_state);
  if v_id is null then
    insert into public.cities (name, state, slug, timezone, active) values (trim(p_name), p_state, v_slug, p_timezone, p_active) returning id into v_id;
  else
    update public.cities set name = trim(p_name), state = p_state, timezone = p_timezone, active = p_active where id = v_id;
    if not found then raise exception 'Cidade não encontrada'; end if;
  end if;
  perform public._audit('upsert_city', 'cities', v_id::text, jsonb_build_object('name', p_name, 'state', p_state, 'active', p_active));
  return v_id;
exception when unique_violation then raise exception 'Cidade já cadastrada';
end $$;

create function public.admin_list_cities()
returns table (id uuid, name text, state char(2), timezone text, active boolean, neighborhoods bigint, stores bigint, couriers bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select c.id, c.name, c.state, c.timezone, c.active,
    (select count(*) from public.neighborhoods n where n.city_id = c.id),
    (select count(*) from public.stores s where s.city_id = c.id and s.status = 'approved'),
    (select count(*) from public.couriers k where k.city_id = c.id and k.status = 'approved')
  from public.cities c order by c.active desc, c.name;
end $$;

-- =====================================================================
-- 2. Equipe interna por área
-- =====================================================================
create table public.staff_scopes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  scope      text not null check (scope in ('financeiro', 'atendimento', 'operacao')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, scope)
);
alter table public.staff_scopes enable row level security;
revoke all on public.staff_scopes from anon, authenticated;
grant select on public.staff_scopes to authenticated;
create policy staff_scopes_read on public.staff_scopes for select to authenticated using (user_id = auth.uid() or public.is_admin());

create function public.has_scope(p_scope text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff_scopes where user_id = auth.uid() and scope = p_scope)
$$;

create function public._require_scope(p_scope text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._uid();
  if not public.has_scope(p_scope) then raise exception 'Acesso restrito à equipe (%)', p_scope using errcode = '42501'; end if;
end $$;

create function public.admin_set_staff_scope(p_email text, p_scope text, p_granted boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  perform public._require_admin();
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Nenhuma conta com este e-mail (a pessoa precisa se cadastrar antes)'; end if;
  if p_scope not in ('financeiro', 'atendimento', 'operacao') then raise exception 'Área inválida'; end if;
  if p_granted then
    insert into public.staff_scopes (user_id, scope, granted_by) values (v_user, p_scope, auth.uid()) on conflict do nothing;
  else
    delete from public.staff_scopes where user_id = v_user and scope = p_scope;
  end if;
  perform public._audit(case when p_granted then 'grant_scope' else 'revoke_scope' end, 'staff_scopes', v_user::text, jsonb_build_object('scope', p_scope));
end $$;

create function public.admin_list_staff()
returns table (user_id uuid, email text, full_name text, scopes text[], is_admin boolean)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select u.id, u.email::text, p.full_name,
    coalesce((select array_agg(s.scope order by s.scope) from public.staff_scopes s where s.user_id = u.id), '{}'),
    exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin')
  from auth.users u left join public.profiles p on p.id = u.id
  where exists (select 1 from public.staff_scopes s where s.user_id = u.id) or exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin')
  order by 5 desc, 3;
end $$;

-- As funções da operação passam a aceitar a área certa (o admin continua passando em todas).
do $$
declare r record; v_src text;
begin
  -- Troca "_require_admin()" por "_require_scope(...)" no corpo das funções de cada área (mesma regra, área a área).
  for r in select * from (values
      ('admin_reconciliation', 'financeiro'), ('admin_balances', 'financeiro'), ('admin_import_settlement', 'financeiro'),
      ('admin_record_payout', 'financeiro'), ('admin_decide_refund', 'financeiro'),
      ('admin_set_ticket_status', 'atendimento'),
      ('admin_delivery_monitor', 'operacao'), ('admin_reassign_delivery', 'operacao')) as t(fn, scope)
  loop
    select pg_get_functiondef(p.oid) into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.fn;
    if v_src is null or position('public._require_admin()' in v_src) = 0 then
      raise exception 'Função % não encontrada ou sem a checagem esperada', r.fn;
    end if;
    execute replace(v_src, 'public._require_admin()', format('public._require_scope(%L)', r.scope));
  end loop;
end $$;

-- Leitura das tabelas de cada área para a equipe.
create policy refunds_staff on public.refunds for select to authenticated using (public.has_scope('financeiro') or public.has_scope('atendimento'));
create policy payments_staff on public.payments for select to authenticated using (public.has_scope('financeiro'));
create policy settlements_staff on public.provider_settlements for select to authenticated using (public.has_scope('financeiro'));
create policy tickets_staff on public.support_tickets for select to authenticated using (public.has_scope('atendimento'));
create policy ticket_msgs_staff on public.support_messages for select to authenticated using (public.has_scope('atendimento'));
create policy orders_staff on public.orders for select to authenticated using (public.has_scope('operacao') or public.has_scope('atendimento') or public.has_scope('financeiro'));

-- =====================================================================
-- 3. CPF do pagador
-- =====================================================================
alter table public.profiles add column if not exists document text check (document ~ '^\d{11}$');
-- Coluna fora do "select" de quem não é o dono: a política de profiles já limita à própria pessoa e ao admin.

create function public._cpf_valid(p text) returns boolean
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if char_length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  for k in 9..10 loop
    s := 0;
    for i in 1..k loop s := s + substr(d, i, 1)::int * (k + 2 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, k + 1, 1)::int then return false; end if;
  end loop;
  return true;
end $$;

create function public.set_my_document(p_cpf text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._cpf_valid(p_cpf) then raise exception 'CPF inválido'; end if;
  update public.profiles set document = regexp_replace(p_cpf, '\D', '', 'g') where id = public._uid();
end $$;

-- O serviço de pagamentos lê o CPF para criar a cobrança (só service_role).
create function public.svc_payer(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('id', u.id, 'email', u.email, 'name', p.full_name, 'document', p.document)
  from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user_id
$$;

create or replace function public.public_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'online_payments_enabled', coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'online_payments_enabled'), false),
    'payment_sandbox', coalesce((select value #>> '{}' from public.platform_settings where key = 'payment_provider'), 'sandbox') = 'sandbox',
    'payment_requires_document', coalesce((select value #>> '{}' from public.platform_settings where key = 'payment_provider'), 'sandbox') = 'asaas',
    'platform_delivery_enabled', coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'platform_delivery_enabled'), false),
    'refund_window_days', coalesce((select (value #>> '{}')::int from public.platform_settings where key = 'refund_window_days'), 7))
$$;

-- =====================================================================
-- 4. Avisos para cliente e entregador (fila; o envio é feito pela função "avisos")
-- =====================================================================
create table public.notification_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  app        public.push_app not null,
  title      text not null,
  body       text not null,
  url        text not null default '/',
  tag        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   int not null default 0
);
create index on public.notification_outbox (created_at) where sent_at is null;
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
revoke all on sequence public.notification_outbox_id_seq from anon, authenticated;

create function public._enqueue_order_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_store text; v_msg text;
begin
  select name into v_store from public.stores where id = new.store_id;
  -- Cliente: mudanças que importam
  if new.customer_id is not null and (new.status is distinct from old.status or (new.payment_status = 'paid' and old.payment_status <> 'paid')) then
    v_msg := case
      when new.payment_status = 'paid' and old.payment_status <> 'paid' and new.payment_mode = 'online' then 'Pagamento confirmado. A loja vai preparar seu pedido.'
      when new.status = 'ACCEPTED' then 'A loja aceitou seu pedido.'
      when new.status = 'READY' and new.fulfillment = 'pickup' then 'Pode buscar: seu pedido está pronto.'
      when new.status = 'IN_TRANSIT' then 'Seu pedido saiu para entrega. Tenha o código em mãos.'
      when new.status = 'DELIVERED' then 'Pedido entregue. Conta pra gente como foi?'
      when new.status = 'CANCELLED' then 'Seu pedido foi cancelado' || coalesce(': ' || new.cancel_reason, '.')
      end;
    if v_msg is not null then
      insert into public.notification_outbox (user_id, app, title, body, url, tag)
      values (new.customer_id, 'customer', v_store || ' · ' || new.code, v_msg, '/pedido/' || new.id, new.id::text);
    end if;
  end if;
  -- Entregadores online da cidade: corrida nova disponível
  if new.fulfillment = 'platform_delivery' and new.courier_id is null and new.status = 'ACCEPTED' and old.status = 'CREATED' then
    insert into public.notification_outbox (user_id, app, title, body, url, tag)
    select c.user_id, 'courier', 'Corrida disponível', v_store || ' · ' || to_char(new.courier_fee, 'FM"R$ "999990D00'), '/', 'oferta-' || new.id
    from public.couriers c where c.city_id = new.city_id and c.status = 'approved' and c.is_online;
  end if;
  return new;
end $$;
create trigger trg_orders_notifications after update on public.orders
  for each row execute function public._enqueue_order_notifications();

-- Para a função "avisos" (service_role): pega um lote, devolve com os aparelhos de cada pessoa.
create function public.svc_take_notifications(p_limit int default 50)
returns table (id bigint, user_id uuid, app public.push_app, title text, body text, url text, tag text, tokens jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select n.id from public.notification_outbox n
    where n.sent_at is null and n.attempts < 3 and n.created_at > now() - interval '1 hour'
    order by n.id limit p_limit for update skip locked)
  update public.notification_outbox n set attempts = n.attempts + 1, sent_at = now()
  from picked where n.id = picked.id
  returning n.id, n.user_id, n.app, n.title, n.body, n.url, n.tag,
    (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token)), '[]') from public.push_tokens t where t.user_id = n.user_id and t.app = n.app);
end $$;

create function public.svc_drop_push_token(p_id uuid) returns void
language sql security definer set search_path = public as $$ delete from public.push_tokens where id = p_id $$;

-- =====================================================================
-- 5. Permissões
-- =====================================================================
revoke execute on function public.admin_upsert_city(uuid, text, text, text, boolean), public.admin_list_cities(),
  public.has_scope(text), public._require_scope(text), public.admin_set_staff_scope(text, text, boolean), public.admin_list_staff(),
  public._cpf_valid(text), public.set_my_document(text), public.svc_payer(uuid), public.public_config(),
  public._enqueue_order_notifications(), public.svc_take_notifications(int), public.svc_drop_push_token(uuid)
from public, anon, authenticated;
grant execute on function public.admin_upsert_city(uuid, text, text, text, boolean), public.admin_list_cities(),
  public.has_scope(text), public.admin_set_staff_scope(text, text, boolean), public.admin_list_staff(), public.set_my_document(text)
to authenticated;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.svc_payer(uuid), public.svc_take_notifications(int), public.svc_drop_push_token(uuid) to service_role;
