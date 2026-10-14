-- VizinhoMarket — regras de negócio no servidor
-- Toda função SECURITY DEFINER valida quem chama antes de agir.
-- Erros de negócio usam SQLSTATE 'P0001' (raise exception) com mensagem em português para exibir no app.
-- Conflitos (ex.: entrega já assumida) usam SQLSTATE 'VM409'.

-- ---------- Utilitários internos (sem execute para clientes) ----------
create function public._uid() returns uuid
language plpgsql stable set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;
  return v;
end $$;

create function public._audit(p_action text, p_entity text, p_entity_id text, p_data jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, data) values (auth.uid(), p_action, p_entity, p_entity_id, p_data)
$$;

create function public._setting_numeric(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::numeric from public.platform_settings where key = p_key
$$;

create function public._slugify(p text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(p,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'))
$$;

create function public._new_order_code() returns text
language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := 'VM-' || upper(substr(translate(encode(decode(md5(random()::text || clock_timestamp()::text), 'hex'), 'base64'), '+/=0O1Il', ''), 1, 5));
    exit when char_length(c) = 8 and not exists (select 1 from public.orders where code = c);
  end loop;
  return c;
end $$;

create function public._log_order(p_order uuid, p_status public.order_status, p_kind text, p_note text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.order_events (order_id, status, actor_id, actor_kind, note) values (p_order, p_status, auth.uid(), p_kind, p_note)
$$;

-- ---------- Loja aberta agora? (fuso da cidade; aceita horário que passa da meia-noite) ----------
create function public.is_store_open(p_store_id uuid, p_at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  tz text; loc timestamp; d int; t time;
begin
  select c.timezone into tz from public.stores s join public.cities c on c.id = s.city_id where s.id = p_store_id;
  if tz is null then return false; end if;
  loc := p_at at time zone tz;
  d := extract(dow from loc)::int;
  t := loc::time;
  return exists (
    select 1 from public.store_hours h
    where h.store_id = p_store_id and (
      (h.weekday = d and h.opens < h.closes and t >= h.opens and t < h.closes) or
      (h.weekday = d and h.opens > h.closes and t >= h.opens) or
      (h.weekday = (d + 6) % 7 and h.opens > h.closes and t < h.closes)
    )
  );
end $$;

-- ---------- Comissão aplicável ----------
create function public._commission_rate(p_store_id uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare r numeric; cat uuid; parent uuid;
begin
  select commission_rate, category_id into r, cat from public.stores where id = p_store_id;
  if r is not null then return r; end if;
  select rate into r from public.commission_rules where category_id = cat;
  if r is not null then return r; end if;
  select parent_id into parent from public.categories where id = cat;
  if parent is not null then
    select rate into r from public.commission_rules where category_id = parent;
    if r is not null then return r; end if;
  end if;
  r := public._setting_numeric('default_commission_rate');
  if r is null then raise exception 'Comissão padrão não configurada'; end if;
  return r;
end $$;

-- =====================================================================
-- CLIENTE
-- =====================================================================

-- Declaração de maioridade (necessária para itens com restrição de idade; conferida também na entrega).
create function public.confirm_age() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set age_confirmed = true where id = public._uid();
end $$;

-- Cria pedido. O cliente envia só o que escolheu; preços, taxas e totais vêm do banco.
-- p_items: [{"product_id": uuid, "variant_id": uuid|null, "quantity": number, "addon_ids": [uuid]}]
create function public.create_order(
  p_store_id        uuid,
  p_items           jsonb,
  p_fulfillment     public.fulfillment,
  p_payment_method  public.payment_method,
  p_idempotency_key text,
  p_customer_name   text,
  p_customer_phone  text,
  p_address_id      uuid    default null,
  p_notes           text    default null,
  p_change_for      numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._uid();
  v_existing uuid;
  s public.stores%rowtype;
  v_city_active boolean;
  a public.addresses%rowtype;
  v_fee numeric(10,2) := 0;
  v_has_zones boolean;
  it jsonb;
  pr public.products%rowtype;
  va public.product_variants%rowtype;
  v_qty numeric;
  v_unit_price numeric(10,2);
  v_addon_ids uuid[];
  v_addons jsonb;
  v_addons_total numeric(10,2);
  v_line numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_lines jsonb := '[]';
  v_age boolean := false;
  v_rate numeric;
  v_order uuid;
  g record;
  v_cnt int;
begin
  -- Idempotência: mesma chave do mesmo cliente devolve o pedido já criado.
  select id into v_existing from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 80 then
    raise exception 'Chave de idempotência inválida';
  end if;

  select * into s from public.stores where id = p_store_id;
  if not found or s.status <> 'approved' then raise exception 'Loja indisponível'; end if;
  select active into v_city_active from public.cities where id = s.city_id;
  if not v_city_active then raise exception 'Cidade ainda não atendida'; end if;
  if s.is_paused then raise exception 'A loja pausou os pedidos no momento'; end if;
  if not public.is_store_open(s.id) then raise exception 'A loja está fechada agora'; end if;

  -- Modalidade e endereço
  if p_fulfillment = 'pickup' then
    if not s.accepts_pickup then raise exception 'Esta loja não aceita retirada'; end if;
  else
    if p_fulfillment = 'store_delivery' and not s.accepts_store_delivery then raise exception 'Esta loja não faz entrega própria'; end if;
    if p_fulfillment = 'platform_delivery' and not s.accepts_platform_delivery then raise exception 'Entrega pela plataforma indisponível nesta loja'; end if;
    select * into a from public.addresses where id = p_address_id and user_id = v_uid;
    if not found then raise exception 'Endereço de entrega inválido'; end if;
    if a.city_id <> s.city_id then raise exception 'Endereço fora da cidade da loja'; end if;
    select exists (select 1 from public.delivery_zones where store_id = s.id) into v_has_zones;
    if v_has_zones then
      select fee into v_fee from public.delivery_zones where store_id = s.id and neighborhood_id = a.neighborhood_id;
      if not found then raise exception 'A loja não entrega neste bairro'; end if;
    else
      v_fee := s.delivery_fee_default;
    end if;
  end if;

  -- Itens
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'O pedido precisa ter entre 1 e 50 itens';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from public.products
      where id = (it ->> 'product_id')::uuid and store_id = s.id and deleted_at is null
      for update;
    if not found then raise exception 'Produto não encontrado nesta loja'; end if;
    if not pr.available then raise exception 'Produto indisponível: %', pr.name; end if;

    v_qty := (it ->> 'quantity')::numeric;
    if v_qty is null then raise exception 'Quantidade inválida para %', pr.name; end if;
    if pr.unit = 'un' and (v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 99) then
      raise exception 'Quantidade inválida para %', pr.name;
    end if;
    if pr.unit = 'kg' and (v_qty < 0.05 or v_qty > 50) then
      raise exception 'Peso inválido para %', pr.name;
    end if;

    -- Variação: obrigatória se o produto tiver variações disponíveis
    va := null;
    v_unit_price := pr.price;
    if it ->> 'variant_id' is not null then
      select * into va from public.product_variants where id = (it ->> 'variant_id')::uuid and product_id = pr.id for update;
      if not found or not va.available then raise exception 'Opção indisponível para %', pr.name; end if;
      v_unit_price := va.price;
    elsif exists (select 1 from public.product_variants where product_id = pr.id and available) then
      raise exception 'Escolha uma opção para %', pr.name;
    end if;

    -- Adicionais: pertencem ao produto, disponíveis, respeitam mínimo e máximo de cada grupo
    v_addon_ids := coalesce(array(select distinct x::uuid from jsonb_array_elements_text(coalesce(it -> 'addon_ids', '[]')) x), '{}');
    select count(*) into v_cnt from public.product_addons ad join public.product_addon_groups gr on gr.id = ad.group_id
      where ad.id = any(v_addon_ids) and gr.product_id = pr.id and ad.available;
    if v_cnt <> coalesce(array_length(v_addon_ids, 1), 0) then raise exception 'Adicional inválido para %', pr.name; end if;
    for g in
      select gr.id, gr.name, gr.min_select, gr.max_select,
             (select count(*) from public.product_addons ad where ad.group_id = gr.id and ad.id = any(v_addon_ids)) as chosen
      from public.product_addon_groups gr where gr.product_id = pr.id
    loop
      if g.chosen < g.min_select or g.chosen > g.max_select then
        raise exception 'Escolha entre % e % opção(ões) em "%" (%)', g.min_select, g.max_select, g.name, pr.name;
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price) order by ad.name), '[]'),
           coalesce(sum(ad.price), 0)
      into v_addons, v_addons_total
      from public.product_addons ad where ad.id = any(v_addon_ids);

    -- Estoque (baixa atômica; variação tem prioridade sobre o produto)
    if va.id is not null and va.stock is not null then
      update public.product_variants set stock = stock - v_qty where id = va.id and stock >= v_qty;
      if not found then raise exception 'Estoque insuficiente: % (%)', pr.name, va.name; end if;
    elsif pr.stock is not null then
      update public.products set stock = stock - v_qty where id = pr.id and stock >= v_qty;
      if not found then raise exception 'Estoque insuficiente: %', pr.name; end if;
    end if;

    if pr.age_restricted then v_age := true; end if;

    v_line := round((v_unit_price + v_addons_total) * v_qty, 2);
    v_subtotal := v_subtotal + v_line;
    v_lines := v_lines || jsonb_build_object(
      'product_id', pr.id, 'variant_id', va.id, 'name', pr.name, 'variant_name', va.name, 'unit', pr.unit,
      'unit_price', v_unit_price, 'quantity', v_qty, 'addons', v_addons, 'addons_total', v_addons_total, 'line_total', v_line);
  end loop;

  -- Restrição de idade pela categoria da loja
  if exists (select 1 from public.categories c where c.id = s.category_id and c.age_restricted) then v_age := true; end if;
  if v_age and not exists (select 1 from public.profiles where id = v_uid and age_confirmed) then
    raise exception 'Confirme que você tem 18 anos ou mais para comprar este item';
  end if;

  if v_subtotal < s.min_order then
    raise exception 'Pedido mínimo desta loja: R$ %', to_char(s.min_order, 'FM999990D00');
  end if;

  if p_payment_method = 'cash' then
    if p_change_for is not null and p_change_for < v_subtotal + v_fee then raise exception 'Troco deve ser maior que o total'; end if;
  elsif p_change_for is not null then
    raise exception 'Troco só se aplica a pagamento em dinheiro';
  end if;

  v_rate := public._commission_rate(s.id);

  insert into public.orders (
    code, city_id, store_id, customer_id, status, fulfillment, payment_method, change_for,
    customer_name, customer_phone, address_line, address_reference, neighborhood_id, lat, lng,
    notes, age_check_required, subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key)
  values (
    public._new_order_code(), s.city_id, s.id, v_uid, 'CREATED', p_fulfillment, p_payment_method, p_change_for,
    trim(p_customer_name), trim(p_customer_phone),
    case when p_fulfillment = 'pickup' then null else a.line end,
    case when p_fulfillment = 'pickup' then null else a.reference end,
    case when p_fulfillment = 'pickup' then null else a.neighborhood_id end,
    case when p_fulfillment = 'pickup' then null else a.lat end,
    case when p_fulfillment = 'pickup' then null else a.lng end,
    nullif(trim(p_notes), ''), v_age, v_subtotal, v_fee, v_subtotal + v_fee, v_rate, round(v_subtotal * v_rate, 2), p_idempotency_key)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, variant_id, name, variant_name, unit, unit_price, quantity, addons, addons_total, line_total)
  select v_order, (l ->> 'product_id')::uuid, (l ->> 'variant_id')::uuid, l ->> 'name', l ->> 'variant_name', l ->> 'unit',
         (l ->> 'unit_price')::numeric, (l ->> 'quantity')::numeric, l -> 'addons', (l ->> 'addons_total')::numeric, (l ->> 'line_total')::numeric
  from jsonb_array_elements(v_lines) l;

  insert into public.order_secrets (order_id, delivery_code) values (v_order, lpad((floor(random() * 10000))::int::text, 4, '0'));
  perform public._log_order(v_order, 'CREATED', 'customer');
  return v_order;
exception
  when unique_violation then
    -- Duas requisições simultâneas com a mesma chave: devolve o pedido que venceu.
    select id into v_existing from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key;
    if v_existing is not null then return v_existing; end if;
    raise;
end $$;

-- Devolve estoque de um pedido cancelado.
create function public._restock(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i record;
begin
  for i in select * from public.order_items where order_id = p_order loop
    if i.variant_id is not null and exists (select 1 from public.product_variants where id = i.variant_id and stock is not null) then
      update public.product_variants set stock = stock + i.quantity where id = i.variant_id;
    elsif i.product_id is not null then
      update public.products set stock = stock + i.quantity where id = i.product_id and stock is not null;
    end if;
  end loop;
end $$;

-- Cancelamento: cliente só antes do aceite; loja até ficar pronto; admin até a entrega.
create function public.cancel_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype; v_kind text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if o.status in ('DELIVERED', 'CANCELLED') then raise exception 'Este pedido já foi finalizado'; end if;

  if public.is_admin() then
    v_kind := 'admin';
  elsif public.is_store_member(o.store_id) then
    if o.status not in ('CREATED', 'ACCEPTED', 'PREPARING', 'READY') then raise exception 'O pedido já saiu para entrega'; end if;
    v_kind := 'partner';
  elsif o.customer_id = v_uid then
    if o.status <> 'CREATED' then raise exception 'A loja já aceitou o pedido. Fale com a loja para cancelar.'; end if;
    v_kind := 'customer';
  else
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if v_kind <> 'customer' and coalesce(char_length(trim(p_reason)), 0) < 3 then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  update public.orders set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_uid,
    cancel_reason = nullif(trim(p_reason), '') where id = o.id;
  perform public._restock(o.id);
  perform public._log_order(o.id, 'CANCELLED', v_kind, p_reason);
end $$;

-- Avaliação: só o cliente, pedido entregue, uma vez, até 14 dias.
create function public.rate_order(p_order_id uuid, p_store_rating int, p_courier_rating int default null, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.customer_id <> v_uid then raise exception 'Pedido não encontrado'; end if;
  if o.status <> 'DELIVERED' then raise exception 'Só é possível avaliar pedidos entregues'; end if;
  if o.delivered_at < now() - interval '14 days' then raise exception 'Prazo para avaliar encerrado'; end if;
  if p_store_rating not between 1 and 5 then raise exception 'Nota da loja deve ser de 1 a 5'; end if;
  if p_courier_rating is not null and (o.courier_id is null or p_courier_rating not between 1 and 5) then
    raise exception 'Nota do entregador inválida';
  end if;
  if exists (select 1 from public.reviews where order_id = o.id) then raise exception 'Pedido já avaliado'; end if;

  insert into public.reviews (order_id, customer_id, store_id, courier_id, store_rating, courier_rating, comment)
  values (o.id, v_uid, o.store_id, o.courier_id, p_store_rating, p_courier_rating, nullif(left(trim(p_comment), 1000), ''));

  update public.stores s set
    rating_count = r.cnt, rating_avg = r.avg
  from (select count(*) cnt, round(avg(store_rating)::numeric, 2) avg from public.reviews where store_id = o.store_id) r
  where s.id = o.store_id;
end $$;

-- =====================================================================
-- COMÉRCIO
-- =====================================================================

create function public.register_store(
  p_name text, p_category_id uuid, p_city_id uuid,
  p_owner_name text, p_owner_phone text, p_document text,
  p_legal_name text default null, p_description text default null, p_phone_public text default null,
  p_address_line text default null, p_neighborhood_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); v_store uuid; v_slug text; n int := 0;
begin
  if (select count(*) from public.stores where created_by = v_uid and status = 'pending') >= 3 then
    raise exception 'Você já tem cadastros aguardando aprovação';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and active) then raise exception 'Categoria inválida'; end if;
  if not exists (select 1 from public.cities where id = p_city_id) then raise exception 'Cidade inválida'; end if;
  if p_neighborhood_id is not null and not exists (select 1 from public.neighborhoods where id = p_neighborhood_id and city_id = p_city_id) then
    raise exception 'Bairro inválido';
  end if;
  if coalesce(char_length(regexp_replace(p_document, '\D', '', 'g')), 0) not in (11, 14) then
    raise exception 'Informe um CPF ou CNPJ válido';
  end if;

  v_slug := public._slugify(p_name);
  while exists (select 1 from public.stores where slug = v_slug || case when n = 0 then '' else '-' || n end) loop n := n + 1; end loop;
  if n > 0 then v_slug := v_slug || '-' || n; end if;

  insert into public.stores (city_id, category_id, name, slug, description, phone_public, address_line, neighborhood_id, created_by)
  values (p_city_id, p_category_id, trim(p_name), v_slug, p_description, p_phone_public, p_address_line, p_neighborhood_id, v_uid)
  returning id into v_store;
  insert into public.store_members (store_id, user_id, role) values (v_store, v_uid, 'owner');
  insert into public.store_private (store_id, legal_name, document, owner_name, owner_phone)
  values (v_store, p_legal_name, regexp_replace(p_document, '\D', '', 'g'), p_owner_name, p_owner_phone);
  perform public._audit('register_store', 'stores', v_store::text);
  return v_store;
end $$;

-- Avança status pelo comércio. Entregue e cancelado têm funções próprias.
create function public.advance_order_status(p_order_id uuid, p_target public.order_status, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_admin boolean := public.is_admin(); v_ok boolean;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not (public.is_store_member(o.store_id) or v_admin) then raise exception 'Sem permissão' using errcode = '42501'; end if;

  v_ok := case
    when o.status = 'CREATED'   and p_target = 'ACCEPTED'  then true
    when o.status = 'ACCEPTED'  and p_target in ('PREPARING', 'READY') then true
    when o.status = 'PREPARING' and p_target = 'READY'     then true
    when o.status = 'READY'     and p_target = 'IN_TRANSIT' and o.fulfillment = 'store_delivery' then true
    else false end;
  if not v_ok then
    raise exception 'Mudança de status não permitida: % → %', o.status, p_target using errcode = 'VM409';
  end if;

  update public.orders set status = p_target,
    accepted_at  = case when p_target = 'ACCEPTED'   then now() else accepted_at end,
    ready_at     = case when p_target = 'READY'      then now() else ready_at end,
    picked_up_at = case when p_target = 'IN_TRANSIT' then now() else picked_up_at end
  where id = o.id;
  perform public._log_order(o.id, p_target, case when v_admin and not public.is_store_member(o.store_id) then 'admin' else 'partner' end, p_note);
end $$;

-- =====================================================================
-- ENTREGADOR
-- =====================================================================

create function public.apply_as_courier(p_city_id uuid, p_vehicle text, p_plate text, p_document text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid();
begin
  if exists (select 1 from public.couriers where user_id = v_uid) then raise exception 'Cadastro de entregador já enviado'; end if;
  if not exists (select 1 from public.cities where id = p_city_id) then raise exception 'Cidade inválida'; end if;
  if coalesce(char_length(regexp_replace(p_document, '\D', '', 'g')), 0) <> 11 then raise exception 'Informe um CPF válido'; end if;
  insert into public.couriers (user_id, city_id, vehicle, plate, document)
  values (v_uid, p_city_id, p_vehicle, upper(p_plate), regexp_replace(p_document, '\D', '', 'g'));
  perform public._audit('apply_as_courier', 'couriers', v_uid::text);
end $$;

create function public._require_courier() returns public.couriers
language plpgsql stable security definer set search_path = public as $$
declare c public.couriers%rowtype;
begin
  select * into c from public.couriers where user_id = public._uid();
  if not found or c.status <> 'approved' or not public.has_role('courier') then
    raise exception 'Cadastro de entregador não aprovado' using errcode = '42501';
  end if;
  return c;
end $$;

-- Corridas disponíveis: sem endereço do cliente nem telefone até o aceite.
create function public.list_available_deliveries()
returns table (order_id uuid, code text, store_name text, store_address text, store_neighborhood text,
               customer_neighborhood text, delivery_fee numeric, items_count bigint, ready_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier();
begin
  return query
  select o.id, o.code, s.name, s.address_line, ns.name, nc.name, o.delivery_fee,
         (select count(*) from public.order_items i where i.order_id = o.id), o.ready_at
  from public.orders o
  join public.stores s on s.id = o.store_id
  left join public.neighborhoods ns on ns.id = s.neighborhood_id
  left join public.neighborhoods nc on nc.id = o.neighborhood_id
  where o.city_id = c.city_id and o.status = 'READY' and o.fulfillment = 'platform_delivery' and o.courier_id is null
  order by o.ready_at;
end $$;

-- Aceite atômico: se dois entregadores tentarem juntos, só um consegue.
create function public.claim_delivery(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier(); v_id uuid;
begin
  if (select count(*) from public.orders where courier_id = c.user_id and status = 'IN_TRANSIT') >= 2 then
    raise exception 'Finalize suas entregas em andamento antes de aceitar outra';
  end if;
  update public.orders set courier_id = c.user_id, status = 'IN_TRANSIT', picked_up_at = now()
  where id = p_order_id and city_id = c.city_id and status = 'READY'
    and fulfillment = 'platform_delivery' and courier_id is null
  returning id into v_id;
  if v_id is null then raise exception 'Esta entrega já foi assumida ou não está disponível' using errcode = 'VM409'; end if;
  perform public._log_order(v_id, 'IN_TRANSIT', 'courier');
end $$;

-- Entregador desiste antes de entregar: volta para a fila.
create function public.release_delivery(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier(); v_id uuid;
begin
  if coalesce(char_length(trim(p_reason)), 0) < 3 then raise exception 'Informe o motivo'; end if;
  update public.orders set courier_id = null, status = 'READY', picked_up_at = null
  where id = p_order_id and courier_id = c.user_id and status = 'IN_TRANSIT'
  returning id into v_id;
  if v_id is null then raise exception 'Entrega não encontrada'; end if;
  perform public._log_order(v_id, 'READY', 'courier', 'Entregador liberou: ' || p_reason);
end $$;

-- Confirmação com o código de 4 dígitos do cliente. Não lança erro em código errado
-- (para que a contagem de tentativas seja gravada); devolve {ok, attempts_left}.
create function public.confirm_delivery(p_order_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype; sec public.order_secrets%rowtype; v_kind text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if o.fulfillment = 'platform_delivery' and o.courier_id = v_uid and o.status = 'IN_TRANSIT' then
    perform public._require_courier(); v_kind := 'courier';
  elsif o.fulfillment = 'store_delivery' and o.status = 'IN_TRANSIT' and public.is_store_member(o.store_id) then
    v_kind := 'partner';
  elsif o.fulfillment = 'pickup' and o.status = 'READY' and public.is_store_member(o.store_id) then
    v_kind := 'partner';
  else
    raise exception 'Você não pode confirmar esta entrega agora' using errcode = '42501';
  end if;

  select * into sec from public.order_secrets where order_id = o.id for update;
  if sec.attempts >= 5 then raise exception 'Muitas tentativas. Peça ajuda ao suporte.'; end if;
  if p_code is distinct from sec.delivery_code then
    update public.order_secrets set attempts = attempts + 1 where order_id = o.id;
    return jsonb_build_object('ok', false, 'attempts_left', 4 - sec.attempts);
  end if;

  update public.orders set status = 'DELIVERED', delivered_at = now() where id = o.id;
  perform public._log_order(o.id, 'DELIVERED', v_kind);
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- ADMIN
-- =====================================================================

create function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._uid();
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador' using errcode = '42501'; end if;
end $$;

create function public.admin_set_store_status(p_store_id uuid, p_status public.store_status, p_commission_rate numeric default null, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.stores set status = p_status,
    commission_rate = coalesce(p_commission_rate, commission_rate),
    approved_at = case when p_status = 'approved' and approved_at is null then now() else approved_at end
  where id = p_store_id;
  if not found then raise exception 'Loja não encontrada'; end if;
  if p_status = 'approved' then
    insert into public.user_roles (user_id, role, granted_by)
    select user_id, 'partner', auth.uid() from public.store_members where store_id = p_store_id
    on conflict do nothing;
  end if;
  perform public._audit('set_store_status', 'stores', p_store_id::text,
    jsonb_build_object('status', p_status, 'commission_rate', p_commission_rate, 'reason', p_reason));
end $$;

create function public.admin_set_courier_status(p_user_id uuid, p_status public.courier_status, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.couriers set status = p_status,
    approved_at = case when p_status = 'approved' and approved_at is null then now() else approved_at end,
    is_online = case when p_status = 'approved' then is_online else false end
  where user_id = p_user_id;
  if not found then raise exception 'Entregador não encontrado'; end if;
  if p_status = 'approved' then
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'courier', auth.uid()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = 'courier';
  end if;
  perform public._audit('set_courier_status', 'couriers', p_user_id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

create function public.admin_set_commission_rule(p_category_id uuid, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.commission_rules (category_id, rate) values (p_category_id, p_rate)
  on conflict (category_id) do update set rate = excluded.rate, updated_at = now();
  perform public._audit('set_commission_rule', 'commission_rules', p_category_id::text, jsonb_build_object('rate', p_rate));
end $$;

create function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public._audit('set_setting', 'platform_settings', p_key, p_value);
end $$;

-- ---------- Quem pode executar o quê ----------
-- O Supabase concede EXECUTE por padrão em funções novas: retirar tudo e devolver só o permitido.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_admin(), public.has_role(public.app_role), public.is_store_member(uuid), public.is_store_owner(uuid),
  public.is_store_public(uuid), public.product_store(uuid), public.addon_group_store(uuid),
  public.is_store_open(uuid, timestamptz)
to anon, authenticated;

grant execute on function
  public.confirm_age(),
  public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric),
  public.cancel_order(uuid, text),
  public.rate_order(uuid, int, int, text),
  public.register_store(text, uuid, uuid, text, text, text, text, text, text, text, uuid),
  public.advance_order_status(uuid, public.order_status, text),
  public.apply_as_courier(uuid, text, text, text),
  public.list_available_deliveries(),
  public.claim_delivery(uuid),
  public.release_delivery(uuid, text),
  public.confirm_delivery(uuid, text),
  public.admin_set_store_status(uuid, public.store_status, numeric, text),
  public.admin_set_courier_status(uuid, public.courier_status, text),
  public.admin_set_commission_rule(uuid, numeric),
  public.admin_set_setting(text, jsonb)
to authenticated;
