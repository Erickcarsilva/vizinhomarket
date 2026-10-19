-- VizinhoMarket — estrutura base (multi-cidade, multicategoria)
-- Postgres 15+ (Supabase). Toda regra de acesso fica em 202610140002_security.sql.

-- ---------- Tipos ----------
create type public.app_role       as enum ('partner', 'courier', 'admin');
create type public.store_status   as enum ('pending', 'approved', 'suspended');
create type public.courier_status as enum ('pending', 'approved', 'suspended');
create type public.member_role    as enum ('owner', 'staff');
create type public.order_status   as enum ('CREATED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
create type public.fulfillment    as enum ('store_delivery', 'platform_delivery', 'pickup');
create type public.payment_method as enum ('pix', 'card_on_delivery', 'cash');
create type public.push_app       as enum ('customer', 'partner', 'courier');

-- ---------- Configuração da plataforma ----------
create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Geografia ----------
create table public.cities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  state      char(2) not null,
  slug       text not null unique,
  timezone   text not null default 'America/Campo_Grande',
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.neighborhoods (
  id      uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name    text not null,
  active  boolean not null default true,
  unique (city_id, name)
);

-- ---------- Usuários ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text check (char_length(full_name) <= 120),
  phone        text check (char_length(phone) <= 20),
  age_confirmed boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  primary key (user_id, role)
);

-- ---------- Catálogo de categorias ----------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.categories(id) on delete restrict,
  slug          text not null unique,
  name          text not null,
  icon          text,
  sort          int not null default 0,
  active        boolean not null default true,
  age_restricted boolean not null default false,  -- ex.: bebidas alcoólicas
  needs_review  boolean not null default false     -- ex.: medicamentos (regras sanitárias)
);

-- ---------- Comércios ----------
create table public.stores (
  id                        uuid primary key default gen_random_uuid(),
  city_id                   uuid not null references public.cities(id),
  category_id               uuid not null references public.categories(id),
  name                      text not null check (char_length(name) between 2 and 80),
  slug                      text not null unique,
  description               text check (char_length(description) <= 600),
  logo_url                  text,
  cover_url                 text,
  phone_public              text check (char_length(phone_public) <= 20),
  address_line              text check (char_length(address_line) <= 200),
  neighborhood_id           uuid references public.neighborhoods(id),
  lat                       double precision,
  lng                       double precision,
  -- operação (editável pelo comércio)
  is_paused                 boolean not null default false,
  accepts_pickup            boolean not null default true,
  accepts_store_delivery    boolean not null default true,
  accepts_platform_delivery boolean not null default false,
  delivery_fee_default      numeric(10,2) not null default 0 check (delivery_fee_default >= 0),
  min_order                 numeric(10,2) not null default 0 check (min_order >= 0),
  prep_time_min             int not null default 30 check (prep_time_min between 0 and 240),
  -- administração (só admin / funções do servidor)
  status                    public.store_status not null default 'pending',
  commission_rate           numeric(5,4) check (commission_rate between 0 and 0.5),
  rating_avg                numeric(3,2),
  rating_count              int not null default 0,
  approved_at               timestamptz,
  created_by                uuid not null references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index on public.stores (city_id, status);
create index on public.stores (category_id);

-- Dados fiscais e de contato do responsável: nunca públicos.
create table public.store_private (
  store_id    uuid primary key references public.stores(id) on delete cascade,
  legal_name  text check (char_length(legal_name) <= 160),
  document    text check (char_length(document) <= 20),   -- CPF ou CNPJ
  owner_name  text check (char_length(owner_name) <= 120),
  owner_phone text check (char_length(owner_phone) <= 20),
  pix_key     text check (char_length(pix_key) <= 120),
  updated_at  timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     public.member_role not null default 'staff',
  added_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index on public.store_members (user_id);

-- Horários no fuso da cidade. weekday: 0 = domingo ... 6 = sábado.
create table public.store_hours (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  weekday  smallint not null check (weekday between 0 and 6),
  opens    time not null,
  closes   time not null,
  check (opens <> closes)
);
create index on public.store_hours (store_id, weekday);

-- Taxa de entrega por bairro. Sem linha para o bairro = loja não entrega lá.
create table public.delivery_zones (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  fee             numeric(10,2) not null check (fee >= 0),
  eta_min         int check (eta_min between 0 and 240),
  unique (store_id, neighborhood_id)
);

-- ---------- Produtos ----------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  section        text check (char_length(section) <= 60),   -- seção dentro da loja
  name           text not null check (char_length(name) between 1 and 120),
  description    text check (char_length(description) <= 1000),
  image_url      text,
  price          numeric(10,2) not null check (price >= 0),
  unit           text not null default 'un' check (unit in ('un', 'kg')),
  stock          numeric(12,3) check (stock >= 0),          -- null = sem controle de estoque
  available      boolean not null default true,
  age_restricted boolean not null default false,
  sort           int not null default 0,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.products (store_id) where deleted_at is null;

-- Variação substitui o preço do produto (ex.: P/M/G, 350 ml/600 ml).
create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  price      numeric(10,2) not null check (price >= 0),
  stock      numeric(12,3) check (stock >= 0),
  available  boolean not null default true,
  sort       int not null default 0
);
create index on public.product_variants (product_id);

create table public.product_addon_groups (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 1),
  sort       int not null default 0,
  check (min_select <= max_select)
);

