-- VizinhoMarket — ATUALIZAÇÃO 05: favoritos na conta, bairros com taxa por bairro e atendentes da loja (22/10/2026).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run. Pré-requisito: atualização 04 já aplicada (funcoes_totais = 3).
-- Não apaga nada. Tudo ou nada: se der erro, nada é gravado.
begin;

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

commit;

-- Conferência: deve mostrar favoritos = true, funcoes_novas = 6
select (to_regclass('public.favorites') is not null) as favoritos,
       (select count(*) from pg_proc where proname in ('admin_add_neighborhoods','admin_set_neighborhood_active','store_set_delivery_zones',
                                                     'store_list_members','store_add_staff','store_remove_staff')) as funcoes_novas;
