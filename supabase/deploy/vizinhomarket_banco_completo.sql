-- VizinhoMarket — banco COMPLETO (instalação do zero): marketplace com pagamentos, razão financeiro, cupons, logística,
-- entregadores, serviços, categorias com atributos e LGPD. Gerado em 13/11/2026.
-- Gerado por supabase/deploy/gerar.mjs a partir de supabase/migrations (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run.

-- PARTE 1 (tudo ou nada). O "add value" do tipo de pagamento roda dentro da transação (Postgres 12+); o valor novo só é usado depois.
begin;

-- ================= migrations/202610140001_base.sql =================
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

-- ================= migrations/202610140002_security.sql =================
-- VizinhoMarket — permissões
-- Regra geral: o Supabase concede ALL às roles anon/authenticated por padrão.
-- Aqui retiramos tudo e devolvemos só o necessário, coluna por coluna quando preciso.
-- Toda gravação sensível (pedido, status, aprovação, papéis) passa por funções em 202610140003_functions.sql.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- ---------- Funções auxiliares ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

create function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;

create function public.is_store_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.store_members where store_id = sid and user_id = auth.uid())
$$;

create function public.is_store_owner(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.store_members where store_id = sid and user_id = auth.uid() and role = 'owner')
$$;

create function public.is_store_public(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stores s join public.cities c on c.id = s.city_id
    where s.id = sid and s.status = 'approved' and c.active
  )
$$;

create function public.product_store(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from public.products where id = pid
$$;

create function public.addon_group_store(gid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.store_id from public.product_addon_groups g join public.products p on p.id = g.product_id where g.id = gid
$$;

grant execute on function public.is_admin(), public.has_role(public.app_role), public.is_store_member(uuid),
  public.is_store_owner(uuid), public.is_store_public(uuid), public.product_store(uuid), public.addon_group_store(uuid)
  to anon, authenticated;

-- ---------- Ativar RLS em tudo ----------
alter table public.platform_settings    enable row level security;
alter table public.cities               enable row level security;
alter table public.neighborhoods        enable row level security;
alter table public.profiles             enable row level security;
alter table public.user_roles           enable row level security;
alter table public.categories           enable row level security;
alter table public.stores               enable row level security;
alter table public.store_private        enable row level security;
alter table public.store_members        enable row level security;
alter table public.store_hours          enable row level security;
alter table public.delivery_zones       enable row level security;
alter table public.products             enable row level security;
alter table public.product_variants     enable row level security;
alter table public.product_addon_groups enable row level security;
alter table public.product_addons       enable row level security;
alter table public.addresses            enable row level security;
alter table public.couriers             enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_events         enable row level security;
alter table public.order_secrets        enable row level security;
alter table public.reviews              enable row level security;
alter table public.commission_rules     enable row level security;
alter table public.invoices             enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.audit_log            enable row level security;
alter table public.store_referrals      enable row level security;

-- ---------- Referência pública: cidades, bairros, categorias ----------
grant select on public.cities, public.neighborhoods, public.categories to anon, authenticated;
create policy cities_read        on public.cities        for select using (active or public.is_admin());
create policy neighborhoods_read on public.neighborhoods for select using (active or public.is_admin());
create policy categories_read    on public.categories    for select using (active or public.is_admin());

-- Configurações: só admin lê (escrita por função).
grant select on public.platform_settings to authenticated;
create policy settings_admin_read on public.platform_settings for select to authenticated using (public.is_admin());

-- ---------- Perfil ----------
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
create policy profiles_read   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.user_roles to authenticated;
create policy roles_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------- Comércios ----------
-- Comissão negociada com cada loja não é pública: todas as colunas, menos commission_rate.
grant select (id, city_id, category_id, name, slug, description, logo_url, cover_url, phone_public, address_line,
              neighborhood_id, lat, lng, is_paused, accepts_pickup, accepts_store_delivery, accepts_platform_delivery,
              delivery_fee_default, min_order, prep_time_min, status, rating_avg, rating_count, approved_at,
              created_by, created_at, updated_at)
  on public.stores to anon, authenticated;
-- O comércio edita só campos operacionais. status, commission_rate, rating_*, city_id, category_id, slug: só por função.
grant update (name, description, logo_url, cover_url, phone_public, address_line, neighborhood_id, lat, lng,
              is_paused, accepts_pickup, accepts_store_delivery, accepts_platform_delivery,
              delivery_fee_default, min_order, prep_time_min)
  on public.stores to authenticated;
create policy stores_read on public.stores for select
  using (public.is_store_public(id) or public.is_store_member(id) or public.is_admin());
create policy stores_update on public.stores for update to authenticated
  using (public.is_store_member(id)) with check (public.is_store_member(id));

grant select on public.store_private to authenticated;
grant update (legal_name, document, owner_name, owner_phone, pix_key) on public.store_private to authenticated;
create policy store_private_read on public.store_private for select to authenticated
  using (public.is_store_owner(store_id) or public.is_admin());
create policy store_private_update on public.store_private for update to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

grant select on public.store_members to authenticated;
create policy store_members_read on public.store_members for select to authenticated
  using (user_id = auth.uid() or public.is_store_member(store_id) or public.is_admin());

grant select on public.store_hours, public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.store_hours, public.delivery_zones to authenticated;
create policy store_hours_read  on public.store_hours for select using (public.is_store_public(store_id) or public.is_store_member(store_id) or public.is_admin());
create policy store_hours_write on public.store_hours for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy zones_read  on public.delivery_zones for select using (public.is_store_public(store_id) or public.is_store_member(store_id) or public.is_admin());
create policy zones_write on public.delivery_zones for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- ---------- Produtos ----------
grant select on public.products, public.product_variants, public.product_addon_groups, public.product_addons to anon, authenticated;
grant insert (store_id, section, name, description, image_url, price, unit, stock, available, age_restricted, sort)
  on public.products to authenticated;
grant update (section, name, description, image_url, price, unit, stock, available, age_restricted, sort, deleted_at)
  on public.products to authenticated;
grant insert, update, delete on public.product_variants, public.product_addon_groups, public.product_addons to authenticated;

create policy products_read on public.products for select
  using ((deleted_at is null and public.is_store_public(store_id)) or public.is_store_member(store_id) or public.is_admin());
create policy products_insert on public.products for insert to authenticated
  with check (public.is_store_member(store_id));
create policy products_update on public.products for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
-- Sem DELETE físico: produto sai com deleted_at (preserva histórico dos pedidos).

create policy variants_read  on public.product_variants for select
  using (public.is_store_public(public.product_store(product_id)) or public.is_store_member(public.product_store(product_id)) or public.is_admin());
create policy variants_write on public.product_variants for all to authenticated
  using (public.is_store_member(public.product_store(product_id))) with check (public.is_store_member(public.product_store(product_id)));

create policy addon_groups_read  on public.product_addon_groups for select
  using (public.is_store_public(public.product_store(product_id)) or public.is_store_member(public.product_store(product_id)) or public.is_admin());
create policy addon_groups_write on public.product_addon_groups for all to authenticated
  using (public.is_store_member(public.product_store(product_id))) with check (public.is_store_member(public.product_store(product_id)));

create policy addons_read  on public.product_addons for select
  using (public.is_store_public(public.addon_group_store(group_id)) or public.is_store_member(public.addon_group_store(group_id)) or public.is_admin());
create policy addons_write on public.product_addons for all to authenticated
  using (public.is_store_member(public.addon_group_store(group_id))) with check (public.is_store_member(public.addon_group_store(group_id)));

-- ---------- Endereços (só o dono) ----------
grant select, insert, update, delete on public.addresses to authenticated;
create policy addresses_own on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Entregadores ----------
grant select on public.couriers to authenticated;
grant update (is_online, last_lat, last_lng, last_seen) on public.couriers to authenticated;
create policy couriers_read on public.couriers for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy couriers_update_self on public.couriers for update to authenticated
  using (user_id = auth.uid() and status = 'approved') with check (user_id = auth.uid() and status = 'approved');

-- ---------- Pedidos (somente leitura direta; escrita por função) ----------
grant select on public.orders, public.order_items, public.order_events to authenticated;
create policy orders_read on public.orders for select to authenticated using (
  customer_id = auth.uid() or courier_id = auth.uid() or public.is_store_member(store_id) or public.is_admin()
);
create policy order_items_read  on public.order_items  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_events_read on public.order_events for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));