create table public.product_addons (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.product_addon_groups(id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 60),
  price     numeric(10,2) not null default 0 check (price >= 0),
  available boolean not null default true,
  sort      int not null default 0
);

-- ---------- Endereços do cliente ----------
create table public.addresses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  label           text check (char_length(label) <= 40),
  line            text not null check (char_length(line) between 3 and 200),
  reference       text check (char_length(reference) <= 200),
  city_id         uuid not null references public.cities(id),
  neighborhood_id uuid references public.neighborhoods(id),   -- opcional enquanto a lista de bairros não estiver cadastrada
  lat             double precision,
  lng             double precision,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on public.addresses (user_id);

-- ---------- Entregadores ----------
create table public.couriers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  city_id     uuid not null references public.cities(id),
  status      public.courier_status not null default 'pending',
  vehicle     text not null default 'moto' check (vehicle in ('moto', 'bike', 'carro', 'a_pe')),
  plate       text check (char_length(plate) <= 10),
  document    text check (char_length(document) <= 20),   -- CPF, nunca público
  is_online   boolean not null default false,
  last_lat    double precision,
  last_lng    double precision,
  last_seen   timestamptz,
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- Pedidos ----------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,                 -- código curto exibido (ex.: VM-7K2QF)
  city_id           uuid not null references public.cities(id),
  store_id          uuid not null references public.stores(id),
  customer_id       uuid not null references auth.users(id),
  courier_id        uuid references auth.users(id),
  status            public.order_status not null default 'CREATED',
  fulfillment       public.fulfillment not null,
  payment_method    public.payment_method not null,
  change_for        numeric(10,2) check (change_for >= 0),
  customer_name     text not null check (char_length(customer_name) between 2 and 120),
  customer_phone    text not null check (char_length(customer_phone) between 8 and 20),
  address_line      text,
  address_reference text,
  neighborhood_id   uuid references public.neighborhoods(id),
  lat               double precision,
  lng               double precision,
  notes             text check (char_length(notes) <= 500),
  age_check_required boolean not null default false,
  -- valores congelados pelo servidor
  subtotal          numeric(10,2) not null check (subtotal >= 0),
  delivery_fee      numeric(10,2) not null check (delivery_fee >= 0),
  total             numeric(10,2) not null check (total >= 0),
  commission_rate   numeric(5,4) not null,
  commission_amount numeric(10,2) not null,
  idempotency_key   text not null check (char_length(idempotency_key) between 8 and 80),
  cancel_reason     text check (char_length(cancel_reason) <= 300),
  cancelled_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  ready_at          timestamptz,
  picked_up_at      timestamptz,
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  unique (customer_id, idempotency_key)
);
create index on public.orders (store_id, status, created_at desc);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (courier_id) where courier_id is not null;
create index on public.orders (city_id, status) where status = 'READY';

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  variant_id    uuid references public.product_variants(id) on delete set null,
  name          text not null,
  variant_name  text,
  unit          text not null,
  unit_price    numeric(10,2) not null,
  quantity      numeric(10,3) not null check (quantity > 0),
  addons        jsonb not null default '[]',
  addons_total  numeric(10,2) not null default 0,
  line_total    numeric(10,2) not null
);
create index on public.order_items (order_id);

