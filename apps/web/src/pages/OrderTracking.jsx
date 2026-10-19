import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { brl, FULFILLMENT, PAYMENT } from "@/lib/constants";
import StatusTimeline from "@/components/order/StatusTimeline";
import RateOrder from "@/components/order/RateOrder";

export default function OrderTracking() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: order, isLoading, refetch } = useQuery({ queryKey: ["order", id], queryFn: () => base44.entities.Order.get(id) });
  const open = order && !["DELIVERED", "CANCELLED"].includes(order.status);
  const { data: code } = useQuery({ queryKey: ["order-code", id], queryFn: () => base44.entities.Order.deliveryCode(id), enabled: !!open });

  useEffect(() => base44.entities.Order.subscribe((e) => {
    if (e.id === id) qc.invalidateQueries({ queryKey: ["order", id] });
  }), [id, qc]);

  if (isLoading) return <div className="max-w-3xl mx-auto px-5 py-16"><div className="h-64 rounded-2xl bg-muted animate-pulse" /></div>;
  if (!order) return <p className="text-center py-24 text-muted-foreground">Pedido não encontrado.</p>;

  return (
    <div className="max-w-4xl mx-auto px-5 py-12 grid md:grid-cols-[1fr_320px] gap-12">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Pedido {order.code}</p>
        <h1 className="font-display text-4xl mt-2 mb-10">
          <Link to={`/loja/${order.store_id}`} className="hover:text-primary transition-colors">{order.store_name}</Link>
        </h1>
        {open && code && (
          <div className="mb-8 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Código de entrega</p>
            <p className="font-display text-5xl tracking-[0.3em] mt-2">{code}</p>
            <p className="text-sm text-muted-foreground mt-2">Informe este código só quando receber o pedido. Ele confirma a entrega.</p>
          </div>
        )}
        {order.status === "CANCELLED" && order.cancel_reason && <p className="mb-6 text-sm text-destructive">Pedido cancelado: {order.cancel_reason}</p>}
        <StatusTimeline order={order} />
        {order.status === "DELIVERED" && <div className="mt-6"><RateOrder order={order} onSaved={refetch} /></div>}
      </div>
      <aside className="bg-card border border-border rounded-2xl p-6 h-fit space-y-4 text-sm">
        {order.items.map((i) => (
          <div key={i.product_id} className="flex justify-between gap-3"><span>{i.quantity}× {i.name}</span><span>{brl(i.price * i.quantity)}</span></div>
        ))}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex justify-between text-muted-foreground"><span>Entrega</span><span>{order.delivery_fee ? brl(order.delivery_fee) : "Grátis"}</span></div>
          <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{brl(order.total)}</span></div>
        </div>
        <div className="border-t border-border pt-4 space-y-1 text-muted-foreground">
          <p>{FULFILLMENT[order.fulfillment]}</p>
          {order.address && <p>{order.address}</p>}
          <p>Pagamento: {PAYMENT[order.payment_method]}{order.change_for ? ` (troco p/ ${brl(order.change_for)})` : ""}</p>
        </div>
      </aside>
    </div>
  );
}