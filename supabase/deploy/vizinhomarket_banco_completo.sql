-- VizinhoMarket — banco COMPLETO (instalação do zero), com Blocos 1 e 2, totais no servidor, Farmácia inativa, favoritos, bairros, atendentes e correções de 23/10. Gerado em 23/10/2026.
-- Gerado por supabase/deploy/gerar.mjs a partir de supabase/migrations (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run.

-- PARTE 1 (tudo ou nada)
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

-- Conferência: tabelas = 29, categorias = 9, agendamentos = 2, funcoes_totais = 3, farmacia_ativa = false
select (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tabelas,
       (select count(*) from public.categories) as categorias,
       (select count(*) from cron.job where jobname like 'vm-%') as agendamentos,
       (select count(*) from pg_proc where proname in ('store_summary','store_daily','store_top_products')) as funcoes_totais,
       (select active from public.categories where slug = 'farmacia') as farmacia_ativa;