grant select (order_id, delivery_code) on public.order_secrets to authenticated;
create policy order_secrets_customer on public.order_secrets for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
);

-- ---------- Avaliações (públicas; escrita por função) ----------
-- Quem avaliou e o entregador não ficam expostos: só as colunas abaixo são legíveis.
grant select (id, store_id, store_rating, comment, created_at) on public.reviews to anon, authenticated;
-- order_id só para usuários logados: permite ao cliente ver a avaliação junto do próprio pedido
-- (os dados do pedido continuam protegidos pela política de orders).
grant select (order_id) on public.reviews to authenticated;
create policy reviews_read on public.reviews for select using (true);

-- ---------- Financeiro ----------
grant select on public.commission_rules to authenticated;
create policy commission_rules_admin on public.commission_rules for select to authenticated using (public.is_admin());
grant select on public.invoices to authenticated;
create policy invoices_read on public.invoices for select to authenticated using (public.is_store_owner(store_id) or public.is_admin());

-- ---------- Indicações ----------
grant insert (store_name, category, contact, notes) on public.store_referrals to authenticated;
grant select on public.store_referrals to authenticated;
create policy referrals_insert on public.store_referrals for insert to authenticated with check (true);
create policy referrals_admin_read on public.store_referrals for select to authenticated using (public.is_admin());
create function public.set_referrer() returns trigger language plpgsql security definer set search_path = public as $$
begin new.referred_by := auth.uid(); return new; end $$;
create trigger trg_referrals_owner before insert on public.store_referrals for each row execute function public.set_referrer();

-- ---------- Push e auditoria ----------
grant select, insert, delete on public.push_tokens to authenticated;
create policy push_tokens_own on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.audit_log to authenticated;
create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());

-- ================= migrations/202610140003_functions.sql =================
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
      if a.neighborhood_id is null then raise exception 'Informe o bairro do endereço de entrega'; end if;
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

-- ================= migrations/202610140004_reference_data.sql =================
-- VizinhoMarket — dados de referência (não são dados de teste)

insert into public.cities (name, state, slug, timezone, active)
values ('Sidrolândia', 'MS', 'sidrolandia-ms', 'America/Campo_Grande', true);
-- Bairros de Sidrolândia: cadastrar pelo painel Admin com a lista oficial (pendente).

insert into public.categories (slug, name, icon, sort, active, age_restricted, needs_review) values
  ('alimentacao', 'Restaurantes e lanches', 'utensils',     10, true,  false, false),
  ('mercado',     'Mercado',                'shopping-cart',20, true,  false, false),
  ('farmacia',    'Farmácia e saúde',       'pill',         30, true,  false, true),
  ('pet',         'Pet shop',               'paw-print',    40, true,  false, false),
  ('bebidas',     'Bebidas',                'wine',         50, true,  true,  false),
  ('autopecas',   'Autopeças',              'wrench',       60, true,  false, false),
  ('eletronicos', 'Eletrônicos',            'smartphone',   70, true,  false, false),
  ('lojas',       'Lojas e variedades',     'store',        80, true,  false, false),
  ('servicos',    'Serviços',               'briefcase',    90, false, false, false);  -- V2 (agendamento)

-- Comissão padrão PROVISÓRIA (8%). Confirmar na tarefa 0.8 e ajustar por categoria com admin_set_commission_rule.
insert into public.platform_settings (key, value) values
  ('default_commission_rate', '0.08'::jsonb);

-- ================= migrations/202610190001_supabase_platform.sql =================
-- VizinhoMarket — recursos que só existem no Supabase (tempo real e armazenamento de imagens).
-- Não roda nos testes locais (PGlite), que não têm os schemas storage e supabase_realtime.

-- Tempo real: lojas recebem pedido novo na hora; cliente acompanha o status.
-- As regras de leitura (RLS) continuam valendo: cada um só recebe eventos dos pedidos que pode ver.
alter publication supabase_realtime add table public.orders, public.order_events;

-- Imagens públicas (logo, capa e fotos de produto). Cada usuário só grava na própria pasta: <user_id>/arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-images', 'public-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "imagens: leitura pública" on storage.objects for select using (bucket_id = 'public-images');
create policy "imagens: envio na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "imagens: apagar da própria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ================= migrations/202610200001_bloco1_piloto.sql =================
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

-- ================= migrations/202610210001_bloco2_admin.sql =================
-- VizinhoMarket — Bloco 2 (parte 1): painel administrativo.
-- Usuários (lista, bloqueio, papel de admin), entregadores, faturas de comissão e resumo do painel.
-- Tudo passa por funções que conferem se quem chama é administrador.

