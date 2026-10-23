import React, { useEffect, useState } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
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
  const { data: pix } = useQuery({ queryKey: ["order-pix", id], queryFn: () => base44.entities.Order.paymentInfo(id), enabled: !!open && order?.payment_method === "pix" });
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const copyPix = async () => { try { await navigator.clipboard.writeText(pix.pix_key); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem acesso à área de transferência */ } };
  const cancel = async () => {
    if (!window.confirm("Cancelar este pedido?")) return;
    setCancelling(true); setCancelError("");
    try { await base44.entities.Order.update(id, { status: "CANCELLED", cancel_reason: "Cancelado pelo cliente" }); await refetch(); }
    catch (e) { setCancelError(e.message || "Não foi possível cancelar."); await refetch(); }
    finally { setCancelling(false); }
  };

  useEffect(() => base44.entities.Order.subscribe((e) => {
    if (e.id === id) qc.invalidateQueries({ queryKey: ["order", id] });
  }), [id, qc]);

  if (isLoading) return <div className="max-w-3xl mx-auto px-5 py-16"><div className="h-64 rounded-2xl bg-muted animate-pulse" /></div>;
  if (!order) return <p className="text-center py-24 text-muted-foreground">Pedido não encontrado.</p>;

  return (
    <div className="max-w-4xl mx-auto px-5 py-12 grid md:grid-cols-[1fr_320px] gap-12">
      <div>
        <p className="text-sm text-muted-foreground">Pedido {order.code}</p>
        <h1 className="font-display text-4xl mt-2 mb-10">
          <Link to={`/loja/${order.store_id}`} className="hover:text-primary transition-colors">{order.store_name}</Link>
        </h1>
        {open && code && (
          <div className="mb-8 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <p className="text-sm font-bold text-primary">Código de entrega</p>
            <p className="font-display text-5xl tracking-[0.3em] mt-2">{code}</p>
            <p className="text-sm text-muted-foreground mt-2">Informe este código só quando receber o pedido. Ele confirma a entrega.</p>
          </div>
        )}
        {order.status === "CANCELLED" && order.cancel_reason && <p className="mb-6 text-sm text-destructive">Pedido cancelado: {order.cancel_reason}</p>}
        {open && order.payment_method === "pix" && (
          <div className="mb-8 rounded-2xl border border-border bg-card p-5 space-y-2">
            <p className="text-sm font-bold">Pagamento por Pix, direto para a loja</p>
            {pix?.pix_key ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-base break-all flex-1">{pix.pix_key}</p>
                  <button type="button" onClick={copyPix} className="h-9 px-3 rounded-full border border-border text-sm flex items-center gap-1 shrink-0">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? "Copiado" : "Copiar"}</button>
                </div>
                <p className="text-sm text-muted-foreground">{pix.receiver ? `Favorecido: ${pix.receiver} · ` : ""}Valor: {brl(pix.amount)}. Confira o nome antes de pagar e mostre o comprovante na entrega.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">A loja ainda não cadastrou a chave Pix. Pague na entrega pelo Pix que o entregador informar.</p>
            )}
          </div>
        )}
        <StatusTimeline order={order} />
        {order.status === "CREATED" && (
          <div className="mt-6">
            <button type="button" onClick={cancel} disabled={cancelling} className="h-11 px-6 rounded-full border border-border text-sm hover:bg-secondary flex items-center gap-2 disabled:opacity-50">
              {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}Cancelar pedido
            </button>
            <p className="text-xs text-muted-foreground mt-2">Dá para cancelar até a loja aceitar o pedido.</p>
            {cancelError && <p role="alert" className="text-sm text-destructive mt-2">{cancelError}</p>}
          </div>
        )}
        {order.status === "DELIVERED" && <div className="mt-6"><RateOrder order={order} onSaved={refetch} /></div>}
      </div>
      <aside className="bg-card border border-border rounded-2xl p-6 h-fit space-y-4 text-sm">
        {order.items.map((i, n) => (
          <div key={n} className="flex justify-between gap-3">
            <span>{i.quantity}× {i.name}{i.addons?.length ? <span className="block text-xs text-muted-foreground">+ {i.addons.join(", ")}</span> : null}</span>
            <span>{brl(i.line_total ?? i.price * i.quantity)}</span>
          </div>
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