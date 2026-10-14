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
grant select on public.stores to anon, authenticated;
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
create policy reviews_read on public.reviews for select using (true);

-- ---------- Financeiro ----------
grant select on public.commission_rules to authenticated;
create policy commission_rules_admin on public.commission_rules for select to authenticated using (public.is_admin());
grant select on public.invoices to authenticated;
create policy invoices_read on public.invoices for select to authenticated using (public.is_store_owner(store_id) or public.is_admin());

-- ---------- Push e auditoria ----------
grant select, insert, delete on public.push_tokens to authenticated;
create policy push_tokens_own on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.audit_log to authenticated;
create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());