-- =====================================================================
-- Usuários
-- =====================================================================
create function public.admin_list_users(p_search text default null, p_limit int default 200)
returns table (id uuid, email text, full_name text, phone text, roles text[], owns_store boolean,
               courier_status text, banned boolean, created_at timestamptz, last_sign_in_at timestamptz, orders_count bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  return query
  select u.id, u.email::text, p.full_name, p.phone,
         coalesce((select array_agg(r.role::text order by r.role) from public.user_roles r where r.user_id = u.id), '{}'),
         exists (select 1 from public.stores s where s.created_by = u.id),
         (select c.status::text from public.couriers c where c.user_id = u.id),
         coalesce(u.banned_until > now(), false),
         u.created_at, u.last_sign_in_at,
         (select count(*) from public.orders o where o.customer_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p_search is null or trim(p_search) = ''
     or u.email ilike '%' || trim(p_search) || '%'
     or p.full_name ilike '%' || trim(p_search) || '%'
     or p.phone ilike '%' || trim(p_search) || '%'
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- Bloquear impede novos logins; a sessão atual expira sozinha em até 1 hora.
create function public.admin_set_user_banned(p_user_id uuid, p_banned boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  if p_user_id = auth.uid() then raise exception 'Você não pode bloquear a própria conta'; end if;
  update auth.users set banned_until = case when p_banned then 'infinity'::timestamptz else null end where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  perform public._audit(case when p_banned then 'ban_user' else 'unban_user' end, 'user', p_user_id::text, jsonb_build_object('reason', p_reason));
end $$;

create function public.admin_set_admin(p_user_id uuid, p_is_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_is_admin then
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'admin', auth.uid()) on conflict do nothing;
  else
    if p_user_id = auth.uid() then raise exception 'Você não pode tirar o seu próprio acesso de administrador'; end if;
    delete from public.user_roles where user_id = p_user_id and role = 'admin';
  end if;
  perform public._audit(case when p_is_admin then 'grant_admin' else 'revoke_admin' end, 'user', p_user_id::text);
end $$;

-- =====================================================================
-- Entregadores (cadastro aprovado pelo admin; o app do entregador vem no Bloco 3)
-- =====================================================================
create function public.admin_list_couriers()
returns table (user_id uuid, email text, full_name text, phone text, status text, vehicle text, plate text,
               document text, is_online boolean, last_seen timestamptz, created_at timestamptz, deliveries bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  return query
  select c.user_id, u.email::text, p.full_name, p.phone, c.status::text, c.vehicle, c.plate, c.document,
         c.is_online, c.last_seen, c.created_at,
         (select count(*) from public.orders o where o.courier_id = c.user_id and o.status = 'DELIVERED')
  from public.couriers c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  order by (c.status = 'pending') desc, c.created_at desc;
end $$;

-- =====================================================================
-- Faturas de comissão
-- =====================================================================
-- Gera (ou atualiza, se ainda em aberto) uma fatura por loja com os pedidos ENTREGUES no período.
create function public.admin_generate_invoices(p_period_start date, p_period_end date) returns int
language plpgsql security definer set search_path = public as $$
declare v_tz text; n int := 0; r record;
begin
  perform public._require_admin();
  if p_period_end < p_period_start then raise exception 'Período inválido'; end if;
  for r in
    select o.store_id, count(*) as cnt, sum(o.subtotal) as gross, sum(o.commission_amount) as comm
    from public.orders o
    join public.stores s on s.id = o.store_id
    join public.cities c on c.id = s.city_id
    where o.status = 'DELIVERED'
      and (o.delivered_at at time zone c.timezone)::date between p_period_start and p_period_end
    group by o.store_id
  loop
    insert into public.invoices (store_id, period_start, period_end, orders_count, gross_amount, commission_total)
    values (r.store_id, p_period_start, p_period_end, r.cnt, r.gross, r.comm)
    on conflict (store_id, period_start, period_end) do update
      set orders_count = excluded.orders_count, gross_amount = excluded.gross_amount, commission_total = excluded.commission_total
      where public.invoices.status = 'open';
    n := n + 1;
  end loop;
  perform public._audit('generate_invoices', 'invoices', null, jsonb_build_object('start', p_period_start, 'end', p_period_end, 'stores', n));
  return n;
end $$;

create function public.admin_set_invoice_status(p_invoice_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_status not in ('open', 'paid', 'void') then raise exception 'Situação inválida'; end if;
  update public.invoices set status = p_status, paid_at = case when p_status = 'paid' then now() else null end where id = p_invoice_id;
  if not found then raise exception 'Fatura não encontrada'; end if;
  perform public._audit('set_invoice_status', 'invoices', p_invoice_id::text, jsonb_build_object('status', p_status));
end $$;

-- =====================================================================
-- Comissão por loja (a taxa negociada não é pública; só o admin vê e altera)
-- =====================================================================
create function public.admin_store_rates()
returns table (store_id uuid, negotiated numeric, effective numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query select s.id, s.commission_rate, public._commission_rate(s.id) from public.stores s;
end $$;

-- p_rate nulo = volta a usar a taxa da categoria / padrão da plataforma.
create function public.admin_set_store_commission(p_store_id uuid, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_rate is not null and (p_rate < 0 or p_rate > 0.5) then raise exception 'Comissão deve ficar entre 0%% e 50%%'; end if;
  update public.stores set commission_rate = p_rate where id = p_store_id;
  if not found then raise exception 'Loja não encontrada'; end if;
  perform public._audit('set_store_commission', 'stores', p_store_id::text, jsonb_build_object('rate', p_rate));
end $$;

-- =====================================================================
-- Resumo do painel (números calculados no servidor, sem baixar todos os pedidos)
-- =====================================================================
create function public.admin_overview(p_from timestamptz default date_trunc('month', now()), p_to timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare res jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'orders', count(*),
    'delivered', count(*) filter (where status = 'DELIVERED'),
    'cancelled', count(*) filter (where status = 'CANCELLED'),
    'auto_cancelled', count(*) filter (where status = 'CANCELLED' and cancel_reason like 'A loja não respondeu%'),
    'open', count(*) filter (where status not in ('DELIVERED', 'CANCELLED')),
    'gmv', coalesce(sum(total) filter (where status = 'DELIVERED'), 0),
    'commission', coalesce(sum(commission_amount) filter (where status = 'DELIVERED'), 0),
    'avg_accept_min', round(avg(extract(epoch from (accepted_at - created_at)) / 60) filter (where accepted_at is not null)::numeric, 1)
  ) into res
  from public.orders where created_at between p_from and p_to;
  return res || jsonb_build_object(
    'stores_pending', (select count(*) from public.stores where status = 'pending'),
    'stores_approved', (select count(*) from public.stores where status = 'approved'),
    'stores_suspended', (select count(*) from public.stores where status = 'suspended'),
    'couriers_pending', (select count(*) from public.couriers where status = 'pending'),
    'users', (select count(*) from auth.users),
    'invoices_open', (select coalesce(sum(commission_total), 0) from public.invoices where status = 'open')
  );
end $$;

-- =====================================================================
-- Permissões
-- =====================================================================
revoke execute on function public.admin_list_users(text, int), public.admin_set_user_banned(uuid, boolean, text),
  public.admin_set_admin(uuid, boolean), public.admin_list_couriers(), public.admin_generate_invoices(date, date),
  public.admin_set_invoice_status(uuid, text), public.admin_overview(timestamptz, timestamptz),
  public.admin_store_rates(), public.admin_set_store_commission(uuid, numeric) from public, anon;
grant execute on function public.admin_list_users(text, int), public.admin_set_user_banned(uuid, boolean, text),
  public.admin_set_admin(uuid, boolean), public.admin_list_couriers(), public.admin_generate_invoices(date, date),
  public.admin_set_invoice_status(uuid, text), public.admin_overview(timestamptz, timestamptz),
  public.admin_store_rates(), public.admin_set_store_commission(uuid, numeric) to authenticated;

-- ================= migrations/202610210002_totais_no_servidor.sql =================
-- VizinhoMarket — totais do comerciante calculados no servidor (corrige o limite de 500 pedidos nas telas).
-- As funções rodam com a permissão de quem chama (security invoker): as regras de acesso (RLS) de
-- orders/order_items continuam valendo. Dono e atendente veem a própria loja; admin vê todas; os demais recebem zero.
--
-- Datas: pedidos, cancelados e em andamento contam pela data do pedido (created_at).
-- Entregues, vendas e comissão contam pela data da entrega (delivered_at), igual à fatura (admin_generate_invoices).

create function public.store_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'orders',         (select count(*) from orders o where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to),
    'cancelled',      (select count(*) from orders o where o.store_id = p_store_id and o.status = 'CANCELLED' and o.created_at >= p_from and o.created_at < p_to),
    'auto_cancelled', (select count(*) from orders o where o.store_id = p_store_id and o.status = 'CANCELLED' and o.cancel_reason like 'A loja não respondeu%' and o.created_at >= p_from and o.created_at < p_to),
    'open',           (select count(*) from orders o where o.store_id = p_store_id and o.status not in ('DELIVERED', 'CANCELLED') and o.created_at >= p_from and o.created_at < p_to),
    'delivered',      coalesce(d.cnt, 0),
    'sales',          coalesce(d.sales, 0),       -- soma dos produtos (sem taxa de entrega): base da comissão
    'total',          coalesce(d.total, 0),       -- valor pago pelo cliente (com entrega)
    'commission',     coalesce(d.comm, 0),
    'avg_ticket',     case when coalesce(d.cnt, 0) > 0 then round(d.total / d.cnt, 2) else 0 end,
    'avg_accept_min', (select round(avg(extract(epoch from (o.accepted_at - o.created_at)) / 60)::numeric, 1)
                       from orders o where o.store_id = p_store_id and o.accepted_at is not null and o.created_at >= p_from and o.created_at < p_to)
  )
  from (select count(*) cnt, sum(subtotal) sales, sum(total) total, sum(commission_amount) comm
        from orders o where o.store_id = p_store_id and o.status = 'DELIVERED' and o.delivered_at >= p_from and o.delivered_at < p_to) d
$$;

-- Vendas entregues por dia, no fuso da cidade da loja.
create function public.store_daily(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, delivered bigint, total numeric, commission numeric)
language sql stable security invoker set search_path = public as $$
  select (o.delivered_at at time zone coalesce(c.timezone, 'America/Campo_Grande'))::date as day,
         count(*), sum(o.total), sum(o.commission_amount)
  from orders o
  join stores s on s.id = o.store_id
  left join cities c on c.id = s.city_id
  where o.store_id = p_store_id and o.status = 'DELIVERED' and o.delivered_at >= p_from and o.delivered_at < p_to
  group by 1 order by 1
$$;

-- Produtos mais vendidos (pedidos entregues).
create function public.store_top_products(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_limit int default 5)
returns table (name text, quantity numeric, revenue numeric)
language sql stable security invoker set search_path = public as $$
  select i.name, sum(i.quantity), sum(i.line_total)
  from order_items i
  join orders o on o.id = i.order_id
  where o.store_id = p_store_id and o.status = 'DELIVERED' and o.delivered_at >= p_from and o.delivered_at < p_to
  group by i.name
  order by 2 desc, 3 desc
  limit least(greatest(coalesce(p_limit, 5), 1), 50)
$$;

-- Índices para as consultas acima e para a paginação do histórico.
create index if not exists orders_store_delivered_idx on public.orders (store_id, delivered_at desc) where status = 'DELIVERED';
create index if not exists orders_store_created_idx on public.orders (store_id, created_at desc);

revoke execute on function public.store_summary(uuid, timestamptz, timestamptz), public.store_daily(uuid, timestamptz, timestamptz),
  public.store_top_products(uuid, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.store_summary(uuid, timestamptz, timestamptz), public.store_daily(uuid, timestamptz, timestamptz),
  public.store_top_products(uuid, timestamptz, timestamptz, int) to authenticated;

-- ================= migrations/202610210003_farmacia_inativa.sql =================
-- VizinhoMarket — Farmácia fora do piloto.
-- Medicamentos têm regras sanitárias próprias (Anvisa, farmacêutico responsável, receita).
-- A categoria fica inativa: some do app e register_store já recusa categoria inativa ("Categoria inválida").
-- Para reativar no futuro, depois da análise jurídica: update public.categories set active = true where slug = 'farmacia';

update public.categories set active = false where slug = 'farmacia';

do $$
declare n int;
begin
  select count(*) into n from public.stores s join public.categories c on c.id = s.category_id
  where c.slug = 'farmacia';
  if n > 0 then
    raise notice 'Atenção: % loja(s) cadastrada(s) na categoria Farmácia. Revise no painel admin.', n;
  end if;
end $$;

-- ================= migrations/202610220001_favoritos.sql =================
-- VizinhoMarket — favoritos salvos na conta (antes ficavam só no navegador).
-- Cada pessoa vê, adiciona e remove só os próprios. Somem junto com a conta ou com o produto.

create table public.favorites (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index on public.favorites (product_id);

alter table public.favorites enable row level security;
revoke all on public.favorites from public, anon, authenticated;
grant select, delete on public.favorites to authenticated;
grant insert (product_id) on public.favorites to authenticated;

create policy favorites_read   on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated using (user_id = auth.uid());

-- ================= migrations/202610220002_bairros_taxa.sql =================
-- VizinhoMarket — bairros e taxa de entrega por bairro.
-- A tabela delivery_zones e a regra no create_order já existiam (14/10): se a loja tem bairros cadastrados,
-- o pedido só é aceito nesses bairros e com a taxa de cada um; se não tem, vale a taxa única da loja.
-- Aqui entram: cadastro de bairros pelo admin e gravação das taxas pela loja, de uma vez só.

-- Admin cadastra vários bairros de uma vez (um nome por item). Nomes repetidos são ignorados.
create function public.admin_add_neighborhoods(p_city_id uuid, p_names text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._require_admin();
  if not exists (select 1 from public.cities where id = p_city_id) then raise exception 'Cidade inválida'; end if;
  with novos as (
    select distinct initcap(trim(regexp_replace(x, '\s+', ' ', 'g'))) as name
    from unnest(coalesce(p_names, '{}')) x
    where char_length(trim(x)) between 2 and 80
  ), ins as (
    insert into public.neighborhoods (city_id, name)
    select p_city_id, name from novos
    on conflict (city_id, name) do nothing
    returning 1
  )
  select count(*) into n from ins;
  perform public._audit('add_neighborhoods', 'neighborhoods', p_city_id::text, jsonb_build_object('added', n));
  return n;
end $$;

create function public.admin_set_neighborhood_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.neighborhoods set active = p_active where id = p_id;
  if not found then raise exception 'Bairro não encontrado'; end if;
  perform public._audit('set_neighborhood_active', 'neighborhoods', p_id::text, jsonb_build_object('active', p_active));
end $$;

-- A loja grava a lista inteira de bairros atendidos de uma vez (tudo ou nada).
-- p_zones: [{"neighborhood_id": "...", "fee": 5.00}, ...]. Lista vazia = volta a usar a taxa única.
create function public.store_set_delivery_zones(p_store_id uuid, p_zones jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_city uuid; n int;
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin()) then
    raise exception 'Só o dono da loja altera as taxas (sem permissão para esta loja)' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_zones, '[]'::jsonb)) <> 'array' then raise exception 'Lista de bairros inválida'; end if;
  select city_id into v_city from public.stores where id = p_store_id;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb)) z
    left join public.neighborhoods nb on nb.id = (z ->> 'neighborhood_id')::uuid and nb.city_id = v_city and nb.active
    where nb.id is null
  ) then raise exception 'Bairro inválido para a cidade da loja'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb)) z
    where (z ->> 'fee') is null or (z ->> 'fee')::numeric < 0 or (z ->> 'fee')::numeric > 100
  ) then raise exception 'Taxa de entrega deve ficar entre R$ 0 e R$ 100'; end if;

  delete from public.delivery_zones where store_id = p_store_id;
  insert into public.delivery_zones (store_id, neighborhood_id, fee)
  select distinct on ((z ->> 'neighborhood_id')::uuid) p_store_id, (z ->> 'neighborhood_id')::uuid, round((z ->> 'fee')::numeric, 2)
  from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb)) z;
  get diagnostics n = row_count;
  perform public._audit('set_delivery_zones', 'stores', p_store_id::text, jsonb_build_object('zones', n));
  return n;
