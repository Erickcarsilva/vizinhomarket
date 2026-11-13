-- VizinhoMarket — módulo financeiro (13/11/2026)
--  * pagamento online (Pix/cartão pelo gateway) separado do pedido: tabela payments, várias tentativas por pedido;
--  * webhooks idempotentes (payment_webhook_events): o mesmo evento processado duas vezes não muda nada;
--  * razão contábil imutável (ledger_entries): toda movimentação em lançamentos que somam zero, sem update/delete;
--  * pagamento offline (Pix direto à loja, dinheiro, cartão na entrega) com confirmação de recebimento pela loja;
--  * cupons validados no servidor, com limite total/por pessoa e quem custeia o desconto (plataforma ou loja);
--  * estornos (automáticos no cancelamento de pedido pago online; pedidos do cliente decididos pelo admin);
--  * repasses, conciliação com o extrato do gateway e suporte/disputas.
-- O navegador nunca define valores nem marca pagamento: só funções do servidor e o serviço de pagamentos (service_role).

-- =====================================================================
-- 1. Colunas novas
-- =====================================================================
alter table public.orders add column if not exists payment_mode text not null default 'offline'
  check (payment_mode in ('offline', 'online'));
alter table public.orders add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending', 'awaiting_payment', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded'));
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists payment_confirmed_by uuid references auth.users(id);
alter table public.orders add column if not exists discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0);
alter table public.orders add column if not exists discount_funded_by text check (discount_funded_by in ('platform', 'store'));
alter table public.orders add column if not exists coupon_id uuid;
alter table public.orders add column if not exists courier_fee numeric(10,2) not null default 0 check (courier_fee >= 0);
alter table public.orders add column if not exists refunded_amount numeric(10,2) not null default 0 check (refunded_amount >= 0);

-- Tipo de categoria: produtos (carrinho e entrega) ou serviços (orçamento e agendamento).
alter table public.categories add column if not exists kind text not null default 'goods' check (kind in ('goods', 'services'));
update public.categories set kind = 'services' where slug = 'servicos';

-- Loja habilitada para receber online: só o admin liga, depois de a conta de recebedor no gateway estar aprovada.
alter table public.stores add column if not exists accepts_online_payment boolean not null default false;
grant select (accepts_online_payment) on public.stores to anon, authenticated;

-- Conta de recebedor da loja no gateway (split). Nunca pública.
alter table public.store_private add column if not exists gateway_provider text;
alter table public.store_private add column if not exists gateway_recipient_id text;

insert into public.platform_settings (key, value) values
  ('online_payments_enabled', 'false'::jsonb),      -- liga o pagamento online no app (depois do gateway configurado)
  ('payment_provider', '"sandbox"'::jsonb),          -- sandbox | mercadopago | asaas | pagarme
  ('online_payment_timeout_min', '30'::jsonb),      -- pedido online não pago é cancelado depois disso
  ('courier_fee_share', '1'::jsonb),                -- parte da taxa de entrega que vai para o entregador da plataforma
  ('refund_window_days', '7'::jsonb)                -- prazo para o cliente pedir reembolso depois da entrega
on conflict (key) do nothing;

-- =====================================================================
-- 2. Cupons
-- =====================================================================
create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description      text check (char_length(description) <= 200),
  store_id         uuid references public.stores(id) on delete cascade,  -- null = vale em todas as lojas
  city_id          uuid references public.cities(id),
  kind             text not null check (kind in ('percent', 'fixed', 'free_delivery')),
  value            numeric(10,2) not null default 0 check (value >= 0),
  max_discount     numeric(10,2) check (max_discount > 0),
  min_subtotal     numeric(10,2) not null default 0 check (min_subtotal >= 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  max_redemptions  int check (max_redemptions > 0),
  per_user_limit   int not null default 1 check (per_user_limit > 0),
  first_order_only boolean not null default false,
  funded_by        text not null check (funded_by in ('platform', 'store')),
  active           boolean not null default true,
  redemptions      int not null default 0,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  check (kind <> 'percent' or (value > 0 and value <= 100)),
  check (kind <> 'fixed' or value > 0),
  check (store_id is not null or funded_by = 'platform'),
  check (ends_at is null or ends_at > starts_at)
);
create unique index coupons_code_scope on public.coupons (upper(code), coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.coupon_redemptions (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons(id),
  order_id   uuid not null unique references public.orders(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  amount     numeric(10,2) not null,
  released   boolean not null default false,   -- pedido cancelado devolve o uso do cupom
  created_at timestamptz not null default now()
);
create index on public.coupon_redemptions (coupon_id, user_id) where not released;
alter table public.orders add constraint orders_coupon_fk foreign key (coupon_id) references public.coupons(id);

-- =====================================================================
-- 3. Pagamentos e webhooks
-- =====================================================================
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id),
  provider            text not null,
  provider_payment_id text,
  method              text not null check (method in ('pix', 'card_online')),
  amount              numeric(10,2) not null check (amount > 0),
  status              text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'review')),
  pix_copy_paste      text,
  pix_qr_base64       text,
  checkout_url        text,
  expires_at          timestamptz,
  paid_amount         numeric(10,2),
  refunded_amount     numeric(10,2) not null default 0,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz,
  unique (provider, provider_payment_id)
);
create index on public.payments (order_id, created_at desc);
create trigger trg_payments_touch before update on public.payments for each row execute function public.touch_updated_at();

create table public.payment_webhook_events (
  id           bigint generated always as identity primary key,
  provider     text not null,
  event_id     text not null,
  payload      jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  result       text,
  unique (provider, event_id)
);

