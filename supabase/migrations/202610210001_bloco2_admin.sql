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
