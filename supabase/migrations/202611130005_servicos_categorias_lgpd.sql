-- VizinhoMarket — multicategoria de verdade, serviços profissionais e LGPD (13/11/2026)
--  * Categorias novas (moda, casa, construção, beleza, papelaria, flores, brinquedos, agro, conveniência) e serviços ativos.
--  * Atributos por categoria (ex.: voltagem em eletrônicos, tamanho em moda), conferidos no servidor ao salvar o produto.
--  * Serviços: prestador = loja de categoria de serviços. Fluxo próprio: pedido de orçamento → proposta → aceite →
--    agendamento → conclusão (comissão no razão) → avaliação. Conversa entre cliente e prestador. Sem carrinho e sem entrega.
--  * LGPD: exportação dos dados do titular, registro de consentimentos, exclusão de conta cobrindo as tabelas novas.
--  * public_config(): o que o app precisa saber (pagamento online e entrega pela plataforma ligados?).

-- =====================================================================
-- 1. Categorias e atributos
-- =====================================================================
alter table public.categories add column if not exists attributes_schema jsonb not null default '[]'::jsonb
  check (jsonb_typeof(attributes_schema) = 'array');
alter table public.products add column if not exists attributes jsonb not null default '{}'::jsonb
  check (jsonb_typeof(attributes) = 'object');
grant insert (attributes), update (attributes) on public.products to authenticated;

insert into public.categories (slug, name, icon, sort, active, age_restricted, needs_review, kind) values
  ('conveniencia', 'Conveniência',            'store',        25, true, false, false, 'goods'),
  ('moda',         'Moda e acessórios',       'shirt',        72, true, false, false, 'goods'),
  ('casa',         'Casa e decoração',        'lamp',         74, true, false, false, 'goods'),
  ('construcao',   'Construção e materiais',  'hammer',       76, true, false, false, 'goods'),
  ('beleza',       'Beleza e cuidados',       'sparkles',     78, true, false, false, 'goods'),
  ('papelaria',    'Papelaria e livraria',    'book-open',    82, true, false, false, 'goods'),
  ('flores',       'Floricultura e presentes','flower',       84, true, false, false, 'goods'),
  ('brinquedos',   'Brinquedos',              'puzzle',       86, true, false, false, 'goods'),
  ('agro',         'Agropecuária',            'sprout',       88, true, false, false, 'goods')
on conflict (slug) do nothing;
update public.categories set active = true, kind = 'services' where slug = 'servicos';

update public.categories set attributes_schema = '[
  {"key":"marca","label":"Marca","type":"text"},
  {"key":"voltagem","label":"Voltagem","type":"select","options":["110V","220V","Bivolt","Bateria"]},
  {"key":"garantia_meses","label":"Garantia (meses)","type":"number","min":0,"max":120}]'::jsonb where slug = 'eletronicos';
update public.categories set attributes_schema = '[
  {"key":"tamanho","label":"Tamanho","type":"text"},
  {"key":"cor","label":"Cor","type":"text"},
  {"key":"genero","label":"Público","type":"select","options":["Feminino","Masculino","Infantil","Unissex"]}]'::jsonb where slug = 'moda';
update public.categories set attributes_schema = '[
  {"key":"especie","label":"Para","type":"select","options":["Cães","Gatos","Aves","Peixes","Outros"]},
  {"key":"porte","label":"Porte","type":"select","options":["Pequeno","Médio","Grande","Todos"]}]'::jsonb where slug = 'pet';
update public.categories set attributes_schema = '[
  {"key":"medida","label":"Medida/embalagem","type":"text"},
  {"key":"entrega_pesada","label":"Exige veículo de carga","type":"boolean"}]'::jsonb where slug = 'construcao';
update public.categories set attributes_schema = '[
  {"key":"aplicacao","label":"Veículo/aplicação","type":"text"},
  {"key":"codigo_peca","label":"Código da peça","type":"text"}]'::jsonb where slug = 'autopecas';
update public.categories set attributes_schema = '[
  {"key":"validade_dias","label":"Durabilidade (dias)","type":"number","min":0,"max":60}]'::jsonb where slug = 'flores';