-- =====================================================================
-- 4. Razão contábil imutável
--    Convenção: valor positivo = débito, negativo = crédito. Cada lançamento (txn_id) soma zero.
--    Contas: gateway_clearing (dinheiro no gateway/banco da plataforma), customer_prepaid (pago pelo cliente, ainda não
--    entregue), store_payable (a pagar à loja), store_receivable (a receber da loja: comissão de pedidos offline),
--    courier_payable (a pagar ao entregador), platform_revenue, platform_discount_expense, platform_refund_expense,
--    platform_gateway_fees, platform_cash (recebimentos de faturas), adjustment.
-- =====================================================================
create table public.ledger_entries (
  id         bigint generated always as identity primary key,
  txn_id     uuid not null,
  kind       text not null,
  account    text not null check (account in ('gateway_clearing', 'customer_prepaid', 'store_payable', 'store_receivable',
                 'courier_payable', 'platform_revenue', 'platform_discount_expense', 'platform_refund_expense',
                 'platform_gateway_fees', 'platform_cash', 'adjustment')),
  party_id   uuid,             -- loja (store_*) ou entregador (courier_*)
  amount     numeric(12,2) not null check (amount <> 0),
  order_id   uuid references public.orders(id),
  payment_id uuid references public.payments(id),
  refund_id  uuid,
  payout_id  uuid,
  invoice_id uuid references public.invoices(id),
  memo       text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.ledger_entries (txn_id);
create index on public.ledger_entries (account, party_id);
create index on public.ledger_entries (order_id);
-- Um pedido só é liquidado uma vez; um pagamento só é registrado como recebido uma vez.
create unique index ledger_once_settlement on public.ledger_entries (order_id, account, coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind = 'order_settlement';
create unique index ledger_once_payment on public.ledger_entries (payment_id, account) where kind = 'payment_received';

create function public._ledger_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'Lançamentos financeiros não podem ser alterados nem apagados. Faça um lançamento de ajuste.' using errcode = '42501';
end $$;
create trigger trg_ledger_immutable before update or delete on public.ledger_entries
  for each row execute function public._ledger_immutable();

-- Lança um conjunto de linhas que precisa somar zero. lines: [{account, party_id?, amount}]
create function public._ledger_post(p_kind text, p_lines jsonb, p_order uuid default null, p_payment uuid default null,
  p_refund uuid default null, p_payout uuid default null, p_invoice uuid default null, p_memo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_txn uuid := gen_random_uuid(); v_sum numeric; l jsonb;
begin
  select coalesce(sum(round((x ->> 'amount')::numeric, 2)), 0) into v_sum from jsonb_array_elements(p_lines) x;
  if v_sum <> 0 then raise exception 'Lançamento desbalanceado (%): soma %', p_kind, v_sum; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if round((l ->> 'amount')::numeric, 2) <> 0 then
      insert into public.ledger_entries (txn_id, kind, account, party_id, amount, order_id, payment_id, refund_id, payout_id, invoice_id, memo, created_by)
      values (v_txn, p_kind, l ->> 'account', (l ->> 'party_id')::uuid, round((l ->> 'amount')::numeric, 2),
              p_order, p_payment, p_refund, p_payout, p_invoice, p_memo, auth.uid());
    end if;
  end loop;
  return v_txn;
end $$;

-- =====================================================================
-- 5. Estornos, repasses, extrato do gateway, suporte
-- =====================================================================
create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id),
  payment_id         uuid references public.payments(id),
  mode               text not null check (mode in ('gateway', 'offline')),
  amount             numeric(10,2) not null check (amount > 0),
  reason             text not null check (char_length(reason) between 3 and 500),
  status             text not null default 'requested'
    check (status in ('requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected')),
  charged_to         text check (charged_to in ('store', 'platform')),
  requested_by       uuid references auth.users(id),
  decided_by         uuid references auth.users(id),
  decision_note      text,
  provider_refund_id text,
  failure_reason     text,
  attempts           int not null default 0,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  completed_at       timestamptz
);
create index on public.refunds (status);
create index on public.refunds (order_id);

create table public.payouts (
  id          uuid primary key default gen_random_uuid(),
  party_kind  text not null check (party_kind in ('store', 'courier')),
  party_id    uuid not null,
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null check (method in ('pix', 'ted', 'gateway_split')),
  reference   text not null check (char_length(reference) between 3 and 120),
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table public.provider_settlements (
  id                  bigint generated always as identity primary key,
  provider            text not null,
  provider_payment_id text not null,
  gross               numeric(12,2) not null,
  fee                 numeric(12,2) not null default 0,
  net                 numeric(12,2) not null,
  settled_on          date not null,
  batch               text,
  imported_by         uuid,
  imported_at         timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  order_id   uuid references public.orders(id),
  store_id   uuid references public.stores(id),
  kind       text not null check (kind in ('support', 'refund', 'dispute', 'delivery', 'account', 'other')),
  subject    text not null check (char_length(subject) between 3 and 120),
  status     text not null default 'open' check (status in ('open', 'waiting_customer', 'waiting_store', 'resolved', 'closed')),
  refund_id  uuid references public.refunds(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.support_tickets (user_id, created_at desc);
create index on public.support_tickets (status, created_at);
create trigger trg_tickets_touch before update on public.support_tickets for each row execute function public.touch_updated_at();

create table public.support_messages (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('customer', 'partner', 'courier', 'admin', 'system')),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index on public.support_messages (ticket_id, id);

-- =====================================================================
-- 6. Acesso (RLS). Escrita só por função.
-- =====================================================================
alter table public.coupons                enable row level security;
alter table public.coupon_redemptions     enable row level security;
alter table public.payments               enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.ledger_entries         enable row level security;
alter table public.refunds                enable row level security;
alter table public.payouts                enable row level security;
alter table public.provider_settlements   enable row level security;
alter table public.support_tickets        enable row level security;
alter table public.support_messages       enable row level security;

revoke all on public.coupons, public.coupon_redemptions, public.payments, public.payment_webhook_events, public.ledger_entries,
  public.refunds, public.payouts, public.provider_settlements, public.support_tickets, public.support_messages
  from anon, authenticated;
revoke all on sequence public.ledger_entries_id_seq, public.payment_webhook_events_id_seq,
  public.provider_settlements_id_seq, public.support_messages_id_seq from anon, authenticated;

-- Cupons: o código não é listado publicamente (evita "garimpar" cupons). Loja vê os seus; admin vê todos.
grant select on public.coupons to authenticated;
create policy coupons_read on public.coupons for select to authenticated
  using (public.is_admin() or (store_id is not null and public.is_store_member(store_id)));

-- Pagamentos: cliente do pedido, equipe da loja e admin. Sem dados de cartão: o gateway guarda.
grant select (id, order_id, provider, method, amount, status, pix_copy_paste, pix_qr_base64, checkout_url, expires_at,
              paid_amount, refunded_amount, failure_reason, created_at, paid_at) on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_store_member(o.store_id)))
  or public.is_admin());

grant select on public.payment_webhook_events, public.provider_settlements, public.payouts to authenticated;
create policy webhooks_admin on public.payment_webhook_events for select to authenticated using (public.is_admin());
create policy settlements_admin on public.provider_settlements for select to authenticated using (public.is_admin());
create policy payouts_read on public.payouts for select to authenticated using (
  public.is_admin() or (party_kind = 'store' and public.is_store_owner(party_id)) or (party_kind = 'courier' and party_id = auth.uid()));

-- Razão: admin vê tudo; dono vê as linhas da própria loja; entregador vê as suas.
grant select on public.ledger_entries to authenticated;
create policy ledger_read on public.ledger_entries for select to authenticated using (
  public.is_admin()
  or (account in ('store_payable', 'store_receivable') and public.is_store_owner(party_id))
  or (account = 'courier_payable' and party_id = auth.uid()));

grant select on public.refunds to authenticated;
create policy refunds_read on public.refunds for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_store_member(o.store_id))));

grant select on public.support_tickets, public.support_messages to authenticated;
create function public._can_see_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.support_tickets t where t.id = p_ticket and (
    t.user_id = auth.uid() or public.is_admin()
    or (t.store_id is not null and t.kind in ('dispute', 'refund', 'delivery') and public.is_store_member(t.store_id))))
$$;
create policy tickets_read on public.support_tickets for select to authenticated using (public._can_see_ticket(id));
create policy ticket_messages_read on public.support_messages for select to authenticated using (public._can_see_ticket(ticket_id));

-- =====================================================================
-- 7. Cupom: cálculo do desconto (uso interno)
-- =====================================================================
create function public._coupon_discount(p_coupon public.coupons, p_store public.stores, p_uid uuid, p_subtotal numeric, p_fee numeric)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v numeric; v_used int;
begin
  if not p_coupon.active then raise exception 'Cupom inativo' using errcode = 'VMCPN'; end if;
  if now() < p_coupon.starts_at then raise exception 'Este cupom ainda não começou a valer' using errcode = 'VMCPN'; end if;
  if p_coupon.ends_at is not null and now() >= p_coupon.ends_at then raise exception 'Cupom expirado' using errcode = 'VMCPN'; end if;
  if p_coupon.store_id is not null and p_coupon.store_id <> p_store.id then raise exception 'Cupom não vale nesta loja' using errcode = 'VMCPN'; end if;
  if p_coupon.city_id is not null and p_coupon.city_id <> p_store.city_id then raise exception 'Cupom não vale nesta cidade' using errcode = 'VMCPN'; end if;
  if p_subtotal < p_coupon.min_subtotal then
    raise exception 'Cupom válido para pedidos a partir de R$ %', to_char(p_coupon.min_subtotal, 'FM999990D00') using errcode = 'VMCPN';
  end if;
  if p_coupon.max_redemptions is not null and p_coupon.redemptions >= p_coupon.max_redemptions then
    raise exception 'Este cupom esgotou' using errcode = 'VMCPN';
  end if;
  select count(*) into v_used from public.coupon_redemptions where coupon_id = p_coupon.id and user_id = p_uid and not released;
  if v_used >= p_coupon.per_user_limit then raise exception 'Você já usou este cupom' using errcode = 'VMCPN'; end if;
  if p_coupon.first_order_only and exists (select 1 from public.orders where customer_id = p_uid and status <> 'CANCELLED') then
    raise exception 'Cupom válido só no primeiro pedido' using errcode = 'VMCPN';
  end if;

  v := case p_coupon.kind
         when 'percent' then round(p_subtotal * p_coupon.value / 100, 2)
         when 'fixed' then p_coupon.value
         when 'free_delivery' then p_fee
       end;
  if p_coupon.kind = 'free_delivery' and p_fee <= 0 then raise exception 'Este pedido não tem taxa de entrega' using errcode = 'VMCPN'; end if;
  if p_coupon.max_discount is not null then v := least(v, p_coupon.max_discount); end if;
  -- Desconto nunca maior que o pedido (o total nunca fica negativo nem zero por cupom em produto).
  v := least(v, case when p_coupon.kind = 'free_delivery' then p_fee else p_subtotal end);
  return greatest(v, 0);
