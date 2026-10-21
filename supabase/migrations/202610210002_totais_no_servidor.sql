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
