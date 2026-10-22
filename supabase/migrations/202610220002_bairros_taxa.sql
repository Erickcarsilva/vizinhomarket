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
  if not (public.is_store_member(p_store_id) or public.is_admin()) then
    raise exception 'Sem permissão para esta loja' using errcode = '42501';
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

