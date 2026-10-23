-- VizinhoMarket — ATUALIZAÇÃO 08: correções do servidor (23/10/2026).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Pré-requisito: 07 aplicado. Não apaga dados. Pode rodar de novo sem problema. Tudo ou nada: se der erro, nada é gravado.
begin;

-- ================= migrations/202610230001_correcoes_servidor.sql =================
-- VizinhoMarket — correções do servidor encontradas na revisão de 22/10/2026 (reproduzidas no banco de teste).
-- 1. Pedido sem itens (lista nula) era aceito.            → recusado.
-- 2. Pedido de R$ 0,00 era aceito.                        → recusado.
-- 3. O cliente via um total e o servidor cobrava outro, se o preço mudou no meio do caminho.
--                                                         → create_order recebe o total que o cliente viu e recusa se mudou (VMPRC),
--                                                           devolvendo os preços novos para o app atualizar o carrinho.
-- 4. Pix: a chave mostrada era a ATUAL da loja.           → a chave e o recebedor ficam guardados no pedido.
-- 5. Idade: o app não tinha onde confirmar; a confirmação era 1 clique sem data; a entrega não exigia conferir documento.
--                                                         → confirm_age(data de nascimento) exige 18+ e guarda só a data da confirmação;
--                                                           erro VMAGE para o app abrir a confirmação; confirm_delivery exige
--                                                           a conferência do documento em pedido +18.
-- 6. Faturas com períodos sobrepostos cobravam a mesma comissão duas vezes. → recusado.
-- 7. Fatura paga podia ser anulada ou reaberta.           → paga é definitiva.
-- 8. Chave de pedido repetida em outra loja devolvia o pedido antigo. → recusado com mensagem.
-- Não apaga dados. As funções antigas são trocadas pelas novas (mesmo nome). Pode rodar de novo.

-- ---------- Colunas novas ----------
alter table public.orders add column if not exists pix_key text;
alter table public.orders add column if not exists pix_receiver text;
alter table public.profiles add column if not exists age_confirmed_at timestamptz;

-- Pedidos Pix já existentes: guarda a chave atual da loja (é a que o cliente viu até hoje).
update public.orders o set pix_key = sp.pix_key, pix_receiver = coalesce(nullif(sp.legal_name, ''), sp.owner_name)
from public.store_private sp
where sp.store_id = o.store_id and o.payment_method = 'pix' and o.pix_key is null;

-- ---------- 5. Maioridade com data de nascimento ----------
drop function if exists public.confirm_age();
drop function if exists public.confirm_age(date);
create function public.confirm_age(p_birth_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._uid();
  if p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > current_date then
    raise exception 'Informe uma data de nascimento válida';
  end if;
  if p_birth_date > (current_date - interval '18 years')::date then
    raise exception 'Este item é vendido só para maiores de 18 anos' using errcode = 'VMAGE';
  end if;
  -- A data de nascimento não é guardada (LGPD: só o necessário). Fica registrado que a pessoa declarou ter 18+ e quando.
  update public.profiles set age_confirmed = true, age_confirmed_at = now() where id = public._uid();
end $$;

-- ---------- 1, 2, 3, 4, 5, 8. Pedido ----------
drop function if exists public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric);
drop function if exists public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric, numeric);
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
  p_change_for      numeric default null,
  p_expected_total  numeric default null   -- total que o cliente viu na tela; se mudou, o pedido não é criado
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._uid();
  v_existing uuid;
  v_existing_store uuid;
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
  v_pix text;
  v_receiver text;
  g record;
  v_cnt int;