update public.categories set attributes_schema = '[
  {"key":"faixa_etaria","label":"Faixa etária","type":"select","options":["0-2 anos","3-5 anos","6-8 anos","9-12 anos","12+"]},
  {"key":"selo_inmetro","label":"Selo Inmetro","type":"boolean","required":true}]'::jsonb where slug = 'brinquedos';
update public.categories set attributes_schema = '[
  {"key":"registro_mapa","label":"Registro MAPA (quando exigido)","type":"text"}]'::jsonb where slug = 'agro';

-- Confere os atributos do produto contra o esquema da categoria da loja: tipo, opções, mínimo/máximo, obrigatórios, sem chaves extras.
create function public._validate_product_attributes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_schema jsonb; f jsonb; v jsonb; k text;
begin
  select c.attributes_schema into v_schema from public.stores s join public.categories c on c.id = s.category_id where s.id = new.store_id;
  v_schema := coalesce(v_schema, '[]'::jsonb);
  for k in select jsonb_object_keys(new.attributes) loop
    if not exists (select 1 from jsonb_array_elements(v_schema) x where x ->> 'key' = k) then
      raise exception 'Atributo "%" não existe para esta categoria', k;
    end if;
  end loop;
  for f in select * from jsonb_array_elements(v_schema) loop
    v := new.attributes -> (f ->> 'key');
    if v is null or v = 'null'::jsonb or v = '""'::jsonb then
      if coalesce((f ->> 'required')::boolean, false) then raise exception 'Informe "%"', f ->> 'label'; end if;
      continue;
    end if;
    case f ->> 'type'
      when 'text' then
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 120 then raise exception '"%" inválido', f ->> 'label'; end if;
      when 'number' then
        if jsonb_typeof(v) <> 'number' or (f ? 'min' and (v #>> '{}')::numeric < (f ->> 'min')::numeric)
           or (f ? 'max' and (v #>> '{}')::numeric > (f ->> 'max')::numeric) then raise exception '"%" fora do permitido', f ->> 'label'; end if;
      when 'boolean' then
        if jsonb_typeof(v) <> 'boolean' then raise exception '"%" inválido', f ->> 'label'; end if;
        if coalesce((f ->> 'required')::boolean, false) and v = 'false'::jsonb then raise exception 'Exigido: %', f ->> 'label'; end if;
      when 'select' then
        if jsonb_typeof(v) <> 'string' or not (f -> 'options') ? (v #>> '{}') then raise exception 'Escolha uma opção válida em "%"', f ->> 'label'; end if;
      else null;
    end case;
  end loop;
  return new;
end $$;
create trigger trg_products_attributes before insert or update of attributes on public.products
  for each row execute function public._validate_product_attributes();

-- Admin cria/edita categoria (com esquema de atributos). Categoria não é apagada: desativa.
create function public.admin_upsert_category(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := (p ->> 'id')::uuid; f jsonb;
begin
  perform public._require_admin();
  if p ? 'attributes_schema' then
    if jsonb_typeof(p -> 'attributes_schema') <> 'array' then raise exception 'Atributos inválidos'; end if;
    for f in select * from jsonb_array_elements(p -> 'attributes_schema') loop
      if coalesce(f ->> 'key', '') !~ '^[a-z][a-z0-9_]{1,30}$' or coalesce(f ->> 'label', '') = ''
         or f ->> 'type' not in ('text', 'number', 'boolean', 'select')
         or (f ->> 'type' = 'select' and jsonb_typeof(f -> 'options') is distinct from 'array') then
        raise exception 'Atributo inválido: %', f;
      end if;
    end loop;
  end if;
  if v_id is null then
    insert into public.categories (slug, name, icon, sort, active, age_restricted, needs_review, kind, parent_id, attributes_schema)
    values (public._slugify(p ->> 'name'), trim(p ->> 'name'), p ->> 'icon', coalesce((p ->> 'sort')::int, 100), coalesce((p ->> 'active')::boolean, false),
            coalesce((p ->> 'age_restricted')::boolean, false), coalesce((p ->> 'needs_review')::boolean, false), coalesce(p ->> 'kind', 'goods'),
            (p ->> 'parent_id')::uuid, coalesce(p -> 'attributes_schema', '[]'::jsonb))
    returning id into v_id;
  else
    update public.categories set
      name = coalesce(nullif(trim(p ->> 'name'), ''), name), icon = coalesce(p ->> 'icon', icon), sort = coalesce((p ->> 'sort')::int, sort),
      active = coalesce((p ->> 'active')::boolean, active), age_restricted = coalesce((p ->> 'age_restricted')::boolean, age_restricted),
      needs_review = coalesce((p ->> 'needs_review')::boolean, needs_review), attributes_schema = coalesce(p -> 'attributes_schema', attributes_schema)
    where id = v_id;
    if not found then raise exception 'Categoria não encontrada'; end if;
  end if;
  perform public._audit('upsert_category', 'categories', v_id::text, p);
  return v_id;
exception when unique_violation then raise exception 'Já existe categoria com este nome';
end $$;

-- =====================================================================
-- 2. Serviços profissionais
-- =====================================================================
create table public.service_offerings (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 120),
  description text check (char_length(description) <= 1000),
  price_from  numeric(10,2) check (price_from >= 0),
  price_unit  text not null default 'a_combinar' check (price_unit in ('hora', 'visita', 'servico', 'a_combinar')),
  duration_min int check (duration_min between 5 and 1440),
  active      boolean not null default true,
  deleted_at  timestamptz,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index on public.service_offerings (store_id) where deleted_at is null;

create table public.service_requests (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  store_id          uuid not null references public.stores(id),
  offering_id       uuid references public.service_offerings(id),
  customer_id       uuid references auth.users(id) on delete set null,
  customer_name     text not null,
  customer_phone    text,
  description       text not null check (char_length(description) between 10 and 2000),
  preferred_window  text check (char_length(preferred_window) <= 200),
  address_line      text,
  neighborhood_id   uuid references public.neighborhoods(id),
  status            text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED')),
  quote_amount      numeric(10,2) check (quote_amount > 0),
  quote_notes       text check (char_length(quote_notes) <= 1000),
  quote_valid_until timestamptz,
  scheduled_at      timestamptz,
  commission_rate   numeric(5,4),
  commission_amount numeric(10,2),
  cancel_reason     text,
  cancelled_by      uuid,
  rating            smallint check (rating between 1 and 5),
  rating_comment    text check (char_length(rating_comment) <= 1000),
  created_at        timestamptz not null default now(),
  quoted_at         timestamptz,
  accepted_at       timestamptz,
  completed_at      timestamptz,
  updated_at        timestamptz not null default now()
);
create index on public.service_requests (store_id, status, created_at desc);
create index on public.service_requests (customer_id, created_at desc);
create trigger trg_service_requests_touch before update on public.service_requests for each row execute function public.touch_updated_at();

create table public.service_messages (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.service_requests(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('customer', 'provider', 'admin', 'system')),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index on public.service_messages (request_id, id);

alter table public.ledger_entries add column if not exists service_request_id uuid references public.service_requests(id);
create unique index ledger_once_service on public.ledger_entries (service_request_id, account) where kind = 'service_settlement';

alter table public.service_offerings enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_messages enable row level security;
revoke all on public.service_offerings, public.service_requests, public.service_messages from anon, authenticated;
revoke all on sequence public.service_messages_id_seq from anon, authenticated;

grant select on public.service_offerings to anon, authenticated;
grant insert (store_id, name, description, price_from, price_unit, duration_min, active, sort) on public.service_offerings to authenticated;
grant update (name, description, price_from, price_unit, duration_min, active, sort, deleted_at) on public.service_offerings to authenticated;
create policy offerings_read on public.service_offerings for select
  using ((deleted_at is null and active and public.is_store_public(store_id)) or public.is_store_member(store_id) or public.is_admin());
create policy offerings_insert on public.service_offerings for insert to authenticated with check (public.is_store_member(store_id));
create policy offerings_update on public.service_offerings for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Pedido de serviço: cliente, equipe do prestador e admin. Telefone e endereço do cliente só depois do aceite da proposta.
grant select (id, code, store_id, offering_id, customer_id, customer_name, description, preferred_window, neighborhood_id, status,
              quote_amount, quote_notes, quote_valid_until, scheduled_at, cancel_reason, rating, rating_comment,
              created_at, quoted_at, accepted_at, completed_at, updated_at) on public.service_requests to authenticated;
create policy service_requests_read on public.service_requests for select to authenticated
  using (customer_id = auth.uid() or public.is_store_member(store_id) or public.is_admin());

grant select on public.service_messages to authenticated;
create function public._can_see_service_request(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.service_requests r where r.id = p_id
    and (r.customer_id = auth.uid() or public.is_store_member(r.store_id) or public.is_admin()))
$$;
create policy service_messages_read on public.service_messages for select to authenticated using (public._can_see_service_request(request_id));

create function public.request_service(p_store_id uuid, p_offering_id uuid, p_description text, p_preferred_window text,
  p_customer_name text, p_customer_phone text, p_address_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); s public.stores%rowtype; a public.addresses%rowtype; v_id uuid; v_code text;
begin
  select * into s from public.stores where id = p_store_id;
  if not found or s.status <> 'approved' or s.is_paused then raise exception 'Prestador indisponível'; end if;
  if not exists (select 1 from public.categories c where c.id = s.category_id and c.kind = 'services') then
    raise exception 'Esta loja vende produtos: use o carrinho';
  end if;
  if p_offering_id is not null and not exists (select 1 from public.service_offerings where id = p_offering_id and store_id = s.id and active and deleted_at is null) then
    raise exception 'Serviço não encontrado';
  end if;
  if coalesce(char_length(trim(p_description)), 0) < 10 then raise exception 'Descreva o que você precisa (pelo menos 10 letras)'; end if;
  if coalesce(char_length(regexp_replace(p_customer_phone, '\D', '', 'g')), 0) < 10 then raise exception 'Informe um telefone com DDD'; end if;
  if (select count(*) from public.service_requests where customer_id = v_uid and created_at > now() - interval '1 day') >= 15 then
    raise exception 'Muitos pedidos de orçamento hoje. Aguarde as respostas.';
  end if;
  if p_address_id is not null then
    select * into a from public.addresses where id = p_address_id and user_id = v_uid;
    if not found then raise exception 'Endereço inválido'; end if;
  end if;
  v_code := 'SV-' || substr(public._new_order_code(), 4);
  insert into public.service_requests (code, store_id, offering_id, customer_id, customer_name, customer_phone, description, preferred_window,
    address_line, neighborhood_id)
  values (v_code, s.id, p_offering_id, v_uid, trim(p_customer_name), trim(p_customer_phone), trim(p_description), nullif(trim(p_preferred_window), ''),
    a.line, a.neighborhood_id)
  returning id into v_id;
  insert into public.service_messages (request_id, author_id, author_kind, body) values (v_id, v_uid, 'customer', trim(p_description));
  return v_id;
end $$;

create function public.service_quote(p_request_id uuid, p_amount numeric, p_notes text, p_valid_days int default 7) returns void
language plpgsql security definer set search_path = public as $$
declare r public.service_requests%rowtype;
begin
  perform public._uid();
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or not public.is_store_member(r.store_id) then raise exception 'Pedido não encontrado'; end if;
  if r.status not in ('REQUESTED', 'QUOTED') then raise exception 'Este pedido não aceita mais proposta'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Valor da proposta inválido'; end if;
  if p_valid_days not between 1 and 30 then raise exception 'Validade entre 1 e 30 dias'; end if;
  update public.service_requests set status = 'QUOTED', quote_amount = round(p_amount, 2), quote_notes = nullif(trim(p_notes), ''),
    quote_valid_until = now() + make_interval(days => p_valid_days), quoted_at = now() where id = r.id;
  insert into public.service_messages (request_id, author_id, author_kind, body)
  values (r.id, auth.uid(), 'system', 'Proposta enviada: R$ ' || to_char(round(p_amount, 2), 'FM999G990D00') || coalesce(' — ' || nullif(trim(p_notes), ''), ''));
end $$;

create function public.service_decline(p_request_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.service_requests%rowtype;
begin
  perform public._uid();
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or not public.is_store_member(r.store_id) then raise exception 'Pedido não encontrado'; end if;
  if r.status not in ('REQUESTED', 'QUOTED') then raise exception 'Este pedido não pode ser recusado agora'; end if;
  if coalesce(char_length(trim(p_reason)), 0) < 3 then raise exception 'Informe o motivo'; end if;
  update public.service_requests set status = 'DECLINED', cancel_reason = trim(p_reason), cancelled_by = auth.uid() where id = r.id;
end $$;

-- Cliente aceita a proposta: a comissão fica congelada no valor aceito.
create function public.service_accept_quote(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); r public.service_requests%rowtype; v_rate numeric;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or r.customer_id is distinct from v_uid then raise exception 'Pedido não encontrado'; end if;
  if r.status <> 'QUOTED' then raise exception 'Não há proposta para aceitar'; end if;
  if r.quote_valid_until < now() then
    update public.service_requests set status = 'EXPIRED' where id = r.id;
    raise exception 'A proposta venceu. Peça uma nova ao prestador.';
  end if;
  v_rate := public._commission_rate(r.store_id);
  update public.service_requests set status = 'ACCEPTED', accepted_at = now(), commission_rate = v_rate,
    commission_amount = round(r.quote_amount * v_rate, 2) where id = r.id;
  insert into public.service_messages (request_id, author_id, author_kind, body) values (r.id, v_uid, 'system', 'Proposta aceita pelo cliente.');
end $$;

create function public.service_schedule(p_request_id uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare r public.service_requests%rowtype;
begin
  perform public._uid();
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or not public.is_store_member(r.store_id) then raise exception 'Pedido não encontrado'; end if;
  if r.status not in ('ACCEPTED', 'SCHEDULED') then raise exception 'Agende depois de o cliente aceitar a proposta'; end if;
  if p_at is null or p_at < now() - interval '1 hour' or p_at > now() + interval '180 days' then raise exception 'Data inválida'; end if;
  update public.service_requests set status = 'SCHEDULED', scheduled_at = p_at where id = r.id;
  insert into public.service_messages (request_id, author_id, author_kind, body)
  values (r.id, auth.uid(), 'system', 'Agendado para ' || to_char(p_at at time zone 'America/Campo_Grande', 'DD/MM/YYYY "às" HH24:MI'));
end $$;

-- Prestador conclui: a comissão vira "a receber do prestador" (o cliente paga o prestador direto no piloto).
create function public.service_complete(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.service_requests%rowtype;
begin
  perform public._uid();
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or not (public.is_store_member(r.store_id) or public.is_admin()) then raise exception 'Pedido não encontrado'; end if;
  if r.status not in ('ACCEPTED', 'SCHEDULED') then raise exception 'Só serviços aceitos podem ser concluídos'; end if;
  update public.service_requests set status = 'COMPLETED', completed_at = now() where id = r.id;
  if r.commission_amount > 0 then
    insert into public.ledger_entries (txn_id, kind, account, party_id, amount, service_request_id, memo, created_by)
    select t, 'service_settlement', x.account, x.party, x.amount, r.id, 'Serviço ' || r.code, auth.uid()
    from (select gen_random_uuid() t) g,
         (values ('store_receivable', r.store_id, r.commission_amount), ('platform_revenue', null::uuid, -r.commission_amount)) as x(account, party, amount);
  end if;
  insert into public.service_messages (request_id, author_id, author_kind, body) values (r.id, auth.uid(), 'system', 'Serviço concluído.');
end $$;

create function public.service_cancel(p_request_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); r public.service_requests%rowtype;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or not (r.customer_id is not distinct from v_uid or public.is_store_member(r.store_id) or public.is_admin()) then
    raise exception 'Pedido não encontrado';
  end if;
  if r.status in ('COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED') then raise exception 'Este pedido já foi encerrado'; end if;
  if coalesce(char_length(trim(p_reason)), 0) < 3 then raise exception 'Informe o motivo'; end if;
  update public.service_requests set status = 'CANCELLED', cancel_reason = trim(p_reason), cancelled_by = v_uid where id = r.id;
  insert into public.service_messages (request_id, author_id, author_kind, body) values (r.id, v_uid, 'system', 'Cancelado: ' || trim(p_reason));
end $$;

create function public.service_message(p_request_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); r public.service_requests%rowtype;
begin
  select * into r from public.service_requests where id = p_request_id;
  if not found or not public._can_see_service_request(r.id) then raise exception 'Pedido não encontrado'; end if;
  if r.status in ('CANCELLED', 'DECLINED', 'EXPIRED') or (r.status = 'COMPLETED' and r.completed_at < now() - interval '14 days') then
    raise exception 'Conversa encerrada';
  end if;
  if coalesce(char_length(trim(p_body)), 0) = 0 then raise exception 'Mensagem vazia'; end if;
  insert into public.service_messages (request_id, author_id, author_kind, body)
  values (r.id, v_uid, case when r.customer_id = v_uid then 'customer' when public.is_store_member(r.store_id) then 'provider' else 'admin' end, left(trim(p_body), 2000));
end $$;

-- Contato do cliente para o prestador: só depois do aceite da proposta.
create function public.service_customer_contact(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.service_requests%rowtype;
begin
  select * into r from public.service_requests where id = p_request_id;
  if not found or not (public.is_store_member(r.store_id) or public.is_admin()) then raise exception 'Pedido não encontrado'; end if;
  if r.status not in ('ACCEPTED', 'SCHEDULED', 'COMPLETED') then raise exception 'O contato aparece depois que o cliente aceitar a proposta'; end if;
  return jsonb_build_object('phone', r.customer_phone, 'address', r.address_line);
end $$;

create function public.service_rate(p_request_id uuid, p_rating int, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); r public.service_requests%rowtype;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or r.customer_id is distinct from v_uid then raise exception 'Pedido não encontrado'; end if;
  if r.status <> 'COMPLETED' then raise exception 'Avalie depois da conclusão'; end if;
  if r.rating is not null then raise exception 'Serviço já avaliado'; end if;
  if p_rating not between 1 and 5 then raise exception 'Nota de 1 a 5'; end if;
  update public.service_requests set rating = p_rating, rating_comment = nullif(left(trim(p_comment), 1000), '') where id = r.id;
  update public.stores s set rating_count = x.cnt, rating_avg = x.avg
  from (select count(*) cnt, round(avg(n)::numeric, 2) avg from (
          select store_rating n from public.reviews where store_id = r.store_id
          union all select rating from public.service_requests where store_id = r.store_id and rating is not null) t) x
  where s.id = r.store_id;
end $$;

-- Faturas passam a incluir as comissões de serviços concluídos no período.
create or replace function public.admin_generate_invoices(p_period_start date, p_period_end date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; ov public.invoices%rowtype; v_rows int;
begin
  perform public._require_admin();
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Período inválido'; end if;
  for r in
    with base as (
      select o.store_id, 1 as cnt, o.subtotal as gross,
             (select sum(l.amount) from public.ledger_entries l where l.order_id = o.id and l.account = 'store_receivable' and l.kind = 'order_settlement') as comm
      from public.orders o join public.stores s on s.id = o.store_id join public.cities c on c.id = s.city_id
      where o.status = 'DELIVERED' and o.payment_mode = 'offline'
        and (o.delivered_at at time zone c.timezone)::date between p_period_start and p_period_end
      union all
      select sr.store_id, 1, sr.quote_amount, sr.commission_amount
      from public.service_requests sr join public.stores s on s.id = sr.store_id join public.cities c on c.id = s.city_id
      where sr.status = 'COMPLETED' and (sr.completed_at at time zone c.timezone)::date between p_period_start and p_period_end)
    select store_id, sum(cnt) cnt, sum(gross) gross, sum(coalesce(comm, 0)) comm from base group by store_id
  loop
    select * into ov from public.invoices i
      where i.store_id = r.store_id and i.status <> 'void'
        and daterange(i.period_start, i.period_end, '[]') && daterange(p_period_start, p_period_end, '[]')
        and not (i.period_start = p_period_start and i.period_end = p_period_end)
      limit 1;
    if found then
      raise exception 'Já existe fatura que cobre parte deste período (de % a %). Use o mesmo período ou anule a fatura anterior.',
        to_char(ov.period_start, 'DD/MM/YYYY'), to_char(ov.period_end, 'DD/MM/YYYY');
    end if;
    insert into public.invoices (store_id, period_start, period_end, orders_count, gross_amount, commission_total)
    values (r.store_id, p_period_start, p_period_end, r.cnt, r.gross, r.comm)
    on conflict (store_id, period_start, period_end) do update
      set orders_count = excluded.orders_count, gross_amount = excluded.gross_amount, commission_total = excluded.commission_total
      where public.invoices.status = 'open';
    get diagnostics v_rows = row_count;
    n := n + v_rows;
  end loop;
  perform public._audit('generate_invoices', 'invoices', null, jsonb_build_object('start', p_period_start, 'end', p_period_end, 'stores', n));
  return n;
end $$;

-- Propostas vencidas expiram (agendado junto com os pedidos).
create function public.expire_service_quotes() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.service_requests set status = 'EXPIRED' where status = 'QUOTED' and quote_valid_until < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- 3. Configuração pública (o que o app precisa saber; nada sensível)
-- =====================================================================
create function public.public_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'online_payments_enabled', coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'online_payments_enabled'), false),
    'payment_sandbox', coalesce((select value #>> '{}' from public.platform_settings where key = 'payment_provider'), 'sandbox') = 'sandbox',
    'platform_delivery_enabled', coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'platform_delivery_enabled'), false),
    'refund_window_days', coalesce((select (value #>> '{}')::int from public.platform_settings where key = 'refund_window_days'), 7))
$$;

-- =====================================================================
-- 4. LGPD
-- =====================================================================
create table public.user_consents (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('terms', 'privacy', 'marketing', 'courier_location', 'courier_terms', 'partner_terms')),
  version    text not null check (char_length(version) between 1 and 20),
  granted    boolean not null,
  created_at timestamptz not null default now()
);
create index on public.user_consents (user_id, kind, created_at desc);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;
revoke all on sequence public.user_consents_id_seq from anon, authenticated;
grant select on public.user_consents to authenticated;
create policy consents_own on public.user_consents for select to authenticated using (user_id = auth.uid() or public.is_admin());

create function public.record_consent(p_kind text, p_version text, p_granted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_consents (user_id, kind, version, granted) values (public._uid(), p_kind, p_version, p_granted);
end $$;

-- Exportação dos dados do titular (art. 18, II e V da LGPD): tudo o que está ligado à conta, em JSON.
create function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v_uid uuid := public._uid();
begin
  return jsonb_build_object(
    'generated_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at) from auth.users u where u.id = v_uid),
    'profile', (select to_jsonb(p) - 'id' from public.profiles p where p.id = v_uid),
    'roles', (select coalesce(jsonb_agg(role), '[]') from public.user_roles where user_id = v_uid),
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a) - 'user_id'), '[]') from public.addresses a where a.user_id = v_uid),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('code', o.code, 'status', o.status, 'created_at', o.created_at, 'total', o.total,
                 'payment_method', o.payment_method, 'address_line', o.address_line, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
                 'items', (select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity, 'line_total', i.line_total)) from public.order_items i where i.order_id = o.id))
                 order by o.created_at), '[]') from public.orders o where o.customer_id = v_uid),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('store_rating', r.store_rating, 'comment', r.comment, 'created_at', r.created_at)), '[]') from public.reviews r where r.customer_id = v_uid),
    'favorites', (select coalesce(jsonb_agg(to_jsonb(f) - 'user_id'), '[]') from public.favorites f where f.user_id = v_uid),
    'service_requests', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'status', s.status, 'description', s.description, 'quote_amount', s.quote_amount, 'created_at', s.created_at)), '[]')
                         from public.service_requests s where s.customer_id = v_uid),
    'support_tickets', (select coalesce(jsonb_agg(jsonb_build_object('subject', t.subject, 'status', t.status, 'created_at', t.created_at,
                          'messages', (select jsonb_agg(jsonb_build_object('body', m.body, 'at', m.created_at)) from public.support_messages m where m.ticket_id = t.id and m.author_id = v_uid))), '[]')
                        from public.support_tickets t where t.user_id = v_uid),
    'courier', (select to_jsonb(c) - 'user_id' from public.couriers c where c.user_id = v_uid),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'version', version, 'granted', granted, 'at', created_at) order by created_at), '[]') from public.user_consents where user_id = v_uid));