end $$;

revoke execute on function public.admin_add_neighborhoods(uuid, text[]), public.admin_set_neighborhood_active(uuid, boolean),
  public.store_set_delivery_zones(uuid, jsonb) from public, anon;
grant execute on function public.admin_add_neighborhoods(uuid, text[]), public.admin_set_neighborhood_active(uuid, boolean),
  public.store_set_delivery_zones(uuid, jsonb) to authenticated;

-- ================= migrations/202610220003_atendentes.sql =================
-- VizinhoMarket — atendentes da loja.
-- O dono convida pelo e-mail alguém que já tem conta no app. O atendente usa o Painel do Comerciante para
-- pedidos, entregas e cardápio, mas não mexe em dados da loja (nome, taxas, Pix), faturas nem na equipe.
-- (store_members com o papel 'staff' já existia desde 14/10; aqui entram o convite e os limites.)

create function public.store_list_members(p_store_id uuid)
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin()) then
    raise exception 'Só o dono da loja vê a equipe' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text, p.full_name, m.role::text, m.added_at
  from public.store_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.store_id = p_store_id
  order by (m.role = 'owner') desc, m.added_at;
end $$;

create function public.store_add_staff(p_store_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin()) then
    raise exception 'Só o dono da loja convida atendentes' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Não existe conta com este e-mail. Peça para a pessoa criar a conta no app e tente de novo.';
  end if;
  if exists (select 1 from public.store_members where store_id = p_store_id and user_id = v_user) then
    raise exception 'Esta pessoa já faz parte da equipe da loja';
  end if;
  if (select count(*) from public.store_members where store_id = p_store_id and role = 'staff') >= 10 then
    raise exception 'Limite de 10 atendentes por loja';
  end if;
  insert into public.store_members (store_id, user_id, role) values (p_store_id, v_user, 'staff');
  perform public._audit('add_staff', 'stores', p_store_id::text, jsonb_build_object('user_id', v_user));
  return v_user;