begin
  -- Idempotência: mesma chave do mesmo cliente devolve o pedido já criado (só se for da mesma loja).
  select id, store_id into v_existing, v_existing_store from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing_store is distinct from p_store_id then
      raise exception 'Este pedido já foi enviado para outra loja. Atualize a página e tente de novo.';
    end if;
    return v_existing;
  end if;

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
      if a.neighborhood_id is null then raise exception 'Informe o bairro do endereço de entrega'; end if;
      select fee into v_fee from public.delivery_zones where store_id = s.id and neighborhood_id = a.neighborhood_id;
      if not found then raise exception 'A loja não entrega neste bairro'; end if;
    else
      v_fee := s.delivery_fee_default;
    end if;
  end if;

  -- Itens (lista nula também é recusada)
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'O pedido precisa ter entre 1 e 50 itens';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) is distinct from 'object' then raise exception 'Item inválido no pedido'; end if;
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

    -- Estoque (baixa atômica; variação tem prioridade sobre o produto). Se o pedido for recusado adiante, tudo volta.
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

  -- Restrição de idade pela categoria da loja ou pelo produto
  if exists (select 1 from public.categories c where c.id = s.category_id and c.age_restricted) then v_age := true; end if;
  if v_age and not exists (select 1 from public.profiles where id = v_uid and age_confirmed) then
    raise exception 'Confirme que você tem 18 anos ou mais para comprar este item' using errcode = 'VMAGE';
  end if;

  if v_subtotal <= 0 then
    raise exception 'O pedido precisa ter valor maior que zero';
  end if;
  if v_subtotal < s.min_order then
    raise exception 'Pedido mínimo desta loja: R$ %', to_char(s.min_order, 'FM999990D00');
  end if;

  -- O total que o cliente viu precisa ser o mesmo que será cobrado.
  if p_expected_total is not null and abs(p_expected_total - (v_subtotal + v_fee)) >= 0.01 then
    raise exception 'Os preços ou a taxa de entrega mudaram desde que você montou o carrinho. Confira o novo total e confirme de novo.'
      using errcode = 'VMPRC',
            detail = jsonb_build_object(
              'total', v_subtotal + v_fee, 'fee', v_fee,
              'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'product_id', l -> 'product_id', 'variant_id', l -> 'variant_id',
                  'addon_ids', (select coalesce(jsonb_agg(x -> 'id'), '[]') from jsonb_array_elements(l -> 'addons') x),
                  'unit', (l ->> 'unit_price')::numeric + (l ->> 'addons_total')::numeric)), '[]')
                from jsonb_array_elements(v_lines) l))::text;
  end if;

  if p_payment_method = 'cash' then
    if p_change_for is not null and p_change_for < v_subtotal + v_fee then raise exception 'Troco deve ser maior que o total'; end if;
  elsif p_change_for is not null then
    raise exception 'Troco só se aplica a pagamento em dinheiro';
  end if;

  -- Pix: chave e recebedor do momento do pedido (trocar a chave depois não muda pedidos já feitos).
  if p_payment_method = 'pix' then
    select sp.pix_key, coalesce(nullif(sp.legal_name, ''), sp.owner_name) into v_pix, v_receiver
      from public.store_private sp where sp.store_id = s.id;
  end if;

  v_rate := public._commission_rate(s.id);

  insert into public.orders (
    code, city_id, store_id, customer_id, status, fulfillment, payment_method, change_for,
    customer_name, customer_phone, address_line, address_reference, neighborhood_id, lat, lng,
    notes, age_check_required, subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key,
    pix_key, pix_receiver)
  values (
    public._new_order_code(), s.city_id, s.id, v_uid, 'CREATED', p_fulfillment, p_payment_method, p_change_for,
    trim(p_customer_name), trim(p_customer_phone),
    case when p_fulfillment = 'pickup' then null else a.line end,
    case when p_fulfillment = 'pickup' then null else a.reference end,
    case when p_fulfillment = 'pickup' then null else a.neighborhood_id end,
    case when p_fulfillment = 'pickup' then null else a.lat end,
    case when p_fulfillment = 'pickup' then null else a.lng end,
    nullif(trim(p_notes), ''), v_age, v_subtotal, v_fee, v_subtotal + v_fee, v_rate, round(v_subtotal * v_rate, 2), p_idempotency_key,
    v_pix, v_receiver)
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
    select id into v_existing from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key and store_id = p_store_id;
    if v_existing is not null then return v_existing; end if;
    raise;
end $$;