end $$;

-- =====================================================================
-- 8. Pedido (substitui create_order): cupom e pagamento online/offline
-- =====================================================================
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
  p_expected_total  numeric default null,
  p_payment_mode    text    default 'offline',
  p_coupon_code     text    default null
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
  cp public.coupons%rowtype;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2);
  v_comm_base numeric(10,2);
  v_courier_fee numeric(10,2) := 0;
begin
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
  if exists (select 1 from public.categories c where c.id = s.category_id and c.kind = 'services') then
    raise exception 'Serviços são contratados por orçamento, não pelo carrinho';
  end if;

  -- Pagamento: combinações válidas
  if p_payment_mode not in ('offline', 'online') then raise exception 'Forma de pagamento inválida'; end if;
  if p_payment_mode = 'online' then
    if p_payment_method not in ('pix', 'card_online') then raise exception 'Forma de pagamento online inválida'; end if;
    if coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'online_payments_enabled'), false) is not true then
      raise exception 'Pagamento pelo app ainda não está disponível';
    end if;
    if not s.accepts_online_payment then raise exception 'Esta loja ainda não recebe pagamento pelo app'; end if;
  elsif p_payment_method = 'card_online' then
    raise exception 'Cartão online só pode ser pago pelo app';
  end if;

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

    va := null;
    v_unit_price := pr.price;
    if it ->> 'variant_id' is not null then
      select * into va from public.product_variants where id = (it ->> 'variant_id')::uuid and product_id = pr.id for update;
      if not found or not va.available then raise exception 'Opção indisponível para %', pr.name; end if;
      v_unit_price := va.price;
    elsif exists (select 1 from public.product_variants where product_id = pr.id and available) then
      raise exception 'Escolha uma opção para %', pr.name;
    end if;

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

  if exists (select 1 from public.categories c where c.id = s.category_id and c.age_restricted) then v_age := true; end if;
  if v_age and not exists (select 1 from public.profiles where id = v_uid and age_confirmed) then
    raise exception 'Confirme que você tem 18 anos ou mais para comprar este item' using errcode = 'VMAGE';
  end if;

  if v_subtotal <= 0 then raise exception 'O pedido precisa ter valor maior que zero'; end if;
  if v_subtotal < s.min_order then
    raise exception 'Pedido mínimo desta loja: R$ %', to_char(s.min_order, 'FM999990D00');
  end if;

  -- Cupom (linha travada: dois pedidos simultâneos não estouram o limite)
  if nullif(trim(p_coupon_code), '') is not null then
    select * into cp from public.coupons
      where upper(code) = upper(trim(p_coupon_code)) and (store_id = s.id or store_id is null)
      order by store_id nulls last limit 1
      for update;
    if not found then raise exception 'Cupom não encontrado' using errcode = 'VMCPN'; end if;
    v_discount := public._coupon_discount(cp, s, v_uid, v_subtotal, v_fee);
  end if;

  v_total := v_subtotal + v_fee - v_discount;
  if v_total <= 0 then raise exception 'O pedido precisa ter valor maior que zero'; end if;

  if p_expected_total is not null and abs(p_expected_total - v_total) >= 0.01 then
    raise exception 'Os preços ou a taxa de entrega mudaram desde que você montou o carrinho. Confira o novo total e confirme de novo.'
      using errcode = 'VMPRC',
            detail = jsonb_build_object(
              'total', v_total, 'fee', v_fee, 'discount', v_discount,
              'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'product_id', l -> 'product_id', 'variant_id', l -> 'variant_id',
                  'addon_ids', (select coalesce(jsonb_agg(x -> 'id'), '[]') from jsonb_array_elements(l -> 'addons') x),
                  'unit', (l ->> 'unit_price')::numeric + (l ->> 'addons_total')::numeric)), '[]')
                from jsonb_array_elements(v_lines) l))::text;
  end if;

  if p_payment_method = 'cash' then
    if p_change_for is not null and p_change_for < v_total then raise exception 'Troco deve ser maior que o total'; end if;
  elsif p_change_for is not null then
    raise exception 'Troco só se aplica a pagamento em dinheiro';
  end if;

  if p_payment_method = 'pix' and p_payment_mode = 'offline' then
    select sp.pix_key, coalesce(nullif(sp.legal_name, ''), sp.owner_name) into v_pix, v_receiver
      from public.store_private sp where sp.store_id = s.id;
  end if;

  -- Comissão sobre o que a loja efetivamente vende: desconto bancado pela loja reduz a base; o da plataforma, não.
  v_rate := public._commission_rate(s.id);
  v_comm_base := v_subtotal - case when cp.id is not null and cp.funded_by = 'store' and cp.kind <> 'free_delivery' then v_discount else 0 end;
  if p_fulfillment = 'platform_delivery' then
    v_courier_fee := round(v_fee * coalesce(public._setting_numeric('courier_fee_share'), 1), 2);
  end if;

  insert into public.orders (
    code, city_id, store_id, customer_id, status, fulfillment, payment_method, change_for,
    customer_name, customer_phone, address_line, address_reference, neighborhood_id, lat, lng,
    notes, age_check_required, subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key,
    pix_key, pix_receiver, payment_mode, payment_status, discount_amount, discount_funded_by, coupon_id, courier_fee)
  values (
    public._new_order_code(), s.city_id, s.id, v_uid, 'CREATED', p_fulfillment, p_payment_method, p_change_for,
    trim(p_customer_name), trim(p_customer_phone),
    case when p_fulfillment = 'pickup' then null else a.line end,
    case when p_fulfillment = 'pickup' then null else a.reference end,
    case when p_fulfillment = 'pickup' then null else a.neighborhood_id end,
    case when p_fulfillment = 'pickup' then null else a.lat end,
    case when p_fulfillment = 'pickup' then null else a.lng end,
    nullif(trim(p_notes), ''), v_age, v_subtotal, v_fee, v_total, v_rate, round(v_comm_base * v_rate, 2), p_idempotency_key,
    v_pix, v_receiver, p_payment_mode, case when p_payment_mode = 'online' then 'awaiting_payment' else 'pending' end,
    v_discount, case when v_discount > 0 then cp.funded_by end, case when v_discount > 0 then cp.id end, v_courier_fee)
  returning id into v_order;

  if v_discount > 0 then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, amount) values (cp.id, v_order, v_uid, v_discount);
    update public.coupons set redemptions = redemptions + 1 where id = cp.id;
  end if;

  insert into public.order_items (order_id, product_id, variant_id, name, variant_name, unit, unit_price, quantity, addons, addons_total, line_total)
  select v_order, (l ->> 'product_id')::uuid, (l ->> 'variant_id')::uuid, l ->> 'name', l ->> 'variant_name', l ->> 'unit',
         (l ->> 'unit_price')::numeric, (l ->> 'quantity')::numeric, l -> 'addons', (l ->> 'addons_total')::numeric, (l ->> 'line_total')::numeric
  from jsonb_array_elements(v_lines) l;

  insert into public.order_secrets (order_id, delivery_code) values (v_order, lpad((floor(random() * 10000))::int::text, 4, '0'));
  perform public._log_order(v_order, 'CREATED', 'customer');
  return v_order;
exception
  when unique_violation then
    select id into v_existing from public.orders where customer_id = v_uid and idempotency_key = p_idempotency_key and store_id = p_store_id;
    if v_existing is not null then return v_existing; end if;
    raise;
end $$;

