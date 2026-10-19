import React from "react";
import { usePartnerStore } from "@/lib/usePartnerStore";
import StoreSwitcher from "@/components/partner/StoreSwitcher";
import NoStore from "@/components/partner/NoStore";
import ProductsManager from "@/components/partner/ProductsManager";

export default function ManageProducts() {
  const { stores, store, pickStore, isLoading } = usePartnerStore();
  if (isLoading) return <div className="max-w-6xl mx-auto px-5 py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" /></div>;
  if (stores.length === 0) return <NoStore />;
  return (
    <div className="max-w-4xl mx-auto px-5 py-12 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Catálogo</p>
          <h1 className="font-display text-4xl mt-2">Gerenciar produtos</h1>
        </div>
        <StoreSwitcher stores={stores} store={store} onPick={pickStore} />
      </div>
      {store && <ProductsManager storeId={store.id} />}
    </div>
  );
}