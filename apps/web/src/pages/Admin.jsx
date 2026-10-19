import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Metrics from "@/components/admin/Metrics";
import StoresTable from "@/components/admin/StoresTable";
import RecentOrders from "@/components/admin/RecentOrders";

export default function Admin() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ["stores", "all"], queryFn: () => base44.entities.Store.list("-created_date", 500) });
  const { data: orders = [] } = useQuery({ queryKey: ["orders", "all"], queryFn: () => base44.entities.Order.list("-created_date", 1000) });

  return (
    <div className="max-w-6xl mx-auto px-5 py-12 space-y-12">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Administração</p>
        <h1 className="font-display text-4xl mt-2">Operação Sidrolândia</h1>
      </div>
      <Metrics stores={stores} orders={orders} />
      <section>
        <h2 className="font-display text-2xl mb-4">Lojas</h2>
        <StoresTable stores={stores} onChanged={() => qc.invalidateQueries({ queryKey: ["stores"] })} />
      </section>
      <section>
        <h2 className="font-display text-2xl mb-4">Pedidos recentes</h2>
        <RecentOrders orders={orders} />
      </section>
    </div>
  );
}