end $$;

-- Exclusão da conta cobrindo serviços, suporte e entregador.
create or replace function public.delete_my_account() returns void
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
  if exists (select 1 from public.service_requests where customer_id = v_uid and status in ('ACCEPTED', 'SCHEDULED')) then
    raise exception 'Você tem um serviço agendado. Conclua ou cancele antes de excluir a conta.';
  end if;
  if exists (select 1 from public.ledger_entries where account = 'courier_payable' and party_id = v_uid having sum(amount) <> 0) then
    raise exception 'Você tem ganhos a receber. Fale com o suporte para o último repasse antes de excluir a conta.';
  end if;

  update public.orders set customer_id = null, customer_name = 'Cliente removido', customer_phone = null,
    address_line = null, address_reference = null, notes = null
  where customer_id = v_uid;
  update public.reviews set comment = null where customer_id = v_uid;
  update public.service_requests set customer_id = null, customer_name = 'Cliente removido', customer_phone = null, address_line = null,
    description = '[removido a pedido do titular]', rating_comment = null where customer_id = v_uid;
  update public.service_messages set body = '[removido]' where author_id = v_uid;
  update public.support_messages set body = '[removido]' where author_id = v_uid;
  update public.couriers set document = null, plate = null, last_lat = null, last_lng = null where user_id = v_uid;

  insert into public.audit_log (actor_id, action, entity, entity_id) values (null, 'account_deleted', 'user', null);
  delete from auth.users where id = v_uid;
