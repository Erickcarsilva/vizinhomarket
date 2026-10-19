import React from "react";
import { brl } from "@/lib/constants";

export default function Metrics({ stores, orders }) {
  const delivered = orders.filter((o) => o.status === "DELIVERED");
  const gmv = delivered.reduce((s, o) => s + (o.total || 0), 0);
  const cancelled = orders.filter((o) => o.status === "CANCELLED").length;
  const items = [
    ["GMV", brl(gmv)],
    ["Pedidos", orders.length],
    ["Ticket médio", brl(delivered.length ? gmv / delivered.length : 0)],
    ["Cancelamento", `${orders.length ? Math.round((cancelled / orders.length) * 100) : 0}%`],
    ["Lojas ativas", stores.filter((s) => s.status === "approved").length],
    ["Comissão (entregues)", brl(delivered.reduce((t, o) => t + (o.commission_amount || 0), 0))],
    ["Lojas suspensas", stores.filter((s) => s.status === "suspended").length],
    ["Aguardando", stores.filter((s) => s.status === "pending").length],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">
      {items.map(([label, value]) => (
        <div key={label} className="bg-card p-6">
          <p className="font-display text-3xl">{value}</p>
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground mt-2">{label}</p>
        </div>
      ))}
    </div>
  );
}