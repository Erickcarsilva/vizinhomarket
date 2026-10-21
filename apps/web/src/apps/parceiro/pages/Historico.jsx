import React, { useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useStoreSummary } from "@/lib/useStoreOrders";
import { brl, STATUS, PAYMENT } from "@/lib/constants";

const since = {
  hoje: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  "7d": () => new Date(Date.now() - 7 * 864e5),
  mes: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); },
  "30d": () => new Date(Date.now() - 30 * 864e5),
};

// Histórico: totais calculados no servidor + lista paginada (50 por vez). Funciona com qualquer volume de pedidos.
export default function Historico() {
  const { store } = useOutletContext();
  const [period, setPeriod] = useState("7d");
  const [show, setShow] = useState("DELIVERED");
  const { from, to } = useMemo(() => ({ from: since[period]().toISOString(), to: new Date(Date.now() + 60000).toISOString() }), [period]);
  const { data: s } = useStoreSummary(store?.id, from, to);
  const list = useInfiniteQuery({
    queryKey: ["orders", store?.id, "history", show, from],
    queryFn: ({ pageParam = 0 }) => base44.partner.listPage({ storeId: store.id, status: show, from, to, page: pageParam }),
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    initialPageParam: 0,
    enabled: !!store,
  });
  if (!store) return null;
  const rows = (list.data?.pages || []).flatMap((p) => p.rows);
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
        {[["Entregues", s?.delivered ?? "…"], ["Vendas", s ? brl(s.sales) : "…"], ["Comissão", s ? brl(s.commission) : "…"], ["Cancelados", s?.cancelled ?? "…"]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4"><p className="font-display text-2xl" data-total={l}>{v}</p><p className="text-xs text-muted-foreground mt-1">{l}</p></div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setShow("DELIVERED")} className={pill(show === "DELIVERED")}>Entregues ({s?.delivered ?? 0})</button>
        <button type="button" onClick={() => setShow("CANCELLED")} className={pill(show === "CANCELLED")}>Cancelados ({s?.cancelled ?? 0})</button>
      </div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {list.isLoading && <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>}
        {!list.isLoading && rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum pedido neste período.</p>}
        {rows.map((o) => (
          <div key={o.id} className="p-4 flex items-start gap-3 text-sm" data-order-row>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{o.code} · {o.customer_name}</p>
              <p className="text-xs text-muted-foreground">{new Date(o.delivered_at || o.created_date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {PAYMENT[o.payment_method]} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              {o.cancel_reason && <p className="text-xs text-destructive mt-1">{o.cancel_reason}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold">{brl(o.total)}</p>
              {o.status === "DELIVERED" ? <p className="text-xs text-muted-foreground">comissão {brl(o.commission_amount)}</p> : <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS.CANCELLED.tone}`}>Cancelado</span>}
            </div>
          </div>
        ))}
      </div>
      {list.hasNextPage && (
        <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} className="w-full h-11 rounded-full border border-border text-sm font-semibold flex items-center justify-center gap-2 hover:bg-secondary disabled:opacity-50">
          {list.isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />}Carregar mais
        </button>
      )}
      <p className="text-xs text-muted-foreground">Entregues contam pela data da entrega, igual à fatura. Para faturas, veja <Link to="/financeiro" className="underline">Comissões e faturas</Link>.</p>
    </div>
  );
}