end $$;

-- =====================================================================
-- 5. Permissões
-- =====================================================================
revoke execute on function public._validate_product_attributes(), public.admin_upsert_category(jsonb),
  public._can_see_service_request(uuid), public.request_service(uuid, uuid, text, text, text, text, uuid),
  public.service_quote(uuid, numeric, text, int), public.service_decline(uuid, text), public.service_accept_quote(uuid),
  public.service_schedule(uuid, timestamptz), public.service_complete(uuid), public.service_cancel(uuid, text),
  public.service_message(uuid, text), public.service_customer_contact(uuid), public.service_rate(uuid, int, text),
  public.admin_generate_invoices(date, date), public.expire_service_quotes(), public.public_config(),
  public.record_consent(text, text, boolean), public.export_my_data(), public.delete_my_account()
from public, anon, authenticated;
grant execute on function public._validate_product_attributes(), public.admin_upsert_category(jsonb), public._can_see_service_request(uuid),
  public.request_service(uuid, uuid, text, text, text, text, uuid), public.service_quote(uuid, numeric, text, int),
  public.service_decline(uuid, text), public.service_accept_quote(uuid), public.service_schedule(uuid, timestamptz),
  public.service_complete(uuid), public.service_cancel(uuid, text), public.service_message(uuid, text),
  public.service_customer_contact(uuid), public.service_rate(uuid, int, text), public.admin_generate_invoices(date, date),
  public.record_consent(text, text, boolean), public.export_my_data(), public.delete_my_account()
to authenticated;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.expire_service_quotes() to service_role;