-- ---------- 4. Pix do pedido: a chave guardada no pedido ----------
create or replace function public.order_payment_info(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.orders%rowtype; sp public.store_private%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (o.customer_id = public._uid() or public.is_store_member(o.store_id) or public.is_admin()) then
    raise exception 'Pedido não encontrado';
  end if;
  if o.payment_method <> 'pix' then return null; end if;
  if o.pix_key is null then
    -- Pedido feito quando a loja ainda não tinha chave: mostra a atual (e é a única forma de o cliente pagar).
    select * into sp from public.store_private where store_id = o.store_id;
  end if;
  return jsonb_build_object(
    'pix_key', coalesce(o.pix_key, sp.pix_key),
    'receiver', coalesce(o.pix_receiver, nullif(sp.legal_name, ''), sp.owner_name),
    'amount', o.total
  );
end $$;

-- ---------- 5. Entrega de pedido +18 exige conferir o documento ----------
drop function if exists public.confirm_delivery(uuid, text);
drop function if exists public.confirm_delivery(uuid, text, boolean);
create function public.confirm_delivery(p_order_id uuid, p_code text, p_age_checked boolean default false) returns jsonb
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

  if o.age_check_required and not coalesce(p_age_checked, false) then
    raise exception 'Pedido com item para maiores de 18: confira um documento com foto e marque a conferência antes de entregar' using errcode = 'VMAGE';
  end if;

  select * into sec from public.order_secrets where order_id = o.id for update;
  if sec.attempts >= 5 then raise exception 'Muitas tentativas. Peça ajuda ao suporte.'; end if;
  if p_code is distinct from sec.delivery_code then
    update public.order_secrets set attempts = attempts + 1 where order_id = o.id;
    return jsonb_build_object('ok', false, 'attempts_left', 4 - sec.attempts);
  end if;

  update public.orders set status = 'DELIVERED', delivered_at = now() where id = o.id;
  perform public._log_order(o.id, 'DELIVERED', v_kind, case when o.age_check_required then 'Documento conferido (+18)' end);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 6. Faturas: um pedido entregue entra em uma fatura só ----------
create or replace function public.admin_generate_invoices(p_period_start date, p_period_end date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; ov public.invoices%rowtype; v_rows int;
begin
  perform public._require_admin();
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Período inválido'; end if;
  for r in
    select o.store_id, count(*) as cnt, sum(o.subtotal) as gross, sum(o.commission_amount) as comm
    from public.orders o
    join public.stores s on s.id = o.store_id
    join public.cities c on c.id = s.city_id
    where o.status = 'DELIVERED'
      and (o.delivered_at at time zone c.timezone)::date between p_period_start and p_period_end
    group by o.store_id
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

-- ---------- 7. Fatura paga é definitiva; anulada pode ser reaberta ----------
create or replace function public.admin_set_invoice_status(p_invoice_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cur text;
begin
  perform public._require_admin();
  if p_status not in ('open', 'paid', 'void') then raise exception 'Situação inválida'; end if;
  select status into v_cur from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  if v_cur = p_status then return; end if;
  if v_cur = 'paid' then raise exception 'Fatura paga não pode ser reaberta nem anulada'; end if;
  if v_cur = 'void' and p_status = 'paid' then raise exception 'Fatura anulada não pode ser marcada como paga: reabra e gere de novo'; end if;
  update public.invoices set status = p_status, paid_at = case when p_status = 'paid' then now() else null end where id = p_invoice_id;
  perform public._audit('set_invoice_status', 'invoices', p_invoice_id::text, jsonb_build_object('status', p_status, 'from', v_cur));
end $$;

-- ---------- Quem pode executar ----------
revoke execute on function public.confirm_age(date),
  public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric, numeric),
  public.confirm_delivery(uuid, text, boolean),
  public.order_payment_info(uuid), public.admin_generate_invoices(date, date), public.admin_set_invoice_status(uuid, text)
from public, anon;
grant execute on function public.confirm_age(date),
  public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric, numeric),
  public.confirm_delivery(uuid, text, boolean),
  public.order_payment_info(uuid), public.admin_generate_invoices(date, date), public.admin_set_invoice_status(uuid, text)
to authenticated;

commit;

-- Conferência: deve mostrar pix_no_pedido = true, idade_com_data = true, entrega_com_documento = true
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'pix_key') as pix_no_pedido,
       exists (select 1 from pg_proc where proname = 'confirm_age' and pronargs = 1) as idade_com_data,
       exists (select 1 from pg_proc where proname = 'confirm_delivery' and pronargs = 3) as entrega_com_documento;