create table public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     public.order_status not null,
  actor_id   uuid references auth.users(id),
  actor_kind text not null check (actor_kind in ('customer', 'partner', 'courier', 'admin', 'system')),
  note       text,
  created_at timestamptz not null default now()
);
create index on public.order_events (order_id);

-- Código de entrega: só o cliente vê; quem entrega precisa digitar.
create table public.order_secrets (
  order_id      uuid primary key references public.orders(id) on delete cascade,
  delivery_code char(4) not null,
  attempts      int not null default 0
);

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders(id) on delete cascade,
  customer_id    uuid not null references auth.users(id),
  store_id       uuid not null references public.stores(id),
  courier_id     uuid references auth.users(id),
  store_rating   smallint not null check (store_rating between 1 and 5),
  courier_rating smallint check (courier_rating between 1 and 5),
  comment        text check (char_length(comment) <= 1000),
  created_at     timestamptz not null default now()
);
create index on public.reviews (store_id, created_at desc);

-- ---------- Financeiro ----------
-- Prioridade da comissão: stores.commission_rate > regra da categoria > platform_settings.default_commission_rate
create table public.commission_rules (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null unique references public.categories(id) on delete cascade,
  rate        numeric(5,4) not null check (rate between 0 and 0.5),
  updated_at  timestamptz not null default now()
);

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id),
  period_start     date not null,
  period_end       date not null,
  orders_count     int not null,
  gross_amount     numeric(12,2) not null,
  commission_total numeric(12,2) not null,
  status           text not null default 'open' check (status in ('open', 'paid', 'void')),
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  unique (store_id, period_start, period_end)
);

-- ---------- Indicação de loja (cliente sugere um comércio) ----------
create table public.store_referrals (
  id           uuid primary key default gen_random_uuid(),
  store_name   text not null check (char_length(store_name) between 2 and 120),
  category     text check (char_length(category) <= 60),
  contact      text check (char_length(contact) <= 120),
  notes        text check (char_length(notes) <= 500),
  referred_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- ---------- Notificações e auditoria ----------
create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  app        public.push_app not null,
  token      text not null check (char_length(token) <= 4096),
  created_at timestamptz not null default now(),
  unique (app, token)
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  data       jsonb,
  created_at timestamptz not null default now()
);

-- ---------- updated_at automático ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_profiles_touch      before update on public.profiles      for each row execute function public.touch_updated_at();
create trigger trg_stores_touch        before update on public.stores        for each row execute function public.touch_updated_at();
create trigger trg_store_private_touch before update on public.store_private for each row execute function public.touch_updated_at();
create trigger trg_products_touch      before update on public.products      for each row execute function public.touch_updated_at();

-- Produto não muda de loja.
create function public.forbid_product_store_change() returns trigger language plpgsql as $$
begin
  if new.store_id <> old.store_id then
    raise exception 'Produto não pode ser movido para outra loja' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_products_store_lock before update on public.products for each row execute function public.forbid_product_store_change();

-- Perfil criado no cadastro.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
