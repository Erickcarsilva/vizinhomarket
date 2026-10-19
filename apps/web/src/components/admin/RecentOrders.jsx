import React from "react";
import { Link } from "react-router-dom";
import { brl, STATUS, FULFILLMENT } from "@/lib/constants";

export default function RecentOrders({ orders }) {
  if (!orders.length) return <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>;
  return (
    <div className="bg-card border border-border rounded-2xl divide-y divide-border">
      {orders.slice(0, 15).map((o) => (
        <Link key={o.id} to={`/pedido/${o.id}`} className="p-4 flex items-center gap-4 hover:bg-secondary/50 transition">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{o.store_name} · {o.customer_name}</p>
            <p className="text-xs text-muted-foreground">{new Date(o.created_date).toLocaleString("pt-BR")} · {FULFILLMENT[o.fulfillment]}</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
          <span className="w-24 text-right font-semibold text-sm">{brl(o.total)}</span>
        </Link>
      ))}
    </div>
  );
}