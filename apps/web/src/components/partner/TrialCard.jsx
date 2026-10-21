import React, { useMemo } from "react";
import { brl } from "@/lib/constants";
import { useStoreSummary } from "@/lib/useStoreOrders";

// Resumo do mês da loja, calculado no servidor (vale para qualquer quantidade de pedidos). Sem mensalidade.
export default function TrialCard({ store }) {
  const { from, to, label } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: start.toISOString(), to: end.toISOString(), label: now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }, []);
  const { data: s, isLoading } = useStoreSummary(store?.id, from, to);
  const stats = [
    ["Pedidos no mês", s ? s.orders : "…"],
    ["Vendas entregues", s ? brl(s.sales) : "…"],
    ["Comissão do mês", s ? brl(s.commission) : "…"],
    ["Cancelados", s ? s.cancelled : "…"],
  ];

  return (
    <div className="rounded-3xl bg-primary text-primary-foreground p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.25em] opacity-70">{store?.status === "pending" ? "Aguardando aprovação" : store?.status === "suspended" ? "Loja suspensa" : "Sem mensalidade · você só paga quando vende"}</p>
        <p className="text-sm opacity-80">{label}</p>
      </div>
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 ${isLoading ? "opacity-50" : ""}`}>
        {stats.map(([l, value]) => (
          <div key={l}>
            <p className="font-display text-3xl" data-stat={l}>{value}</p>
            <p className="text-xs opacity-70 mt-1">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
