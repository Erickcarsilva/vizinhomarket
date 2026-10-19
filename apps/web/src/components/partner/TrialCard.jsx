import React from "react";
import { brl } from "@/lib/constants";

// Resumo do mês da loja: vendas concluídas e a comissão devida (sem mensalidade).
export default function TrialCard({ store, orders }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = orders.filter((o) => new Date(o.created_date) >= monthStart);
  const done = month.filter((o) => o.status === "DELIVERED");
  const sales = done.reduce((s, o) => s + (o.subtotal || 0), 0);
  const commission = done.reduce((s, o) => s + (o.commission_amount || 0), 0);
  const cancelled = month.filter((o) => o.status === "CANCELLED").length;
  const stats = [
    ["Pedidos no mês", month.length],
    ["Vendas concluídas", brl(sales)],
    ["Comissão do mês", brl(commission)],
    ["Cancelados", cancelled],
  ];

  return (
    <div className="rounded-3xl bg-primary text-primary-foreground p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.25em] opacity-70">{store.status === "pending" ? "Aguardando aprovação" : store.status === "suspended" ? "Loja suspensa" : "Sem mensalidade · você só paga quando vende"}</p>
        <p className="text-sm opacity-80">{now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
        {stats.map(([label, value]) => (
          <div key={label}>
            <p className="font-display text-3xl">{value}</p>
            <p className="text-xs opacity-70 mt-1">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
