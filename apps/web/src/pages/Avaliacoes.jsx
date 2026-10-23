import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { brl } from "@/lib/constants";
import { useMyOrders } from "@/lib/useMyOrders";
import RateOrder from "@/components/order/RateOrder";

export default function Avaliacoes() {
  const qc = useQueryClient();
  const { orders, isLoading, ids } = useMyOrders();
  const reload = () => qc.invalidateQueries({ queryKey: ["my-orders", ids.join()] });
  const delivered = orders
    .filter((o) => o.status === "DELIVERED")
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 space-y-8">
      <div>
        <h1 className="font-display text-4xl mt-2">Avalie suas lojas</h1>
        <p className="text-muted-foreground mt-3">Conte como foi sua experiência com os pedidos já entregues.</p>
      </div>
      {isLoading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : delivered.length === 0 ? (
        <div className="text-center py-16">
          <Star className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">Você ainda não tem pedidos entregues para avaliar.</p>
          <Link to="/vitrine" className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold">Explorar lojas</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {delivered.map((o) => (
            <div key={o.id} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Link to={`/loja/${o.store_id}`} className="font-display text-xl hover:text-primary transition-colors">{o.store_name}</Link>
                <span className="text-sm text-muted-foreground">{brl(o.total)} · {new Date(o.created_date).toLocaleDateString("pt-BR")}</span>
              </div>
              <RateOrder order={o} onSaved={reload} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}