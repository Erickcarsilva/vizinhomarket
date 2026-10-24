import React, { useEffect, useState } from "react";
import { Copy, Check, Loader2, ChevronLeft } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { brl, FULFILLMENT, PAYMENT } from "@/lib/constants";
import StatusTimeline, { statusLabel } from "@/components/order/StatusTimeline";
import RateOrder from "@/components/order/RateOrder";

// O que cada etapa quer dizer para o cliente.
const AVISO = {
  CREATED: "A loja recebeu seu pedido e vai confirmar em instantes.",
  ACCEPTED: "A loja confirmou seu pedido.",
  PREPARING: "Seu pedido está sendo preparado.",
  READY: { retirada: "Pode buscar: seu pedido está pronto na loja.", outro: "Seu pedido está pronto e logo sai para entrega." },
  IN_TRANSIT: "Seu pedido saiu para entrega.",
  DELIVERED: { retirada: "Pedido retirado. Bom apetite!", outro: "Pedido entregue. Bom apetite!" },
};
const aviso = (o) => { const a = AVISO[o.status]; return typeof a === "string" ? a : a?.[o.fulfillment === "retirada" ? "retirada" : "outro"]; };
const card = "rounded-lg bg-card border border-border p-4";

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

  if (isLoading) return <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5" aria-busy="true"><div className="h-6 w-1/3 rounded bg-secondary animate-pulse" /><div className="h-32 mt-4 rounded-lg bg-secondary animate-pulse" /></div>;
  if (!order) return (
    <div className="max-w-md mx-auto px-4 py-20 text-center space-y-3">
      <h1 className="font-display text-2xl text-marca">Pedido não encontrado</h1>
      <p className="text-muted-foreground">Confira se você entrou com a mesma conta usada no pedido.</p>
      <Link to="/meus-pedidos" className="btn-contorno">Ver meus pedidos</Link>
    </div>
  );
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-10 grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_320px] gap-6 md:gap-10">
      <div className="min-w-0 space-y-5">
        <div>
          <Link to="/meus-pedidos" className="inline-flex items-center gap-1 text-sm font-semibold text-marca"><ChevronLeft className="w-4 h-4" aria-hidden="true" />Meus pedidos</Link>
          <p className="text-[13px] text-muted-foreground mt-3">Pedido {order.code} · <Link to={`/loja/${order.store_id}`} className="underline underline-offset-2 hover:text-foreground">{order.store_name}</Link></p>
          <h1 className={`font-display text-[28px] leading-tight mt-1 ${cancelled ? "text-[#7A3A1F]" : "text-marca"}`} aria-live="polite">
            {cancelled ? "Pedido cancelado" : statusLabel(order.status, order.fulfillment)}
          </h1>
          {cancelled ? (
            <p className="text-[15px] mt-1">{order.cancel_reason ? `Motivo: ${order.cancel_reason}` : "Este pedido foi cancelado."}</p>
          ) : (
            <p className="text-[15px] mt-1">{aviso(order)}</p>
          )}
        </div>

        {open && code && (
          <div className="rounded-lg border-2 border-marca bg-card p-4">
            <p className="text-sm font-semibold text-marca">Código de entrega</p>
            <p className="font-display text-[40px] leading-none tracking-[0.25em] mt-2">{code}</p>
            <p className="text-sm text-muted-foreground mt-2">Diga este código só quando receber o pedido. Ele confirma a entrega.</p>
          </div>
        )}

        {open && order.payment_method === "pix" && (
          <div className={`${card} space-y-2`}>
            <p className="text-[15px] font-semibold">Pagamento por Pix, direto para a loja</p>
            {pix?.pix_key ? (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-background border border-border pl-3 pr-1 py-1">
                  <p className="font-mono text-[15px] break-all flex-1">{pix.pix_key}</p>
                  <button type="button" onClick={copyPix} className="h-10 px-3 rounded-md border border-marca text-marca text-sm font-semibold flex items-center gap-1.5 shrink-0 hover:bg-marca/5">
                    {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}{copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">{pix.receiver ? `Favorecido: ${pix.receiver} · ` : ""}Valor: <strong className="text-foreground">{brl(pix.amount)}</strong>. Confira o nome antes de pagar e mostre o comprovante na entrega.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">A loja ainda não cadastrou a chave Pix. Pague na entrega pelo Pix que o entregador informar.</p>
            )}
          </div>
        )}

        {!cancelled && <div className={card}><StatusTimeline order={order} /></div>}

        {order.status === "CREATED" && (
          <div>
            <button type="button" onClick={cancel} disabled={cancelling} className="btn-contorno h-11 border-border text-foreground disabled:opacity-60">
              {cancelling && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Cancelar pedido
            </button>
            <p className="text-[13px] text-muted-foreground mt-2">Dá para cancelar até a loja aceitar o pedido.</p>
            {cancelError && <p role="alert" className="text-sm text-destructive mt-2">{cancelError}</p>}
          </div>
        )}
        {order.status === "DELIVERED" && <RateOrder order={order} onSaved={refetch} />}
      </div>

      <aside className={`${card} h-fit space-y-3 text-sm min-w-0`} aria-label="Resumo do pedido">
        <h2 className="font-display text-[20px] text-marca">Resumo</h2>
        {order.items.map((i, n) => (
          <div key={n} className="flex justify-between gap-3">
            <span className="min-w-0 break-words">{i.quantity}× {i.name}{i.addons?.length ? <span className="block text-[13px] text-muted-foreground">+ {i.addons.join(", ")}</span> : null}</span>
            <span className="shrink-0">{brl(i.line_total ?? i.price * i.quantity)}</span>
          </div>
        ))}
        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="flex justify-between text-muted-foreground"><span>Entrega</span><span>{order.delivery_fee ? brl(order.delivery_fee) : "Grátis"}</span></div>
          <div className="flex justify-between font-bold text-base"><span>Total</span><span>{brl(order.total)}</span></div>
        </div>
        <div className="border-t border-border pt-3 space-y-1 text-muted-foreground">
          <p>{FULFILLMENT[order.fulfillment]}</p>
          {order.address && <p className="break-words">{order.address}</p>}
          <p>Pagamento: {PAYMENT[order.payment_method]}{order.change_for ? ` (troco p/ ${brl(order.change_for)})` : ""}</p>
        </div>
      </aside>
    </div>
  );
}
