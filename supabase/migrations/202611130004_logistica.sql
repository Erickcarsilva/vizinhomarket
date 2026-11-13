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