end $$;

create function public.store_remove_staff(p_store_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin() or p_user_id = auth.uid()) then
    raise exception 'Só o dono da loja remove atendentes' using errcode = '42501';
  end if;
  delete from public.store_members where store_id = p_store_id and user_id = p_user_id and role = 'staff';
  if not found then raise exception 'Atendente não encontrado (o dono não pode ser removido)'; end if;
  perform public._audit('remove_staff', 'stores', p_store_id::text, jsonb_build_object('user_id', p_user_id));
end $$;

revoke execute on function public.store_list_members(uuid), public.store_add_staff(uuid, text), public.store_remove_staff(uuid, uuid) from public, anon;
grant execute on function public.store_list_members(uuid), public.store_add_staff(uuid, text), public.store_remove_staff(uuid, uuid) to authenticated;

-- Atendente só pode abrir/pausar a loja; o resto dos dados da loja é do dono.
create function public._stores_staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_store_member(new.id) and not public.is_store_owner(new.id) and not public.is_admin()
     and (to_jsonb(new) - 'is_paused' - 'updated_at') is distinct from (to_jsonb(old) - 'is_paused' - 'updated_at') then
    raise exception 'Só o dono da loja pode alterar esses dados (o atendente pode abrir e pausar a loja)' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger stores_staff_guard before update on public.stores for each row execute function public._stores_staff_guard();

-- Taxas por bairro: só o dono.
drop policy zones_write on public.delivery_zones;
create policy zones_write on public.delivery_zones for all to authenticated
  using (public.is_store_owner(store_id) or public.is_admin()) with check (public.is_store_owner(store_id) or public.is_admin());

-- ================= migrations/202610220005_ajustes_seguranca.sql =================
-- VizinhoMarket — ajustes apontados pelo verificador de segurança do Supabase (22/10).
-- Funções sem search_path fixo e uma função de gatilho que não precisa ser chamável pela API.
alter function public.touch_updated_at() set search_path = public;
alter function public.forbid_product_store_change() set search_path = public;
alter function public._slugify(text) set search_path = public;
revoke execute on function public._stores_staff_guard() from public, anon, authenticated;

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

-- ================= migrations/202611130001_pagamento_online_tipo.sql =================
-- VizinhoMarket — novo meio de pagamento: cartão pago online (pelo gateway).
-- Fica num arquivo próprio porque "alter type ... add value" não pode ser usado na mesma transação em que é criado.
-- Pix online usa o valor 'pix' já existente com orders.payment_mode = 'online'.
alter type public.payment_method add value if not exists 'card_online';

-- ================= migrations/202611130002_financeiro.sql =================
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
declare o public.orders%rowtype; p public.payments%rowtype; v_timeout numeric; v_recipient text;
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
  -- Split: valor da loja (mesma regra da liquidação), se a loja tem conta de recebedor neste provedor.
  select gateway_recipient_id into v_recipient from public.store_private where store_id = o.store_id and gateway_provider = p_provider;
  return jsonb_build_object('payment_id', p.id, 'reuse', false, 'amount', p.amount, 'method', p.method, 'order_code', o.code,
    'expires_at', p.expires_at, 'customer_name', o.customer_name, 'store_name', (select name from public.stores where id = o.store_id),
    'split', case when v_recipient is not null then jsonb_build_object('recipient_id', v_recipient,
      'store_amount', o.subtotal - case when o.discount_funded_by = 'store' then o.discount_amount else 0 end - o.commission_amount
                      + case when o.fulfillment = 'platform_delivery' then 0 else o.delivery_fee end) end);
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

-- ================= migrations/202611130004_logistica.sql =================
-- VizinhoMarket — logística (13/11/2026)
--  * Entregador da plataforma: online/offline por função; localização só é aceita online e só é guardada por pedido
--    durante a entrega (nada de rastrear quem está offline). Ao ficar offline, a última posição é apagada.
--  * Aceite em duas etapas: aceitar a corrida (atômico, pode ser antes de ficar pronto) → confirmar a retirada na loja
--    (vira "saiu para entrega") → código do cliente. Recusar uma oferta esconde a corrida só para aquele entregador.
--  * Falha na entrega vira atendimento; o admin reatribui (volta para a fila ou para um entregador específico).
--  * Entregadores próprios da loja (membros da equipe marcados como entregador) também compartilham a posição na entrega.
--  * Ganhos do entregador vêm do razão (courier_fee por entrega da plataforma).
--  * Correção: rate_order comparava customer_id com "<>", que é nulo em pedido anonimizado (conta excluída).

alter table public.orders add column if not exists courier_assigned_at timestamptz;
alter table public.orders add column if not exists store_driver_id uuid references auth.users(id);
alter table public.store_members add column if not exists is_driver boolean not null default false;

create table public.delivery_locations (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  driver_id   uuid not null references auth.users(id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real check (accuracy_m >= 0),
  recorded_at timestamptz not null default now()
);
create index on public.delivery_locations (order_id, recorded_at desc);

create table public.delivery_declines (
  order_id   uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_id, courier_id)
);

alter table public.delivery_locations enable row level security;
alter table public.delivery_declines enable row level security;
revoke all on public.delivery_locations, public.delivery_declines from anon, authenticated;
revoke all on sequence public.delivery_locations_id_seq from anon, authenticated;
-- Posição: só por função (order_driver_position), que limita ao pedido em andamento.

-- O entregador não grava mais a própria linha diretamente (online e posição só por função).
revoke update on public.couriers from authenticated;
drop policy if exists couriers_update_self on public.couriers;

insert into public.platform_settings (key, value) values
  ('platform_delivery_enabled', 'false'::jsonb),   -- entrega pela plataforma liberada pelo admin quando houver entregadores
  ('courier_max_active', '2'::jsonb),              -- corridas simultâneas por entregador
  ('location_retention_days', '30'::jsonb)         -- posições de entrega apagadas depois disso
on conflict (key) do nothing;

-- =====================================================================
-- Entregador: online/offline e posição
-- =====================================================================
create or replace function public._require_courier() returns public.couriers
language plpgsql stable security definer set search_path = public as $$
declare c public.couriers%rowtype;
begin
  select * into c from public.couriers where user_id = public._uid();
  if not found or c.status <> 'approved' or not public.has_role('courier') then
    raise exception 'Cadastro de entregador não aprovado' using errcode = '42501';
  end if;
  return c;
