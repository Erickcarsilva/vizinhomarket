import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { usePartnerStore } from "@/lib/usePartnerStore";
import StoreSwitcher from "@/components/partner/StoreSwitcher";
import NoStore from "@/components/partner/NoStore";
import TrialCard from "@/components/partner/TrialCard";
import { brl } from "@/lib/constants";


export default function Finance() {
  const { stores, store, pickStore, isLoading } = usePartnerStore();
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", store?.id],
    queryFn: () => base44.entities.Order.filter({ store_id: store.id }, "-created_date", 300),
    enabled: !!store,
  });

  if (isLoading) return <div className="max-w-6xl mx-auto px-5 py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" /></div>;
  if (stores.length === 0) return <NoStore />;

  return (
    <div className="max-w-5xl mx-auto px-5 py-12 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Financeiro</p>
          <h1 className="font-display text-4xl mt-2">Comissões e faturas</h1>
        </div>
        <StoreSwitcher stores={stores} store={store} onPick={pickStore} />
      </div>

      <TrialCard store={store} orders={orders} />

      <section className="bg-card border border-border rounded-2xl p-6">
        <h2 className="font-display text-2xl mb-1">Pedidos concluídos</h2>
        <p className="text-sm text-muted-foreground mb-4">A comissão é calculada pelo servidor em cada pedido entregue. A fatura do período chega pelo WhatsApp e é paga por Pix.</p>
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr><th className="text-left font-medium px-4 py-3">Data</th><th className="text-left font-medium px-4 py-3">Pedido</th><th className="text-right font-medium px-4 py-3">Venda</th><th className="text-right font-medium px-4 py-3">Comissão</th></tr>
            </thead>
            <tbody>
              {orders.filter((o) => o.status === "DELIVERED").slice(0, 50).map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-3">{new Date(o.created_date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">{o.code}</td>
                  <td className="px-4 py-3 text-right">{brl(o.subtotal)}</td>
                  <td className="px-4 py-3 text-right">{brl(o.commission_amount)}</td>
                </tr>
              ))}
              {!orders.some((o) => o.status === "DELIVERED") && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Nenhum pedido concluído ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}