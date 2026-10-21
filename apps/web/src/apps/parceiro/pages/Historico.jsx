import React, { useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useStoreOrders } from "@/lib/useStoreOrders";
import { brl, STATUS, PAYMENT } from "@/lib/constants";

const since = { hoje: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, "7d": () => new Date(Date.now() - 7 * 864e5), mes: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }, "30d": () => new Date(Date.now() - 30 * 864e5) };

export default function Historico() {
  const { store } = useOutletContext();
  const { orders } = useStoreOrders(store?.id);
  const [period, setPeriod] = useState("7d");
  const [show, setShow] = useState("DELIVERED");
  if (!store) return null;
  const from = since[period]();
  const inPeriod = orders.filter((o) => new Date(o.created_date) >= from);
  const done = inPeriod.filter((o) => o.status === "DELIVERED");
  const cancelled = inPeriod.filter((o) => o.status === "CANCELLED");
  const list = show === "DELIVERED" ? done : cancelled;
  const pill = (on) => `h-9 px-4 rounded-full text-sm border whitespace-nowrap ${on ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`;
  return (
    <div className="max-w-5xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Histórico</p>
        <h1 className="font-display text-4xl mt-2">Pedidos entregues</h1>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este mês"], ["30d", "30 dias"]].map(([k, l]) => <button key={k} type="button" onClick={() => setPeriod(k)} className={pill(period === k)}>{l}</button>)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Entregues", done.length], ["Vendas", brl(done.reduce((s, o) => s + o.subtotal, 0))], ["Comissão", brl(done.reduce((s, o) => s + o.commission_amount, 0))], ["Cancelados", cancelled.length]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4"><p className="font-display text-2xl">{v}</p><p className="text-xs text-muted-foreground mt-1">{l}</p></div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setShow("DELIVERED")} className={pill(show === "DELIVERED")}>Entregues ({done.length})</button>
        <button type="button" onClick={() => setShow("CANCELLED")} className={pill(show === "CANCELLED")}>Cancelados ({cancelled.length})</button>
      </div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {list.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum pedido neste período.</p>}
        {list.map((o) => (
          <div key={o.id} className="p-4 flex items-start gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{o.code} · {o.customer_name}</p>
              <p className="text-xs text-muted-foreground">{new Date(o.created_date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {PAYMENT[o.payment_method]} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              {o.cancel_reason && <p className="text-xs text-destructive mt-1">{o.cancel_reason}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold">{brl(o.total)}</p>
              {o.status === "DELIVERED" ? <p className="text-xs text-muted-foreground">comissão {brl(o.commission_amount)}</p> : <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS.CANCELLED.tone}`}>Cancelado</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Para ver comissões por mês e faturas, vá em <Link to="/financeiro" className="underline">Comissões e faturas</Link>.</p>
    </div>
  );
}