end $$;

create function public.courier_set_online(p_online boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier();
begin
  if not p_online and exists (select 1 from public.orders where courier_id = c.user_id and status in ('ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT')) then
    raise exception 'Termine ou libere suas corridas antes de ficar offline';
  end if;
  update public.couriers set is_online = p_online, last_seen = now(),
    last_lat = case when p_online then last_lat end, last_lng = case when p_online then last_lng end
  where user_id = c.user_id;
end $$;

-- Atualiza a posição. Entregador da plataforma: precisa estar online. Entregador da loja: só com entrega própria em andamento.
-- Grava histórico apenas para pedidos em entrega (o cliente acompanha). Ignora atualizações a menos de 10 s (economia).
create function public.delivery_update_location(p_lat double precision, p_lng double precision, p_accuracy real default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); c public.couriers%rowtype; n int := 0; v_last timestamptz;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Posição inválida';
  end if;
  select * into c from public.couriers where user_id = v_uid and status = 'approved';
  if found then
    if not c.is_online then raise exception 'Fique online para compartilhar a posição'; end if;
    if c.last_lat is not null and c.last_seen > now() - interval '10 seconds' then return 0; end if;
    update public.couriers set last_lat = p_lat, last_lng = p_lng, last_seen = now() where user_id = v_uid;
  end if;
  select max(recorded_at) into v_last from public.delivery_locations where driver_id = v_uid;
  if v_last is not null and v_last > now() - interval '10 seconds' then return 0; end if;
  insert into public.delivery_locations (order_id, driver_id, lat, lng, accuracy_m)
  select o.id, v_uid, p_lat, p_lng, p_accuracy from public.orders o
  where o.status = 'IN_TRANSIT' and (o.courier_id = v_uid or (o.store_driver_id = v_uid and o.fulfillment = 'store_delivery'));
  get diagnostics n = row_count;
  if n = 0 and c.user_id is null then raise exception 'Sem entrega em andamento'; end if;
  return n;
end $$;

-- Posição do entregador para o cliente e a loja: só a última, só com o pedido saindo para entrega, e só se recente.
create function public.order_driver_position(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.orders%rowtype; l public.delivery_locations%rowtype; v_name text; v_vehicle text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (o.customer_id is not distinct from auth.uid() or public.is_store_member(o.store_id) or public.is_admin()) then
    raise exception 'Pedido não encontrado';
  end if;
  if coalesce(o.courier_id, o.store_driver_id) is not null then
    select split_part(coalesce(full_name, ''), ' ', 1) into v_name from public.profiles where id = coalesce(o.courier_id, o.store_driver_id);
    select vehicle into v_vehicle from public.couriers where user_id = o.courier_id;
  end if;
  if o.status = 'IN_TRANSIT' then
    select * into l from public.delivery_locations where order_id = o.id order by recorded_at desc limit 1;
  end if;
  return jsonb_build_object(
    'driver_first_name', nullif(v_name, ''), 'vehicle', v_vehicle,
    'lat', case when l.recorded_at > now() - interval '5 minutes' then l.lat end,
    'lng', case when l.recorded_at > now() - interval '5 minutes' then l.lng end,
    'recorded_at', l.recorded_at,
    'eta_min', case when o.status in ('CREATED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT') then
       (select s.prep_time_min from public.stores s where s.id = o.store_id)
       + coalesce((select z.eta_min from public.delivery_zones z where z.store_id = o.store_id and z.neighborhood_id = o.neighborhood_id), 0) end);
end $$;

-- =====================================================================
-- Ofertas, aceite, retirada, recusa, liberação e falha
-- =====================================================================
drop function if exists public.list_available_deliveries();
create function public.list_available_deliveries()
returns table (order_id uuid, code text, status public.order_status, store_name text, store_address text, store_neighborhood text,
               customer_neighborhood text, courier_fee numeric, items_count bigint, ready_at timestamptz, accepted_at timestamptz,
               distance_to_store_km numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare c public.couriers%rowtype := public._require_courier();
begin
  if not c.is_online then raise exception 'Fique online para ver as corridas'; end if;
  return query
  select o.id, o.code, o.status, s.name, s.address_line, ns.name, nc.name, o.courier_fee,
         (select count(*) from public.order_items i where i.order_id = o.id), o.ready_at, o.accepted_at,
         -- Distância em linha reta, só quando a loja e o entregador têm coordenadas reais (sem estimativa inventada).
         case when s.lat is not null and c.last_lat is not null then
           round((6371 * 2 * asin(sqrt(power(sin(radians(s.lat - c.last_lat) / 2), 2)
             + cos(radians(c.last_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - c.last_lng) / 2), 2))))::numeric, 1) end
  from public.orders o
  join public.stores s on s.id = o.store_id
  left join public.neighborhoods ns on ns.id = s.neighborhood_id
  left join public.neighborhoods nc on nc.id = o.neighborhood_id
  where o.city_id = c.city_id and o.status in ('ACCEPTED', 'PREPARING', 'READY') and o.fulfillment = 'platform_delivery'
    and o.courier_id is null
    and not exists (select 1 from public.delivery_declines d where d.order_id = o.id and d.courier_id = c.user_id)
  order by o.status desc, coalesce(o.ready_at, o.accepted_at);
end $$;

-- Aceite atômico: o primeiro UPDATE que encontra courier_id nulo vence; o segundo não encontra a linha.
create or replace function public.claim_delivery(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier(); v_id uuid; v_max int;
begin
  if not c.is_online then raise exception 'Fique online para aceitar corridas'; end if;
  v_max := coalesce(public._setting_numeric('courier_max_active'), 2)::int;
  if (select count(*) from public.orders where courier_id = c.user_id and status in ('ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT')) >= v_max then
    raise exception 'Finalize suas entregas em andamento antes de aceitar outra';
  end if;
  update public.orders set courier_id = c.user_id, courier_assigned_at = now()
  where id = p_order_id and city_id = c.city_id and status in ('ACCEPTED', 'PREPARING', 'READY')
    and fulfillment = 'platform_delivery' and courier_id is null
  returning id into v_id;
  if v_id is null then raise exception 'Esta entrega já foi assumida ou não está disponível' using errcode = 'VM409'; end if;
  perform public._log_order(v_id, (select status from public.orders where id = v_id), 'courier', 'Entregador a caminho da loja');
end $$;

create function public.decline_delivery(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier();
begin
  insert into public.delivery_declines (order_id, courier_id) values (p_order_id, c.user_id) on conflict do nothing;
end $$;

-- Retirada na loja: só com o pedido pronto. A partir daqui o cliente acompanha a posição.
create function public.confirm_pickup(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier(); v_id uuid;
begin
  update public.orders set status = 'IN_TRANSIT', picked_up_at = now()
  where id = p_order_id and courier_id = c.user_id and status = 'READY'
  returning id into v_id;
  if v_id is null then raise exception 'O pedido ainda não está pronto ou não é seu' using errcode = 'VM409'; end if;
  perform public._log_order(v_id, 'IN_TRANSIT', 'courier', 'Pedido retirado na loja');
end $$;

-- Desistir antes de retirar: a corrida volta para a fila (e some da lista de quem desistiu).
create or replace function public.release_delivery(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.couriers%rowtype := public._require_courier(); v_id uuid; v_status public.order_status;
begin
  if coalesce(char_length(trim(p_reason)), 0) < 3 then raise exception 'Informe o motivo'; end if;
  update public.orders set courier_id = null, courier_assigned_at = null
  where id = p_order_id and courier_id = c.user_id and status in ('ACCEPTED', 'PREPARING', 'READY')
  returning id, status into v_id, v_status;
  if v_id is null then raise exception 'Depois de retirar o pedido, use "Problema na entrega"'; end if;
  insert into public.delivery_declines (order_id, courier_id) values (v_id, c.user_id) on conflict do nothing;
  perform public._log_order(v_id, v_status, 'courier', 'Entregador liberou: ' || p_reason);
end $$;

-- Problema na entrega (cliente ausente, endereço não encontrado, acidente): registra e abre atendimento para o admin decidir.
create function public.report_delivery_problem(p_order_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype; v_ticket uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'IN_TRANSIT' or not (o.courier_id is not distinct from v_uid or o.store_driver_id is not distinct from v_uid or public.is_store_member(o.store_id)) then
    raise exception 'Entrega não encontrada';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then raise exception 'Descreva o problema'; end if;
  perform public._log_order(o.id, 'IN_TRANSIT', case when o.courier_id = v_uid then 'courier' else 'partner' end, 'Problema na entrega: ' || trim(p_reason));
  insert into public.support_tickets (user_id, order_id, store_id, kind, subject) values (v_uid, o.id, o.store_id, 'delivery', 'Problema na entrega ' || o.code)
    returning id into v_ticket;
  insert into public.support_messages (ticket_id, author_id, author_kind, body)
    values (v_ticket, v_uid, case when o.courier_id = v_uid then 'courier' else 'partner' end, trim(p_reason));
  return v_ticket;
end $$;

-- Admin reatribui: p_courier nulo devolve para a fila (pedido volta a "pronto"); senão entrega a um entregador aprovado.
create function public.admin_reassign_delivery(p_order_id uuid, p_courier uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  perform public._require_admin();
  if coalesce(char_length(trim(p_reason)), 0) < 5 then raise exception 'Justifique a reatribuição'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.fulfillment <> 'platform_delivery' or o.status not in ('ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT') then
    raise exception 'Pedido não pode ser reatribuído';
  end if;
  if p_courier is not null and not exists (select 1 from public.couriers where user_id = p_courier and status = 'approved' and city_id = o.city_id) then
    raise exception 'Entregador inválido';
  end if;
  update public.orders set courier_id = p_courier, courier_assigned_at = case when p_courier is null then null else now() end,
    status = case when o.status = 'IN_TRANSIT' then 'READY' else o.status end, picked_up_at = case when o.status = 'IN_TRANSIT' then null else picked_up_at end
  where id = o.id;
  perform public._log_order(o.id, case when o.status = 'IN_TRANSIT' then 'READY'::public.order_status else o.status end, 'admin', 'Reatribuída: ' || trim(p_reason));
  perform public._audit('reassign_delivery', 'orders', o.id::text, jsonb_build_object('from', o.courier_id, 'to', p_courier, 'reason', p_reason));
end $$;

-- Monitor de entregas para o admin: corridas sem entregador, entregador sem sinal, entrega demorando.
create function public.admin_delivery_monitor()
returns table (order_id uuid, code text, status public.order_status, store_name text, courier_name text, courier_online boolean,
               last_signal timestamptz, minutes_in_status int, alert text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select o.id, o.code, o.status, s.name, p.full_name, c.is_online, c.last_seen,
    (extract(epoch from now() - coalesce(o.picked_up_at, o.ready_at, o.accepted_at, o.created_at)) / 60)::int,
    case
      when o.courier_id is null and o.status = 'READY' and o.ready_at < now() - interval '10 minutes' then 'pronto_sem_entregador'
      when o.status = 'IN_TRANSIT' and (c.last_seen is null or c.last_seen < now() - interval '5 minutes') then 'entregador_sem_sinal'
      when o.status = 'IN_TRANSIT' and o.picked_up_at < now() - interval '45 minutes' then 'entrega_demorada'
      else null end
  from public.orders o
  join public.stores s on s.id = o.store_id
  left join public.couriers c on c.user_id = o.courier_id
  left join public.profiles p on p.id = o.courier_id
  where o.fulfillment = 'platform_delivery' and o.status in ('ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT')
  order by 9 nulls last, o.created_at;
end $$;

-- Ganhos do entregador (do razão) e histórico de entregas.
create function public.courier_earnings(p_from timestamptz default date_trunc('month', now()), p_to timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public._uid();
begin
  if not exists (select 1 from public.couriers where user_id = v_uid) then raise exception 'Cadastro de entregador não encontrado'; end if;
  return jsonb_build_object(
    'deliveries', (select count(*) from public.orders where courier_id = v_uid and status = 'DELIVERED' and delivered_at between p_from and p_to),
    'earned', (select coalesce(sum(courier_fee), 0) from public.orders where courier_id = v_uid and status = 'DELIVERED' and delivered_at between p_from and p_to),
    'balance', -coalesce((select sum(amount) from public.ledger_entries where account = 'courier_payable' and party_id = v_uid), 0),
    'paid_out', coalesce((select sum(amount) from public.payouts where party_kind = 'courier' and party_id = v_uid and created_at between p_from and p_to), 0));
end $$;

-- =====================================================================
-- Entregador próprio da loja
-- =====================================================================
create function public.store_set_member_driver(p_store_id uuid, p_user_id uuid, p_is_driver boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_store_owner(p_store_id) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  update public.store_members set is_driver = p_is_driver where store_id = p_store_id and user_id = p_user_id;
  if not found then raise exception 'Pessoa não faz parte da equipe'; end if;
end $$;

create function public.store_assign_driver(p_order_id uuid, p_driver uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not public.is_store_member(o.store_id) then raise exception 'Pedido não encontrado'; end if;
  if o.fulfillment <> 'store_delivery' or o.status not in ('ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT') then
    raise exception 'Só pedidos com entrega própria em andamento';
  end if;
  if p_driver is not null and not exists (select 1 from public.store_members where store_id = o.store_id and user_id = p_driver and is_driver) then
    raise exception 'Escolha um entregador da equipe da loja';
  end if;
  update public.orders set store_driver_id = p_driver where id = o.id;
  perform public._log_order(o.id, o.status, 'partner', case when p_driver is null then 'Entregador removido' else 'Entregador da loja definido' end);
end $$;

-- Limpeza (agendada no Supabase): posições antigas.
create function public.purge_delivery_locations() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.delivery_locations
  where recorded_at < now() - make_interval(days => coalesce(public._setting_numeric('location_retention_days'), 30)::int);
  get diagnostics n = row_count;
  return n;
end $$;

-- Entrega pela plataforma só com a chave geral ligada pelo admin.
create function public._platform_delivery_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'platform_delivery_enabled'), false)
$$;
-- Sem SECURITY DEFINER de propósito: current_user precisa ser quem está alterando (o dono do banco pode, para manutenção).
create function public._guard_platform_delivery() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.accepts_platform_delivery and (tg_op = 'INSERT' or not old.accepts_platform_delivery)
     and not public._platform_delivery_enabled() and not public.is_admin() and current_user in ('authenticated', 'anon') then
    raise exception 'Entrega pela plataforma ainda não está disponível na sua cidade';
  end if;
  return new;
end $$;
create trigger trg_stores_platform_delivery before insert or update of accepts_platform_delivery on public.stores
  for each row execute function public._guard_platform_delivery();

-- =====================================================================
-- Correção: avaliação de pedido anonimizado
-- =====================================================================
create or replace function public.rate_order(p_order_id uuid, p_store_rating int, p_courier_rating int default null, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.customer_id is distinct from v_uid then raise exception 'Pedido não encontrado'; end if;
  if o.status <> 'DELIVERED' then raise exception 'Só é possível avaliar pedidos entregues'; end if;
  if o.delivered_at < now() - interval '14 days' then raise exception 'Prazo para avaliar encerrado'; end if;
  if p_store_rating not between 1 and 5 then raise exception 'Nota da loja deve ser de 1 a 5'; end if;
  if p_courier_rating is not null and (o.courier_id is null or p_courier_rating not between 1 and 5) then
    raise exception 'Nota do entregador inválida';
  end if;
  if exists (select 1 from public.reviews where order_id = o.id) then raise exception 'Pedido já avaliado'; end if;
  insert into public.reviews (order_id, customer_id, store_id, courier_id, store_rating, courier_rating, comment)
  values (o.id, v_uid, o.store_id, o.courier_id, p_store_rating, p_courier_rating, nullif(left(trim(p_comment), 1000), ''));
  update public.stores s set rating_count = r.cnt, rating_avg = r.avg
  from (select count(*) cnt, round(avg(store_rating)::numeric, 2) avg from public.reviews where store_id = o.store_id) r
  where s.id = o.store_id;
end $$;

-- =====================================================================
-- Permissões
-- =====================================================================
revoke execute on function
  public.courier_set_online(boolean), public.delivery_update_location(double precision, double precision, real),
  public.order_driver_position(uuid), public.list_available_deliveries(), public.claim_delivery(uuid), public.decline_delivery(uuid),
  public.confirm_pickup(uuid), public.release_delivery(uuid, text), public.report_delivery_problem(uuid, text),
  public.admin_reassign_delivery(uuid, uuid, text), public.admin_delivery_monitor(), public.courier_earnings(timestamptz, timestamptz),
  public.store_set_member_driver(uuid, uuid, boolean), public.store_assign_driver(uuid, uuid), public.purge_delivery_locations(),
  public.rate_order(uuid, int, int, text), public._require_courier()
from public, anon, authenticated;
grant execute on function public._platform_delivery_enabled(), public._guard_platform_delivery() to authenticated;
grant execute on function
  public.courier_set_online(boolean), public.delivery_update_location(double precision, double precision, real),
  public.order_driver_position(uuid), public.list_available_deliveries(), public.claim_delivery(uuid), public.decline_delivery(uuid),
  public.confirm_pickup(uuid), public.release_delivery(uuid, text), public.report_delivery_problem(uuid, text),
  public.admin_reassign_delivery(uuid, uuid, text), public.admin_delivery_monitor(), public.courier_earnings(timestamptz, timestamptz),
  public.store_set_member_driver(uuid, uuid, boolean), public.store_assign_driver(uuid, uuid), public.rate_order(uuid, int, int, text)
to authenticated;
grant execute on function public.purge_delivery_locations() to service_role;

-- ================= migrations/202611130005_servicos_categorias_lgpd.sql =================
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

-- ================= migrations/202611130006_admin_operacao.sql =================
-- VizinhoMarket — chaves de operação do admin (13/11/2026)
--  * admin_set_setting passa a validar as chaves conhecidas (tipo e faixa), para um erro de digitação não derrubar a operação.
--  * admin_set_store_online_payment: habilita a loja para receber online e registra a conta de recebedor (split) no gateway.

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v numeric; v_max numeric;
begin
  perform public._require_admin();
  if p_key !~ '^[a-z][a-z0-9_]{2,60}$' then raise exception 'Chave de configuração inválida'; end if;
  if p_key in ('online_payments_enabled', 'platform_delivery_enabled') and jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'Use verdadeiro ou falso';
  end if;
  if p_key = 'payment_provider' and (jsonb_typeof(p_value) <> 'string' or p_value #>> '{}' not in ('sandbox', 'mercadopago', 'asaas')) then
    raise exception 'Provedor de pagamento inválido';
  end if;
  if p_key in ('default_commission_rate', 'courier_fee_share') then
    if jsonb_typeof(p_value) <> 'number' then raise exception 'Use um número'; end if;
    v := (p_value #>> '{}')::numeric;
    v_max := case when p_key = 'courier_fee_share' then 1 else 0.5 end;
    if v < 0 or v > v_max then raise exception 'Valor fora da faixa permitida'; end if;
  end if;
  if p_key in ('order_accept_timeout_min', 'online_payment_timeout_min', 'refund_window_days', 'courier_max_active', 'location_retention_days') then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 365 then raise exception 'Valor fora da faixa permitida'; end if;
  end if;
  insert into public.platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public._audit('set_setting', 'platform_settings', p_key, case when p_key like '%secret%' then '"***"'::jsonb else p_value end);
end $$;

create function public.admin_set_store_online_payment(p_store_id uuid, p_enabled boolean, p_provider text default null, p_recipient_id text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_provider is not null and p_provider not in ('sandbox', 'mercadopago', 'asaas') then raise exception 'Provedor inválido'; end if;
  update public.stores set accepts_online_payment = p_enabled where id = p_store_id;
  if not found then raise exception 'Loja não encontrada'; end if;
  if p_provider is not null then
    update public.store_private set gateway_provider = p_provider, gateway_recipient_id = nullif(trim(p_recipient_id), '') where store_id = p_store_id;
  end if;
  perform public._audit('set_store_online_payment', 'stores', p_store_id::text,
    jsonb_build_object('enabled', p_enabled, 'provider', p_provider, 'recipient_set', p_recipient_id is not null));
end $$;

revoke execute on function public.admin_set_setting(text, jsonb), public.admin_set_store_online_payment(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_setting(text, jsonb), public.admin_set_store_online_payment(uuid, boolean, text, text) to authenticated;

commit;

-- PARTE 2: agendamentos (pg_cron). Se der erro aqui, a Parte 1 já está salva:
-- ative 'pg_cron' em Database → Extensions e rode só estas 3 linhas de novo.
create extension if not exists pg_cron;

select cron.schedule('vm-expira-pedidos', '* * * * *', $$select public.expire_stale_orders()$$);

select cron.schedule('vm-limpa-erros', '0 4 * * *', $$delete from public.client_errors where created_at < now() - interval '30 days'$$);

-- PARTE 3: aviso de pedido novo com o painel fechado (pg_net). Se der erro, ative 'pg_net' em Database → Extensions
-- e rode só esta parte de novo. Depois cadastre o endereço da função (veja 06_aviso_pedido_novo.sql).
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

-- PARTE 4: pagamentos e limpezas agendadas (pg_cron + pg_net). Se der erro, ative as extensões e rode só esta parte.
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

-- Propostas de serviço vencidas e posições de entrega antigas.
select cron.schedule('vm-expira-propostas', '*/15 * * * *', $$select public.expire_service_quotes()$$);
select cron.schedule('vm-limpa-posicoes', '30 4 * * *', $$select public.purge_delivery_locations()$$);

-- Conferência: tabelas = 45, categorias = 18, agendamentos = 5, funcoes_totais = 3, farmacia_ativa = false
select (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tabelas,
       (select count(*) from public.categories) as categorias,
       (select count(*) from cron.job where jobname like 'vm-%') as agendamentos,
       (select count(*) from pg_proc where proname in ('store_summary','store_daily','store_top_products')) as funcoes_totais,
       (select active from public.categories where slug = 'farmacia') as farmacia_ativa;
