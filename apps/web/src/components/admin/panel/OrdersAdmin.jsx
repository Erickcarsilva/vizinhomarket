import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl, STATUS, FULFILLMENT, PAYMENT } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Card, Btn, Seg, Empty, ErrorLine, useAction, fmtDate, waLink } from "./ui";

const since = { hoje: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, "7d": () => new Date(Date.now() - 7 * 864e5), "30d": () => new Date(Date.now() - 30 * 864e5), tudo: () => null };

export default function OrdersAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [period, setPeriod] = useState("7d");
  const [storeId, setStoreId] = useState("");
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState("");
  const { data: stores = [] } = useQuery({ queryKey: ["admin-stores"], queryFn: () => base44.entities.Store.list("name", 1000) });
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders", status, period, storeId],
    queryFn: () => base44.admin.listOrders({ status: status === "todos" ? null : status, storeId: storeId || null, from: since[period]()?.toISOString() }),
    refetchInterval: 20000,
  });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-orders"] }));
  const total = orders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-4">
      <Seg value={status} onChange={setStatus} options={[["open", "Em andamento"], ["CREATED", "Esperando aceite"], ["DELIVERED", "Entregues"], ["CANCELLED", "Cancelados"], ["todos", "Todos"]]} />
      <div className="flex flex-wrap gap-2">
        <Seg value={period} onChange={setPeriod} options={[["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["tudo", "Tudo"]]} />
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="h-9 rounded-full border border-border bg-card px-3 text-sm">
          <option value="">Todas as lojas</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">{orders.length} pedido(s){total ? ` · ${brl(total)} entregue` : ""}</p>
      <ErrorLine error={error} />
      {isLoading ? <Empty>Carregando…</Empty> : orders.length === 0 ? <Empty>Nenhum pedido com esses filtros.</Empty> : (
        <Card className="divide-y divide-border">
          {orders.map((o) => {
            const expanded = open === o.id;
            const finished = ["DELIVERED", "CANCELLED"].includes(o.status);
            const wa = waLink(o.customer_phone, `Olá ${o.customer_name}, aqui é do VizinhoMarket sobre o pedido ${o.code}.`);
            return (
              <div key={o.id} className="p-4 space-y-3">
                <button type="button" onClick={() => { setOpen(expanded ? null : o.id); setReason(""); }} className="w-full flex items-start gap-3 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{o.code} · {o.store_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{fmtDate(o.created_date)} · {o.customer_name} · {brl(o.total)}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
                  <ChevronDown className={`w-4 h-4 mt-1 shrink-0 transition ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <div className="rounded-xl bg-secondary/60 p-4 text-sm space-y-3">
                    <ul className="space-y-1">
                      {o.items.map((i, n) => <li key={n} className="flex justify-between gap-3"><span>{i.quantity}× {i.name}{i.addons?.length ? ` + ${i.addons.join(", ")}` : ""}</span><span>{brl(i.line_total)}</span></li>)}
                    </ul>
                    <div className="text-xs text-muted-foreground space-y-0.5 border-t border-border pt-2">
                      <p>{FULFILLMENT[o.fulfillment]}{o.address ? ` · ${o.address}` : ""}</p>
                      <p>{PAYMENT[o.payment_method]} · entrega {brl(o.delivery_fee)} · comissão {brl(o.commission_amount)}</p>
                      {o.notes && <p>Obs.: {o.notes}</p>}
                      {o.cancel_reason && <p className="text-destructive">Cancelado: {o.cancel_reason}</p>}
                      <p>Histórico: {o.status_history.map((e) => `${STATUS[e.status]?.label || e.status} ${new Date(e.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`).join(" → ")}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {wa && <a href={wa} target="_blank" rel="noreferrer" className="h-9 px-4 rounded-full text-xs font-semibold border border-border hover:bg-secondary flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />Falar com o cliente</a>}
                      {!finished && (
                        <>
                          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do cancelamento" className="h-9 flex-1 min-w-[12rem]" />
                          <Btn variant="danger" disabled={reason.trim().length < 3} busy={busy === o.id} onClick={() => run(o.id, () => base44.admin.cancelOrder(o.id, reason.trim()), `Cancelar o pedido ${o.code}?`)}>Cancelar pedido</Btn>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
