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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-6">
      <div>
        <h1 className="font-display text-2xl text-marca">Avalie suas lojas</h1>
        <p className="text-muted-foreground mt-1">Conte como foi sua experiência com os pedidos já entregues.</p>
      </div>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando pedidos…</p>
      ) : delivered.length === 0 ? (
        <div className="text-center py-16">
          <span className="mx-auto w-16 h-16 rounded-full bg-[#E5DDCE] text-marca flex items-center justify-center"><Star className="w-7 h-7" aria-hidden="true" /></span>
          <p className="text-muted-foreground mt-4">Você ainda não tem pedidos entregues para avaliar.</p>
          <Link to="/" className="btn-acao mt-6">Ver as lojas</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {delivered.map((o) => (
            <div key={o.id} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 min-w-0">
                <Link to={`/loja/${o.store_id}`} className="text-base font-semibold hover:text-marca transition-colors break-words min-w-0">{o.store_name}</Link>
                <span className="text-[13px] text-muted-foreground">{brl(o.total)} · {new Date(o.created_date).toLocaleDateString("pt-BR")}</span>
              </div>
              <RateOrder order={o} onSaved={reload} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}