import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";
import { Card, Seg } from "./ui";

const ranges = {
  hoje: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  "7d": () => new Date(Date.now() - 7 * 864e5),
  mes: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); },
  "30d": () => new Date(Date.now() - 30 * 864e5),
};

export default function Overview({ goTo }) {
  const [range, setRange] = useState("mes");
  const { data: o, isLoading } = useQuery({
    queryKey: ["admin-overview", range],
    queryFn: () => base44.admin.overview(ranges[range]().toISOString(), new Date().toISOString()),
    refetchInterval: 30000,
  });
  const n = (k) => (o ? Number(o[k] || 0) : 0);
  const cancelRate = n("orders") ? Math.round((n("cancelled") / n("orders")) * 100) : 0;

  const tiles = [
    ["Pedidos", n("orders"), `${n("open")} em andamento agora`],
    ["Entregues", n("delivered"), null],
    ["Vendas das lojas", brl(n("gmv")), "pedidos entregues"],
    ["Sua comissão", brl(n("commission")), "pedidos entregues"],
    ["Cancelados", `${n("cancelled")} (${cancelRate}%)`, `${n("auto_cancelled")} sem resposta da loja`],
    ["Pagos pelo app", o?.online_share != null ? `${String(o.online_share).replace(".", ",")}%` : "—", `${n("couriers_online")} entregador(es) online agora`],
    ["Tempo médio de aceite", o?.avg_accept_min != null ? `${String(o.avg_accept_min).replace(".", ",")} min` : "—", "do pedido ao aceite"],
  ];
  const alerts = [
    [n("stores_pending"), "loja(s) aguardando aprovação", "lojas"],
    [n("couriers_pending"), "entregador(es) aguardando aprovação", "entregadores"],
    [n("invoices_open") > 0 ? 1 : 0, `${brl(n("invoices_open"))} em faturas a receber`, "comissoes"],
    [n("refunds_pending"), "reembolso(s) para decidir ou com falha", "reembolsos"],
    [n("tickets_open"), "atendimento(s) aguardando resposta", "atendimento"],
    [n("deliveries_unassigned"), "pedido(s) pronto(s) sem entregador", "entregas"],
    [n("payments_review"), "pagamento(s) em revisão (valor divergente)", "financeiro"],
  ].filter(([c]) => c > 0);

  return (
    <div className="space-y-6">
      <Seg options={[["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este mês"], ["30d", "30 dias"]]} value={range} onChange={setRange} />
      {alerts.length > 0 && (
        <section aria-label="Pendências" className="rounded-[10px] border border-border divide-y divide-border">
          <p className="px-4 py-2.5 text-[13px] font-semibold text-muted-foreground bg-secondary rounded-t-[10px]">Pendências para resolver</p>
          {alerts.map(([count, text, tab]) => (
            <button key={tab} type="button" onClick={() => goTo(tab)} className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm hover:bg-secondary/60">
              {tab !== "comissoes" && <span className="min-w-[28px] h-6 px-2 rounded-md bg-accent text-accent-foreground text-[13px] font-bold flex items-center justify-center">{count}</span>}
              <span className="flex-1 font-medium">{text}</span>
              <span aria-hidden="true" className="text-muted-foreground">→</span>
            </button>
          ))}
        </section>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map(([label, value, sub]) => (
          <Card key={label} className="p-4">
            <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
            <p className={`font-display text-2xl mt-2 ${isLoading ? "opacity-40" : ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[["Lojas ativas", n("stores_approved")], ["Suspensas", n("stores_suspended")], ["Usuários", n("users")]].map(([l, v]) => (
          <Card key={l} className="p-3"><p className="font-display text-xl">{v}</p><p className="text-xs text-muted-foreground">{l}</p></Card>
        ))}
      </div>
    </div>
  );
}
