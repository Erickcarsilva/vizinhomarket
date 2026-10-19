import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { brl, STATUS } from "@/lib/constants";
import { useMyOrders } from "@/lib/useMyOrders";

export default function MyOrders() {
  const { orders, isLoading } = useMyOrders();

  return (
    <div className="max-w-3xl mx-auto px-5 py-12">
      <h1 className="font-display text-4xl mb-10">Meus pedidos</h1>
      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground">Você ainda não fez nenhum pedido. Explore as lojas perto de você e faça sua primeira compra.</p>
      ) : (
        <div className="divide-y divide-border/70">
          {orders.map((o) => (
            <Link key={o.id} to={`/pedido/${o.id}`} className="flex items-center gap-4 py-5 group">
              <div className="flex-1">
                <p className="font-display text-xl">{o.store_name}</p>
                <p className="text-sm text-muted-foreground">{new Date(o.created_date).toLocaleDateString("pt-BR")} · {brl(o.total)}</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}