-- Simulação do pedido para a tela de finalização: roda create_order de verdade e desfaz tudo.
-- Assim o total mostrado é calculado pelo mesmo código que cobra (sem uma segunda regra de preço no navegador).
create function public.quote_order(
  p_store_id uuid, p_items jsonb, p_fulfillment public.fulfillment, p_payment_method public.payment_method,
  p_address_id uuid default null, p_payment_mode text default 'offline', p_coupon_code text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; r jsonb;
begin
  perform public._uid();
  begin
    v_id := public.create_order(p_store_id, p_items, p_fulfillment, p_payment_method,
      'quote-' || gen_random_uuid()::text, 'Simulação', '00000000', p_address_id, null, null, null, p_payment_mode, p_coupon_code);
    select jsonb_build_object('subtotal', subtotal, 'delivery_fee', delivery_fee, 'discount', discount_amount,
                              'total', total, 'coupon_applied', coupon_id is not null)
      into r from public.orders where id = v_id;
    raise exception using errcode = 'VMQOT';
  exception when sqlstate 'VMQOT' then
    null; -- desfeito: nada gravado, estoque intacto
  end;
  return r;
end $$;

-- =====================================================================
-- 9. Status do pedido: online só é aceito depois de pago
-- =====================================================================
create or replace function public.advance_order_status(p_order_id uuid, p_target public.order_status, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_admin boolean := public.is_admin(); v_ok boolean;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not (public.is_store_member(o.store_id) or v_admin) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if o.payment_mode = 'online' and o.payment_status <> 'paid' then
    raise exception 'Aguardando a confirmação do pagamento online' using errcode = 'VM409';
  end if;

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

-- Pedido online aguardando pagamento: o cliente pode desistir. Pago e não aceito: também (o estorno é automático).
create or replace function public.cancel_order(p_order_id uuid, p_reason text) returns void
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

-- =====================================================================
-- 10. Efeitos financeiros das mudanças do pedido (gatilho: vale para qualquer função que mude o status)
-- =====================================================================
create function public._order_financial_effects() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_disc_store numeric := 0; v_disc_plat numeric := 0;
  v_fee_store numeric := 0; v_fee_plat numeric := 0; v_plat_fee_cut numeric := 0;
  v_store_net numeric; v_lines jsonb; v_pay uuid; v_refundable numeric;
begin
  -- Cancelado: devolve o uso do cupom; se foi pago online, cria o estorno integral (executado pelo serviço de pagamentos).
  if new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    update public.coupon_redemptions set released = true where order_id = new.id and not released;
    update public.coupons c set redemptions = greatest(redemptions - 1, 0)
      where c.id = new.coupon_id and exists (select 1 from public.coupon_redemptions r where r.order_id = new.id);
    if new.payment_mode = 'online' then
      if new.payment_status = 'paid' then
        select id into v_pay from public.payments where order_id = new.id and status = 'paid' order by paid_at desc limit 1;
        v_refundable := new.total - new.refunded_amount;
        if v_refundable > 0 and not exists (select 1 from public.refunds where order_id = new.id and status not in ('rejected', 'failed')) then
          insert into public.refunds (order_id, payment_id, mode, amount, reason, status, charged_to, decided_at)
          values (new.id, v_pay, 'gateway', v_refundable, 'Pedido cancelado: ' || coalesce(new.cancel_reason, 'sem motivo'), 'approved',
                  case when new.accepted_at is null then 'platform' else 'store' end, now());
        end if;
      elsif new.payment_status = 'awaiting_payment' then
        new.payment_status := 'expired';
        update public.payments set status = 'cancelled' where order_id = new.id and status in ('created', 'pending');
      end if;
    end if;
  end if;

  -- Entregue: liquida o pedido no razão (uma vez só).
  if new.status = 'DELIVERED' and old.status <> 'DELIVERED' then
    if new.discount_funded_by = 'store' then v_disc_store := new.discount_amount; else v_disc_plat := new.discount_amount; end if;
    if new.fulfillment = 'platform_delivery' then
      v_fee_plat := new.delivery_fee; v_plat_fee_cut := new.delivery_fee - new.courier_fee;
    else
      v_fee_store := new.delivery_fee;
    end if;
    v_store_net := new.subtotal - v_disc_store - new.commission_amount + v_fee_store;

    if new.payment_mode = 'online' then
      -- O dinheiro está com a plataforma (pré-pago): reparte entre loja, plataforma e entregador.
      v_lines := jsonb_build_array(
        jsonb_build_object('account', 'customer_prepaid', 'amount', new.total),
        jsonb_build_object('account', 'platform_discount_expense', 'amount', v_disc_plat),
        jsonb_build_object('account', 'store_payable', 'party_id', new.store_id, 'amount', -v_store_net),
        jsonb_build_object('account', 'platform_revenue', 'amount', -(new.commission_amount + v_plat_fee_cut)),
        jsonb_build_object('account', 'courier_payable', 'party_id', new.courier_id, 'amount', -new.courier_fee));
    else
      -- O dinheiro ficou com a loja: ela passa a dever comissão + entrega da plataforma − desconto bancado pela plataforma.
      v_lines := jsonb_build_array(
        jsonb_build_object('account', 'store_receivable', 'party_id', new.store_id,
                           'amount', new.commission_amount + v_fee_plat - v_disc_plat),
        jsonb_build_object('account', 'platform_discount_expense', 'amount', v_disc_plat),
        jsonb_build_object('account', 'platform_revenue', 'amount', -(new.commission_amount + v_plat_fee_cut)),
        jsonb_build_object('account', 'courier_payable', 'party_id', new.courier_id, 'amount', -new.courier_fee));
    end if;
    perform public._ledger_post('order_settlement', v_lines, new.id, null, null, null, null, 'Pedido ' || new.code);
  end if;
  return new;
end $$;
create trigger trg_orders_financial before update of status on public.orders
  for each row when (new.status is distinct from old.status) execute function public._order_financial_effects();

-- =====================================================================
-- 11. Pagamento offline: a loja confirma que recebeu (Pix direto, dinheiro, cartão na entrega)
-- =====================================================================
create function public.confirm_offline_payment(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not (public.is_store_member(o.store_id) or public.is_admin()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if o.payment_mode <> 'offline' then raise exception 'Pagamento online é confirmado pelo banco, não pela loja'; end if;
  if o.status = 'CANCELLED' then raise exception 'Pedido cancelado'; end if;
  if o.payment_status = 'paid' then return; end if;
  update public.orders set payment_status = 'paid', paid_at = now(), payment_confirmed_by = auth.uid() where id = o.id;
  perform public._audit('confirm_offline_payment', 'orders', o.id::text, jsonb_build_object('method', o.payment_method, 'total', o.total));
end $$;

-- =====================================================================
-- 12. Serviço de pagamentos (somente service_role: Edge Function com a chave secreta)
-- =====================================================================
-- Começa (ou reaproveita) uma cobrança online. O valor vem do pedido, nunca de quem chama.
create function public.svc_payment_begin(p_order_id uuid, p_user_id uuid, p_provider text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; p public.payments%rowtype; v_timeout numeric;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.customer_id is distinct from p_user_id then raise exception 'Pedido não encontrado'; end if;
  if o.payment_mode <> 'online' then raise exception 'Este pedido é pago na entrega ou direto à loja'; end if;
  if o.status = 'CANCELLED' then raise exception 'Pedido cancelado'; end if;
  if o.payment_status = 'paid' then raise exception 'Pedido já pago' using errcode = 'VM409'; end if;

  -- Reaproveita a cobrança pendente ainda válida (evita gerar dois Pix para o mesmo pedido).
  select * into p from public.payments
    where order_id = o.id and status in ('created', 'pending') and provider = p_provider
      and (expires_at is null or expires_at > now() + interval '1 minute')
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('payment_id', p.id, 'reuse', p.provider_payment_id is not null, 'amount', p.amount,
      'method', p.method, 'order_code', o.code, 'provider_payment_id', p.provider_payment_id,
      'pix_copy_paste', p.pix_copy_paste, 'pix_qr_base64', p.pix_qr_base64, 'checkout_url', p.checkout_url, 'expires_at', p.expires_at);
  end if;

  if (select count(*) from public.payments where order_id = o.id) >= 10 then
    raise exception 'Muitas tentativas de pagamento para este pedido. Fale com o suporte.';
  end if;
  v_timeout := coalesce(public._setting_numeric('online_payment_timeout_min'), 30);
  insert into public.payments (order_id, provider, method, amount, status, expires_at)
  values (o.id, p_provider, o.payment_method::text, o.total, 'created', o.created_at + make_interval(mins => v_timeout::int))
  returning * into p;
  update public.orders set payment_status = 'awaiting_payment' where id = o.id and payment_status in ('failed', 'expired', 'awaiting_payment');
  return jsonb_build_object('payment_id', p.id, 'reuse', false, 'amount', p.amount, 'method', p.method, 'order_code', o.code,
    'expires_at', p.expires_at, 'customer_name', o.customer_name);
end $$;

-- Guarda o que o gateway devolveu ao criar a cobrança (id, QR do Pix, link do checkout).
create function public.svc_payment_attach(p_payment_id uuid, p_provider_payment_id text, p_pix_copy_paste text default null,
  p_pix_qr_base64 text default null, p_checkout_url text default null, p_expires_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payments set provider_payment_id = p_provider_payment_id, status = 'pending',
    pix_copy_paste = p_pix_copy_paste, pix_qr_base64 = p_pix_qr_base64, checkout_url = p_checkout_url,
    expires_at = coalesce(p_expires_at, expires_at)
  where id = p_payment_id and status in ('created', 'pending');
  if not found then raise exception 'Pagamento não encontrado ou já finalizado'; end if;
end $$;

-- Marca a tentativa como falha ao criar (gateway fora do ar etc.).
create function public.svc_payment_fail(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payments set status = 'failed', failure_reason = left(p_reason, 300) where id = p_payment_id and status in ('created', 'pending');
end $$;

-- Aplica o status consultado no gateway. Idempotente pelo id do evento.
-- p_status: pending | paid | failed | expired | cancelled. O valor pago é conferido com o valor do pedido.
create function public.svc_payment_apply(p_provider text, p_provider_payment_id text, p_status text, p_paid_amount numeric,
  p_event_id text, p_payload jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype; o public.orders%rowtype; v_new_event int; v_result text;
begin
  insert into public.payment_webhook_events (provider, event_id, payload) values (p_provider, p_event_id, p_payload)
  on conflict (provider, event_id) do nothing;
  get diagnostics v_new_event = row_count;
  if v_new_event = 0 and exists (select 1 from public.payment_webhook_events where provider = p_provider and event_id = p_event_id and processed_at is not null) then
    return 'duplicate';
  end if;

  select * into p from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id for update;
  if not found then
    v_result := 'unknown_payment';
  else
    select * into o from public.orders where id = p.order_id for update;
    if p_status = 'paid' then
      if p.status = 'paid' then
        v_result := 'already_paid';
      elsif p_paid_amount is null or abs(p_paid_amount - p.amount) >= 0.01 then
        update public.payments set status = 'review', paid_amount = p_paid_amount,
          failure_reason = 'Valor pago diferente do cobrado' where id = p.id;
        perform public._audit('payment_amount_mismatch', 'payments', p.id::text, jsonb_build_object('expected', p.amount, 'paid', p_paid_amount));
        v_result := 'amount_mismatch';
      else
        update public.payments set status = 'paid', paid_amount = p_paid_amount, paid_at = now() where id = p.id;
        perform public._ledger_post('payment_received', jsonb_build_array(
          jsonb_build_object('account', 'gateway_clearing', 'amount', p.amount),
          jsonb_build_object('account', 'customer_prepaid', 'amount', -p.amount)), o.id, p.id, null, null, null, 'Pagamento ' || o.code);
        if o.status = 'CANCELLED' or o.payment_status = 'paid' then
          -- Pago depois do cancelamento (ou pagamento em dobro): devolve automaticamente.
          insert into public.refunds (order_id, payment_id, mode, amount, reason, status, charged_to, decided_at)
          values (o.id, p.id, 'gateway', p.amount, 'Pagamento recebido para pedido cancelado ou já pago', 'approved', 'platform', now());
          v_result := 'paid_refund_created';
        else
          update public.orders set payment_status = 'paid', paid_at = now() where id = o.id;
          perform public._log_order(o.id, o.status, 'system', 'Pagamento online confirmado');
          v_result := 'paid';
        end if;
      end if;
    elsif p_status in ('failed', 'expired', 'cancelled') then
      if p.status in ('created', 'pending') then
        update public.payments set status = p_status where id = p.id;
        if o.payment_status = 'awaiting_payment' and not exists (select 1 from public.payments where order_id = o.id and status in ('created', 'pending')) then
          update public.orders set payment_status = case when p_status = 'failed' then 'failed' else 'expired' end where id = o.id;
        end if;
        v_result := p_status;
      else
        v_result := 'ignored_' || p.status;
      end if;
    else
      v_result := 'pending';
    end if;
  end if;

  update public.payment_webhook_events set processed_at = now(), result = v_result where provider = p_provider and event_id = p_event_id;
  return v_result;
end $$;

-- Estornos aprovados aguardando execução no gateway (a Edge Function busca e executa).
create function public.svc_refunds_to_process(p_limit int default 20)
returns table (refund_id uuid, provider text, provider_payment_id text, amount numeric, payment_amount numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select r.id from public.refunds r
    where r.mode = 'gateway' and (r.status = 'approved' or (r.status = 'processing' and r.decided_at < now() - interval '10 minutes'))
      and r.attempts < 5
    order by r.created_at limit p_limit for update skip locked)
  update public.refunds r set status = 'processing', attempts = r.attempts + 1
  from picked, public.payments p
  where r.id = picked.id and p.id = r.payment_id
  returning r.id, p.provider, p.provider_payment_id, r.amount, p.amount;
end $$;

-- Resultado do estorno no gateway.
create function public.svc_refund_result(p_refund_id uuid, p_ok boolean, p_provider_refund_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.refunds%rowtype; o public.orders%rowtype; v_total_ref numeric;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'Estorno não encontrado'; end if;
  if r.status = 'succeeded' then return; end if;
  if not p_ok then
    update public.refunds set status = case when attempts >= 5 then 'failed' else 'approved' end, failure_reason = left(p_error, 300) where id = r.id;
    return;
  end if;
  update public.refunds set status = 'succeeded', provider_refund_id = p_provider_refund_id, completed_at = now(), failure_reason = null where id = r.id;
  select * into o from public.orders where id = r.order_id for update;
  v_total_ref := o.refunded_amount + r.amount;
  update public.orders set refunded_amount = v_total_ref,
    payment_status = case when v_total_ref >= o.total then 'refunded' else 'partially_refunded' end where id = o.id;
  update public.payments set refunded_amount = refunded_amount + r.amount,
    status = case when refunded_amount + r.amount >= amount then 'refunded' else 'partially_refunded' end where id = r.payment_id;

  if o.status = 'DELIVERED' then
    -- Depois de liquidado: quem arca é a loja (desconta do que ela tem a receber) ou a plataforma.
    perform public._ledger_post('refund', jsonb_build_array(
      jsonb_build_object('account', case when r.charged_to = 'store' then 'store_payable' else 'platform_refund_expense' end,
                         'party_id', case when r.charged_to = 'store' then o.store_id end, 'amount', r.amount),
      jsonb_build_object('account', 'gateway_clearing', 'amount', -r.amount)), o.id, r.payment_id, r.id, null, null, 'Estorno ' || o.code);
  else
    -- Antes da entrega: o dinheiro ainda era do cliente.
    perform public._ledger_post('refund', jsonb_build_array(
      jsonb_build_object('account', 'customer_prepaid', 'amount', r.amount),
      jsonb_build_object('account', 'gateway_clearing', 'amount', -r.amount)), o.id, r.payment_id, r.id, null, null, 'Estorno ' || o.code);
  end if;
end $$;

-- =====================================================================
-- 13. Cliente: reembolso e suporte
-- =====================================================================
create function public.open_ticket(p_kind text, p_subject text, p_message text, p_order_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype; v_id uuid; v_kind text := 'customer';
begin
  if p_kind not in ('support', 'dispute', 'delivery', 'account', 'other') then raise exception 'Tipo de atendimento inválido'; end if;
  if (select count(*) from public.support_tickets where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Muitos atendimentos abertos hoje. Aguarde a resposta dos anteriores.';
  end if;
  if p_order_id is not null then
    select * into o from public.orders where id = p_order_id;
    if not found or not (o.customer_id is not distinct from v_uid or o.courier_id is not distinct from v_uid or public.is_store_member(o.store_id)) then
      raise exception 'Pedido não encontrado';
    end if;
    if public.is_store_member(o.store_id) and o.customer_id is distinct from v_uid then v_kind := 'partner';
    elsif o.courier_id is not distinct from v_uid then v_kind := 'courier'; end if;
  end if;
  insert into public.support_tickets (user_id, order_id, store_id, kind, subject)
  values (v_uid, p_order_id, o.store_id, p_kind, trim(p_subject)) returning id into v_id;
  insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_id, v_uid, v_kind, trim(p_message));
  return v_id;
end $$;

create function public.post_ticket_message(p_ticket_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); t public.support_tickets%rowtype; v_kind text;
begin
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if not found or not public._can_see_ticket(t.id) then raise exception 'Atendimento não encontrado'; end if;
  if t.status = 'closed' then raise exception 'Atendimento encerrado. Abra um novo, se precisar.'; end if;
  v_kind := case when public.is_admin() and t.user_id <> v_uid then 'admin'
                 when t.user_id = v_uid then 'customer' else 'partner' end;
  insert into public.support_messages (ticket_id, author_id, author_kind, body) values (t.id, v_uid, v_kind, trim(p_body));
  update public.support_tickets set status = case when v_kind = 'admin' then 'waiting_customer' when t.status in ('resolved', 'waiting_customer') then 'open' else t.status end
    where id = t.id;
end $$;

create function public.request_refund(p_order_id uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype; v_ref uuid; v_pay uuid; v_days numeric; v_ticket uuid; v_pending numeric;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.customer_id is distinct from v_uid then raise exception 'Pedido não encontrado'; end if;
  if o.status <> 'DELIVERED' then raise exception 'Pedidos não entregues são cancelados, não reembolsados'; end if;
  v_days := coalesce(public._setting_numeric('refund_window_days'), 7);
  if o.delivered_at < now() - make_interval(days => v_days::int) then raise exception 'Prazo para pedir reembolso encerrado'; end if;
  if coalesce(char_length(trim(p_reason)), 0) < 10 then raise exception 'Conte o que aconteceu (pelo menos 10 letras)'; end if;
  select coalesce(sum(amount), 0) into v_pending from public.refunds where order_id = o.id and status not in ('rejected', 'failed');
  if p_amount is null or p_amount <= 0 or p_amount > o.total - v_pending then
    raise exception 'Valor de reembolso inválido (máximo R$ %)', to_char(o.total - v_pending, 'FM999990D00');
  end if;
  if o.payment_mode = 'online' then
    select id into v_pay from public.payments where order_id = o.id and status in ('paid', 'partially_refunded') order by paid_at desc limit 1;
  end if;
  insert into public.refunds (order_id, payment_id, mode, amount, reason, status, requested_by)
  values (o.id, v_pay, case when o.payment_mode = 'online' then 'gateway' else 'offline' end, p_amount, trim(p_reason), 'requested', v_uid)
  returning id into v_ref;
  insert into public.support_tickets (user_id, order_id, store_id, kind, subject, refund_id)
  values (v_uid, o.id, o.store_id, 'refund', 'Reembolso do pedido ' || o.code, v_ref) returning id into v_ticket;
  insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_ticket, v_uid, 'customer', trim(p_reason));
  return v_ref;
end $$;

-- =====================================================================
-- 14. Cupons: criação pelo admin (qualquer) e pela loja (só da própria loja, bancado por ela)
-- =====================================================================
create function public.upsert_coupon(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := (p ->> 'id')::uuid; v_store uuid := (p ->> 'store_id')::uuid; v_admin boolean := public.is_admin(); c public.coupons%rowtype;
begin
  perform public._uid();
  if not v_admin then
    if v_store is null or not public.is_store_owner(v_store) then raise exception 'Sem permissão' using errcode = '42501'; end if;
    if coalesce(p ->> 'funded_by', 'store') <> 'store' then raise exception 'Cupom da loja é bancado pela loja'; end if;
  end if;
  if v_id is not null then
    select * into c from public.coupons where id = v_id for update;
    if not found or (not v_admin and c.store_id is distinct from v_store) then raise exception 'Cupom não encontrado'; end if;
    update public.coupons set
      description = p ->> 'description', kind = p ->> 'kind', value = coalesce((p ->> 'value')::numeric, 0),
      max_discount = (p ->> 'max_discount')::numeric, min_subtotal = coalesce((p ->> 'min_subtotal')::numeric, 0),
      starts_at = coalesce((p ->> 'starts_at')::timestamptz, starts_at), ends_at = (p ->> 'ends_at')::timestamptz,
      max_redemptions = (p ->> 'max_redemptions')::int, per_user_limit = coalesce((p ->> 'per_user_limit')::int, 1),
      first_order_only = coalesce((p ->> 'first_order_only')::boolean, false), active = coalesce((p ->> 'active')::boolean, true)
    where id = v_id;
  else
    insert into public.coupons (code, description, store_id, city_id, kind, value, max_discount, min_subtotal, starts_at, ends_at,
      max_redemptions, per_user_limit, first_order_only, funded_by, active, created_by)
    values (upper(trim(p ->> 'code')), p ->> 'description', v_store, (p ->> 'city_id')::uuid, p ->> 'kind',
      coalesce((p ->> 'value')::numeric, 0), (p ->> 'max_discount')::numeric, coalesce((p ->> 'min_subtotal')::numeric, 0),
      coalesce((p ->> 'starts_at')::timestamptz, now()), (p ->> 'ends_at')::timestamptz, (p ->> 'max_redemptions')::int,
      coalesce((p ->> 'per_user_limit')::int, 1), coalesce((p ->> 'first_order_only')::boolean, false),
      case when v_admin then coalesce(p ->> 'funded_by', 'platform') else 'store' end, coalesce((p ->> 'active')::boolean, true), auth.uid())
    returning id into v_id;
  end if;
  perform public._audit('upsert_coupon', 'coupons', v_id::text, p);
  return v_id;
exception when unique_violation then
  raise exception 'Já existe um cupom com este código';
end $$;

-- =====================================================================
-- 15. Admin: estornos, repasses, conciliação, ajustes, saldos, suporte
-- =====================================================================
create function public.admin_decide_refund(p_refund_id uuid, p_approve boolean, p_amount numeric default null,
  p_charged_to text default 'store', p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.refunds%rowtype;
begin
  perform public._require_admin();
  if coalesce(char_length(trim(p_note)), 0) < 5 then raise exception 'Escreva a justificativa da decisão'; end if;
  select * into r from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'Reembolso não encontrado'; end if;
  if r.status <> 'requested' then raise exception 'Este reembolso já foi decidido'; end if;
  if p_charged_to not in ('store', 'platform') then raise exception 'Informe quem arca com o reembolso'; end if;
  if p_amount is not null and (p_amount <= 0 or p_amount > r.amount) then raise exception 'Valor aprovado inválido'; end if;
  update public.refunds set
    status = case when not p_approve then 'rejected' when mode = 'offline' then 'succeeded' else 'approved' end,
    amount = coalesce(p_amount, amount), charged_to = p_charged_to, decided_by = auth.uid(), decided_at = now(),
    decision_note = trim(p_note), completed_at = case when p_approve and mode = 'offline' then now() end
  where id = r.id;
  update public.support_tickets set status = 'resolved' where refund_id = r.id;
  perform public._audit('decide_refund', 'refunds', r.id::text, jsonb_build_object('approve', p_approve, 'amount', coalesce(p_amount, r.amount), 'charged_to', p_charged_to, 'note', p_note));
end $$;

create function public.admin_record_payout(p_party_kind text, p_party_id uuid, p_amount numeric, p_method text, p_reference text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_balance numeric; v_acc text := case when p_party_kind = 'store' then 'store_payable' else 'courier_payable' end;
begin
  perform public._require_admin();
  if p_party_kind not in ('store', 'courier') then raise exception 'Tipo de recebedor inválido'; end if;
  -- Saldo a pagar: créditos (negativos) na conta do recebedor.
  select -coalesce(sum(amount), 0) into v_balance from public.ledger_entries where account = v_acc and party_id = p_party_id;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor inválido'; end if;
  if p_amount > v_balance then raise exception 'Valor maior que o saldo a pagar (R$ %)', to_char(v_balance, 'FM999990D00'); end if;
  insert into public.payouts (party_kind, party_id, amount, method, reference, note, created_by)
  values (p_party_kind, p_party_id, p_amount, p_method, trim(p_reference), p_note, auth.uid()) returning id into v_id;
  perform public._ledger_post('payout', jsonb_build_array(
    jsonb_build_object('account', v_acc, 'party_id', p_party_id, 'amount', p_amount),
    jsonb_build_object('account', 'gateway_clearing', 'amount', -p_amount)), null, null, null, v_id, null, 'Repasse ' || p_reference);
  perform public._audit('record_payout', 'payouts', v_id::text, jsonb_build_object('party', p_party_id, 'amount', p_amount, 'reference', p_reference));
  return v_id;
end $$;

-- Ajuste manual: exige justificativa; é um lançamento novo (o histórico não muda).
create function public.admin_ledger_adjustment(p_account text, p_party_id uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform public._require_admin();
  if coalesce(char_length(trim(p_reason)), 0) < 10 then raise exception 'Justifique o ajuste (pelo menos 10 letras)'; end if;
  if p_account not in ('store_payable', 'store_receivable', 'courier_payable') then raise exception 'Conta inválida para ajuste'; end if;
  v := public._ledger_post('adjustment', jsonb_build_array(
    jsonb_build_object('account', p_account, 'party_id', p_party_id, 'amount', p_amount),
    jsonb_build_object('account', 'adjustment', 'amount', -p_amount)), null, null, null, null, null, trim(p_reason));
  perform public._audit('ledger_adjustment', 'ledger_entries', v::text, jsonb_build_object('account', p_account, 'party', p_party_id, 'amount', p_amount, 'reason', p_reason));
  return v;
end $$;

-- Saldos por conta e recebedor (o que a plataforma deve e tem a receber).
create function public.admin_balances()
returns table (account text, party_id uuid, party_name text, balance numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select l.account, l.party_id,
    coalesce(s.name, p.full_name), sum(l.amount)
  from public.ledger_entries l
  left join public.stores s on s.id = l.party_id and l.account like 'store_%'
  left join public.profiles p on p.id = l.party_id and l.account = 'courier_payable'
  group by l.account, l.party_id, s.name, p.full_name
  having sum(l.amount) <> 0
  order by l.account, 3;
end $$;

-- Saldo da loja para o dono: a receber da plataforma (online) e a pagar de comissão (offline).
create function public.store_balance(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return jsonb_build_object(
    'to_receive', -coalesce((select sum(amount) from public.ledger_entries where account = 'store_payable' and party_id = p_store_id), 0),
    'to_pay',      coalesce((select sum(amount) from public.ledger_entries where account = 'store_receivable' and party_id = p_store_id), 0),
    'payouts',     coalesce((select sum(amount) from public.payouts where party_kind = 'store' and party_id = p_store_id), 0));
end $$;

-- Importa o extrato de liquidação do gateway (CSV convertido pelo painel). Lança a tarifa do gateway no razão.
create function public.admin_import_settlement(p_provider text, p_batch text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jsonb; n_new int := 0; n_dup int := 0; v_rows int;
begin
  perform public._require_admin();
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Extrato inválido'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into public.provider_settlements (provider, provider_payment_id, gross, fee, net, settled_on, batch, imported_by)
    values (p_provider, l ->> 'provider_payment_id', (l ->> 'gross')::numeric, coalesce((l ->> 'fee')::numeric, 0),
            coalesce((l ->> 'net')::numeric, (l ->> 'gross')::numeric - coalesce((l ->> 'fee')::numeric, 0)),
            (l ->> 'settled_on')::date, p_batch, auth.uid())
    on conflict (provider, provider_payment_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      n_new := n_new + 1;
      if coalesce((l ->> 'fee')::numeric, 0) > 0 then
        perform public._ledger_post('gateway_fee', jsonb_build_array(
          jsonb_build_object('account', 'platform_gateway_fees', 'amount', (l ->> 'fee')::numeric),
          jsonb_build_object('account', 'gateway_clearing', 'amount', -(l ->> 'fee')::numeric)),
          null, (select id from public.payments where provider = p_provider and provider_payment_id = l ->> 'provider_payment_id'),
          null, null, null, 'Tarifa ' || p_provider || ' ' || (l ->> 'provider_payment_id'));
      end if;
    else
      n_dup := n_dup + 1;
    end if;
  end loop;
  perform public._audit('import_settlement', 'provider_settlements', p_batch, jsonb_build_object('new', n_new, 'duplicates', n_dup));
  return jsonb_build_object('imported', n_new, 'duplicates', n_dup);
end $$;

-- Conciliação: lista tudo o que não fecha. Vazio = conciliado.
create function public.admin_reconciliation(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns table (issue text, severity text, order_code text, reference text, amount numeric, detail text, occurred_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  -- Online: pago no sistema e sem linha no extrato do gateway depois de 3 dias
  select 'pago_sem_extrato', 'media', o.code, p.provider_payment_id, p.amount, 'Pagamento confirmado sem liquidação importada', p.paid_at
    from public.payments p join public.orders o on o.id = p.order_id
    where p.status in ('paid', 'partially_refunded', 'refunded') and p.paid_at between p_from and p_to and p.paid_at < now() - interval '3 days'
      and not exists (select 1 from public.provider_settlements s where s.provider = p.provider and s.provider_payment_id = p.provider_payment_id)
  union all
  -- Extrato com pagamento desconhecido
  select 'extrato_sem_pagamento', 'alta', null, s.provider_payment_id, s.gross, 'Linha do extrato sem pagamento no sistema', s.imported_at
    from public.provider_settlements s
    where s.imported_at between p_from and p_to
      and not exists (select 1 from public.payments p where p.provider = s.provider and p.provider_payment_id = s.provider_payment_id)
  union all
  -- Valor do extrato diferente do pago
  select 'valor_divergente', 'alta', o.code, s.provider_payment_id, s.gross - p.paid_amount, 'Extrato: ' || s.gross || ' / sistema: ' || p.paid_amount, s.imported_at
    from public.provider_settlements s join public.payments p on p.provider = s.provider and p.provider_payment_id = s.provider_payment_id
    join public.orders o on o.id = p.order_id
    where s.imported_at between p_from and p_to and s.gross <> p.paid_amount
  union all
  -- Pagamento em revisão (valor pago diferente do cobrado)
  select 'pagamento_em_revisao', 'alta', o.code, p.provider_payment_id, p.paid_amount, p.failure_reason, p.updated_at
    from public.payments p join public.orders o on o.id = p.order_id where p.status = 'review'
  union all
  -- Cancelado e pago, sem estorno concluído há mais de 1 hora
  select 'cancelado_sem_estorno', 'alta', o.code, null, o.total - o.refunded_amount, 'Estorno pendente ou falhou', o.cancelled_at
    from public.orders o
    where o.status = 'CANCELLED' and o.payment_mode = 'online' and o.payment_status in ('paid', 'partially_refunded')
      and o.cancelled_at < now() - interval '1 hour'
  union all
  -- Estorno que falhou
  select 'estorno_falhou', 'alta', o.code, r.id::text, r.amount, r.failure_reason, r.decided_at
    from public.refunds r join public.orders o on o.id = r.order_id where r.status = 'failed'
  union all
  -- Offline entregue sem confirmação de recebimento há mais de 24 h
  select 'offline_sem_confirmacao', 'media', o.code, o.payment_method::text, o.total, 'A loja ainda não confirmou o recebimento', o.delivered_at
    from public.orders o
    where o.status = 'DELIVERED' and o.payment_mode = 'offline' and o.payment_status = 'pending'
      and o.delivered_at between p_from and p_to and o.delivered_at < now() - interval '24 hours'
  union all
  -- Entregue sem liquidação no razão (não deveria acontecer)
  select 'entregue_sem_lancamento', 'critica', o.code, null, o.total, 'Pedido entregue sem lançamento financeiro', o.delivered_at
    from public.orders o
    where o.status = 'DELIVERED' and o.delivered_at between p_from and p_to
      and not exists (select 1 from public.ledger_entries l where l.order_id = o.id and l.kind = 'order_settlement')
  union all
  -- Lançamento desbalanceado (não deveria acontecer)
  select 'razao_desbalanceado', 'critica', null, l.txn_id::text, sum(l.amount), 'Soma diferente de zero', min(l.created_at)
    from public.ledger_entries l group by l.txn_id having sum(l.amount) <> 0
  union all
  -- Webhook recebido e não processado
  select 'webhook_nao_processado', 'media', null, w.provider || ':' || w.event_id, null, 'Evento sem processamento', w.received_at
    from public.payment_webhook_events w where w.processed_at is null and w.received_at < now() - interval '10 minutes';
end $$;

create function public.admin_set_ticket_status(p_ticket_id uuid, p_status text, p_message text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_status not in ('open', 'waiting_customer', 'waiting_store', 'resolved', 'closed') then raise exception 'Situação inválida'; end if;
  update public.support_tickets set status = p_status where id = p_ticket_id;
  if not found then raise exception 'Atendimento não encontrado'; end if;
  if nullif(trim(p_message), '') is not null then
    insert into public.support_messages (ticket_id, author_id, author_kind, body) values (p_ticket_id, auth.uid(), 'admin', trim(p_message));
  end if;
  perform public._audit('set_ticket_status', 'support_tickets', p_ticket_id::text, jsonb_build_object('status', p_status));
end $$;

-- Faturas: só pedidos offline (os online já tiveram a comissão retida). Valor = o que a loja deve no razão.
create or replace function public.admin_generate_invoices(p_period_start date, p_period_end date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; ov public.invoices%rowtype; v_rows int;
begin
  perform public._require_admin();
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Período inválido'; end if;
  for r in
    select o.store_id, count(*) as cnt, sum(o.subtotal) as gross,
           sum((select sum(l.amount) from public.ledger_entries l
                where l.order_id = o.id and l.account = 'store_receivable' and l.kind = 'order_settlement')) as comm
    from public.orders o
    join public.stores s on s.id = o.store_id
    join public.cities c on c.id = s.city_id
    where o.status = 'DELIVERED' and o.payment_mode = 'offline'
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
    values (r.store_id, p_period_start, p_period_end, r.cnt, r.gross, coalesce(r.comm, 0))
    on conflict (store_id, period_start, period_end) do update
      set orders_count = excluded.orders_count, gross_amount = excluded.gross_amount, commission_total = excluded.commission_total
      where public.invoices.status = 'open';
    get diagnostics v_rows = row_count;
    n := n + v_rows;
  end loop;
  perform public._audit('generate_invoices', 'invoices', null, jsonb_build_object('start', p_period_start, 'end', p_period_end, 'stores', n));
  return n;
end $$;

-- Fatura paga baixa o "a receber" da loja no razão.
create or replace function public.admin_set_invoice_status(p_invoice_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cur text; inv public.invoices%rowtype;
begin
  perform public._require_admin();
  if p_status not in ('open', 'paid', 'void') then raise exception 'Situação inválida'; end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  v_cur := inv.status;
  if v_cur = p_status then return; end if;
  if v_cur = 'paid' then raise exception 'Fatura paga não pode ser reaberta nem anulada'; end if;
  if v_cur = 'void' and p_status = 'paid' then raise exception 'Fatura anulada não pode ser marcada como paga: reabra e gere de novo'; end if;
  update public.invoices set status = p_status, paid_at = case when p_status = 'paid' then now() else null end where id = p_invoice_id;
  if p_status = 'paid' and inv.commission_total <> 0 then
    perform public._ledger_post('invoice_paid', jsonb_build_array(
      jsonb_build_object('account', 'platform_cash', 'amount', inv.commission_total),
      jsonb_build_object('account', 'store_receivable', 'party_id', inv.store_id, 'amount', -inv.commission_total)),
      null, null, null, null, inv.id, 'Fatura ' || to_char(inv.period_start, 'DD/MM') || '–' || to_char(inv.period_end, 'DD/MM/YYYY'));
  end if;
  perform public._audit('set_invoice_status', 'invoices', p_invoice_id::text, jsonb_build_object('status', p_status, 'from', v_cur));
end $$;

-- =====================================================================
-- 16. Tempo limite: online não pago; online pago e não aceito (com estorno automático pelo gatilho)
-- =====================================================================
insert into public.platform_settings (key, value) values ('order_accept_timeout_min', '15'::jsonb) on conflict (key) do nothing;
create or replace function public.expire_stale_orders() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_min numeric := coalesce(public._setting_numeric('order_accept_timeout_min'), 15);
  v_pay numeric := coalesce(public._setting_numeric('online_payment_timeout_min'), 30);
  r record; n int := 0;
begin
  for r in
    select id, payment_mode, payment_status from public.orders
    where status = 'CREATED' and (
      (payment_mode = 'offline' and created_at < now() - make_interval(mins => v_min::int)) or
      (payment_mode = 'online' and payment_status <> 'paid' and created_at < now() - make_interval(mins => v_pay::int)) or
      (payment_mode = 'online' and payment_status = 'paid' and paid_at < now() - make_interval(mins => v_min::int)))
    for update skip locked
  loop
    update public.orders set status = 'CANCELLED', cancelled_at = now(),
      cancel_reason = case
        when r.payment_mode = 'online' and r.payment_status <> 'paid' then 'Pagamento não confirmado a tempo. Nenhum valor foi cobrado.'
        when r.payment_mode = 'online' then 'A loja não respondeu a tempo. O valor pago será devolvido.'
        else 'A loja não respondeu a tempo. Nenhum valor foi cobrado.' end
    where id = r.id;
    perform public._restock(r.id);
    perform public._log_order(r.id, 'CANCELLED', 'system', 'tempo limite');
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- 17. Quem pode executar
-- =====================================================================
revoke execute on function
  public._ledger_post(text, jsonb, uuid, uuid, uuid, uuid, uuid, text), public._ledger_immutable(),
  public._coupon_discount(public.coupons, public.stores, uuid, numeric, numeric), public._order_financial_effects(),
  public._can_see_ticket(uuid),
  public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric, numeric, text, text),
  public.quote_order(uuid, jsonb, public.fulfillment, public.payment_method, uuid, text, text),
  public.advance_order_status(uuid, public.order_status, text), public.cancel_order(uuid, text),
  public.confirm_offline_payment(uuid),
  public.svc_payment_begin(uuid, uuid, text), public.svc_payment_attach(uuid, text, text, text, text, timestamptz),
  public.svc_payment_fail(uuid, text), public.svc_payment_apply(text, text, text, numeric, text, jsonb),
  public.svc_refunds_to_process(int), public.svc_refund_result(uuid, boolean, text, text),
  public.open_ticket(text, text, text, uuid), public.post_ticket_message(uuid, text), public.request_refund(uuid, numeric, text),
  public.upsert_coupon(jsonb), public.admin_decide_refund(uuid, boolean, numeric, text, text),
  public.admin_record_payout(text, uuid, numeric, text, text, text), public.admin_ledger_adjustment(text, uuid, numeric, text),
  public.admin_balances(), public.store_balance(uuid), public.admin_import_settlement(text, text, jsonb),
  public.admin_reconciliation(timestamptz, timestamptz), public.admin_set_ticket_status(uuid, text, text),
  public.admin_generate_invoices(date, date), public.admin_set_invoice_status(uuid, text), public.expire_stale_orders()
from public, anon, authenticated;

grant execute on function public._can_see_ticket(uuid) to authenticated;
grant execute on function
  public.create_order(uuid, jsonb, public.fulfillment, public.payment_method, text, text, text, uuid, text, numeric, numeric, text, text),
  public.quote_order(uuid, jsonb, public.fulfillment, public.payment_method, uuid, text, text),
  public.advance_order_status(uuid, public.order_status, text), public.cancel_order(uuid, text),
  public.confirm_offline_payment(uuid),
  public.open_ticket(text, text, text, uuid), public.post_ticket_message(uuid, text), public.request_refund(uuid, numeric, text),
  public.upsert_coupon(jsonb), public.admin_decide_refund(uuid, boolean, numeric, text, text),
  public.admin_record_payout(text, uuid, numeric, text, text, text), public.admin_ledger_adjustment(text, uuid, numeric, text),
  public.admin_balances(), public.store_balance(uuid), public.admin_import_settlement(text, text, jsonb),
  public.admin_reconciliation(timestamptz, timestamptz), public.admin_set_ticket_status(uuid, text, text),
  public.admin_generate_invoices(date, date), public.admin_set_invoice_status(uuid, text)
to authenticated;

grant execute on function
  public.svc_payment_begin(uuid, uuid, text), public.svc_payment_attach(uuid, text, text, text, text, timestamptz),
  public.svc_payment_fail(uuid, text), public.svc_payment_apply(text, text, text, numeric, text, jsonb),
  public.svc_refunds_to_process(int), public.svc_refund_result(uuid, boolean, text, text), public.expire_stale_orders()
to service_role;
