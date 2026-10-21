import React from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useStoreOrders } from "@/lib/useStoreOrders";
import TrialCard from "@/components/partner/TrialCard";
import { brl } from "@/lib/constants";

const ST = { open: ["A pagar", "bg-amber-100 text-amber-800"], paid: ["Paga", "bg-emerald-100 text-emerald-800"], void: ["Anulada", "bg-secondary text-muted-foreground"] };
const month = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function Financeiro() {
  const { store } = useOutletContext();
  const { orders } = useStoreOrders(store?.id);
  const { data: invoices = [] } = useQuery({ queryKey: ["my-invoices", store?.id], queryFn: () => base44.partner.listInvoices(store.id), enabled: !!store });
  if (!store) return null;
  const delivered = orders.filter((o) => o.status === "DELIVERED");
  return (
    <div className="max-w-5xl mx-auto px-5 py-8 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Financeiro</p>
        <h1 className="font-display text-4xl mt-2">Comissões e faturas</h1>
        <p className="text-sm text-muted-foreground mt-2">Sem mensalidade: você paga só a comissão dos pedidos entregues. No fim do mês, a fatura chega pelo WhatsApp e é paga por Pix.</p>
      </div>
      <TrialCard store={store} orders={orders} />

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Faturas</h2>
        {invoices.length === 0 ? <p className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border p-6 text-center">Nenhuma fatura ainda. A primeira sai no fim do mês.</p> : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {invoices.map((i) => (
              <div key={i.id} className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold capitalize">{month(i.period_start)}</p>
                  <p className="text-xs text-muted-foreground">{i.orders_count} pedido(s) · vendas {brl(i.gross_amount)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl">{brl(i.commission_total)}</p>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${ST[i.status][1]}`}>{ST[i.status][0]}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Comissão por pedido</h2>
        <div className="border border-border rounded-2xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr><th className="text-left font-medium px-4 py-3">Data</th><th className="text-left font-medium px-4 py-3">Pedido</th><th className="text-right font-medium px-4 py-3">Venda</th><th className="text-right font-medium px-4 py-3">Comissão</th></tr>
            </thead>
            <tbody>
              {delivered.slice(0, 100).map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-3">{new Date(o.created_date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">{o.code}</td>
                  <td className="px-4 py-3 text-right">{brl(o.subtotal)}</td>
                  <td className="px-4 py-3 text-right">{brl(o.commission_amount)}</td>
                </tr>
              ))}
              {delivered.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Nenhum pedido entregue ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
