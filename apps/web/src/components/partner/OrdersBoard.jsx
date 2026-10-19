import React from "react";
import OrderCard from "@/components/partner/OrderCard";

const COLUMNS = [
  { title: "Novos", statuses: ["CREATED"] },
  { title: "Em andamento", statuses: ["ACCEPTED", "PREPARING", "READY", "IN_TRANSIT"] },
  { title: "Concluídos", statuses: ["DELIVERED", "CANCELLED"] },
];

export default function OrdersBoard({ orders, onChanged }) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {COLUMNS.map((col) => {
        const list = orders.filter((o) => col.statuses.includes(o.status));
        return (
          <div key={col.title}>
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="font-display text-xl">{col.title}</h3>
              <span className="text-sm text-muted-foreground">{list.length}</span>
            </div>
            <div className="space-y-4">
              {list.length === 0 && <p className="text-sm text-muted-foreground border border-dashed border-border rounded-2xl p-6 text-center">Nada por aqui</p>}
              {list.map((o) => <OrderCard key={o.id} order={o} onChanged={onChanged} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}