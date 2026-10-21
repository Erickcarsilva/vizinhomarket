import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { usePartnerStore } from "@/lib/usePartnerStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TrialCard from "@/components/partner/TrialCard";
import OrdersBoard from "@/components/partner/OrdersBoard";
import ProductsManager from "@/components/partner/ProductsManager";
import StoreSettings from "@/components/partner/StoreSettings";
import NewOrderAlert from "@/components/partner/NewOrderAlert";

export default function Partner() {
  const qc = useQueryClient();
  const { stores: myStores, store, pickStore } = usePartnerStore();

  const { data: orders = [], isSuccess: ordersReady } = useQuery({
    queryKey: ["orders", store?.id],
    queryFn: () => base44.entities.Order.filter({ store_id: store.id }, "-created_date", 300),
    enabled: !!store,
    // Reserva caso o tempo real caia (internet móvel instável): confere de novo a cada 20 s.
    refetchInterval: 20000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => base44.entities.Order.subscribe((e) => {
    if (e.data?.store_id === store?.id) qc.invalidateQueries({ queryKey: ["orders", store?.id] });
  }), [store?.id, qc]);

  const refreshOrders = () => qc.invalidateQueries({ queryKey: ["orders", store?.id] });

  return (
    <div className="max-w-6xl mx-auto px-5 py-12 space-y-10">
      <NewOrderAlert key={store?.id} orders={orders} ready={ordersReady} />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Área do lojista</p>
          <h1 className="font-display text-4xl mt-2">{store?.name || "Minhas lojas"}</h1>
        </div>
        {myStores.length > 0 && (
          <div className="flex items-center gap-3">
            <Select value={store?.id} onValueChange={pickStore}>
              <SelectTrigger className="w-64 h-11 rounded-full"><SelectValue placeholder="Escolher loja" /></SelectTrigger>
              <SelectContent>{myStores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <Link to="/cadastrar-loja" className="text-sm underline underline-offset-4 whitespace-nowrap">Nova loja</Link>
          </div>
        )}
      </div>

      {myStores.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center space-y-4">
          <p className="text-muted-foreground">Você ainda não tem lojas cadastradas.</p>
          <Link to="/cadastrar-loja" className="inline-block h-12 leading-[3rem] px-8 rounded-full bg-primary text-primary-foreground font-semibold">Cadastrar minha loja</Link>
        </div>
      ) : store ? (
        <>
          {(() => {
            const pending = orders.filter((o) => o.status === "CREATED" || o.status === "ACCEPTED").length;
            return (
              <div className={`rounded-2xl p-5 flex items-center justify-between gap-4 ${pending ? "bg-accent/10 border border-accent/30" : "bg-card border border-border"}`}>
                <div>
                  <p className="font-display text-3xl">{pending || "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {pending === 0 ? "Nenhum pedido aguardando ação" : pending === 1 ? "pedido precisa de ação" : "pedidos precisam de ação"}
                  </p>
                </div>
                {pending > 0 && <span className="text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-accent text-accent-foreground whitespace-nowrap">Ação necessária</span>}
              </div>
            );
          })()}
          <div className="flex flex-wrap gap-2 text-sm">
        <Link to="/relatorios" className="h-9 px-4 rounded-full border border-border hover:bg-secondary flex items-center">Relatórios</Link>
        <Link to="/gerenciar-produtos" className="h-9 px-4 rounded-full border border-border hover:bg-secondary flex items-center">Produtos</Link>
        <Link to="/editar-perfil" className="h-9 px-4 rounded-full border border-border hover:bg-secondary flex items-center">Perfil da loja</Link>
        <Link to="/financeiro" className="h-9 px-4 rounded-full border border-border hover:bg-secondary flex items-center">Financeiro</Link>
      </div>
      <TrialCard store={store} orders={orders} />
          <Tabs defaultValue="orders">
            <TabsList className="rounded-full h-11 p-1">
              <TabsTrigger value="orders" className="rounded-full px-5">Pedidos</TabsTrigger>
              <TabsTrigger value="catalog" className="rounded-full px-5">Catálogo</TabsTrigger>
              <TabsTrigger value="settings" className="rounded-full px-5">Loja</TabsTrigger>
            </TabsList>
            <TabsContent value="orders" className="mt-8"><OrdersBoard orders={orders} onChanged={refreshOrders} /></TabsContent>
            <TabsContent value="catalog" className="mt-8"><ProductsManager storeId={store.id} /></TabsContent>
            <TabsContent value="settings" className="mt-8">
              <StoreSettings key={store.id + store.updated_date} store={store} onSaved={() => qc.invalidateQueries({ queryKey: ["stores"] })} />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}