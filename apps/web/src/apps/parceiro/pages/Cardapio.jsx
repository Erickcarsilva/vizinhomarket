import React from "react";
import { useOutletContext } from "react-router-dom";
import ProductsManager from "@/components/partner/ProductsManager";

export default function Cardapio() {
  const { store } = useOutletContext();
  if (!store) return null;
  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Cardápio</p>
        <h1 className="font-display text-4xl mt-2">Produtos e preços</h1>
        <p className="text-sm text-muted-foreground mt-2">Altere preços, tamanhos, adicionais e disponibilidade. As mudanças valem na hora para os clientes.</p>
      </div>
      <ProductsManager storeId={store.id} />
    </div>
  );
}
