import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCart } from "@/lib/CartContext";
import StoreHeader from "@/components/store/StoreHeader";
import ProductRow from "@/components/store/ProductRow";
import CartBar from "@/components/store/CartBar";
import ProductOptions, { hasOptions } from "@/components/store/ProductOptions";

export default function StorePage() {
  const { id } = useParams();
  const { cart, add, clear, qtyOfProduct } = useCart();
  const [picking, setPicking] = useState(null);

  const { data: store, isLoading } = useQuery({ queryKey: ["store", id], queryFn: () => base44.entities.Store.get(id) });
  const { data: products = [] } = useQuery({
    queryKey: ["products", id],
    queryFn: () => base44.entities.Product.filter({ store_id: id, available: true }, "category", 500),
  });

  if (isLoading) return <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5" aria-busy="true"><div className="w-[76px] h-[76px] rounded-[18px] bg-secondary animate-pulse" /><div className="h-7 w-2/3 mt-4 rounded bg-secondary animate-pulse" /><div className="h-4 w-1/3 mt-3 rounded bg-secondary animate-pulse" /></div>;
  if (!store || store.status !== "approved") return (
    <div className="max-w-md mx-auto px-4 py-20 text-center space-y-3">
      <h1 className="font-display text-2xl text-marca">Loja não encontrada</h1>
      <p className="text-muted-foreground">Ela pode ter saído do VizinhoMarket ou o endereço está errado.</p>
      <Link to="/" className="btn-contorno">Ver as lojas da cidade</Link>
    </div>
  );

  const sameStoreOrConfirm = () => {
    if (cart.store && cart.store.id !== store.id) {
      if (!window.confirm(`Seu carrinho tem itens de ${cart.store.name}. Deseja esvaziá-lo e começar um novo pedido aqui?`)) return false;
      clear();
    }
    return true;
  };
  const handleAdd = (product) => {
    if (hasOptions(product)) { setPicking(product); return; }
    if (sameStoreOrConfirm()) add(store, product);
  };
  const confirmOptions = (option) => { if (sameStoreOrConfirm()) add(store, picking, option); };

  const groups = products.reduce((acc, p) => {
    const key = p.category || "Produtos";
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});
  const names = Object.keys(groups);

  return (
    <div className="pb-24">
      <StoreHeader store={store} />
      {names.length > 1 && (
        <div className="sticky top-16 z-30 bg-background border-b border-border mt-4">
          <nav aria-label="Seções do cardápio" className="max-w-4xl mx-auto flex gap-6 overflow-x-auto no-scrollbar px-4 sm:px-6">
            {names.map((n, i) => (
              <a key={n} href={`#secao-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`secao-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="shrink-0 h-11 flex items-center text-[15px] font-medium text-[#4A4840] hover:text-marca whitespace-nowrap">{n}</a>
            ))}
          </nav>
        </div>
      )}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-5 space-y-7">
        {names.length === 0 && <p className="text-muted-foreground py-6">Esta loja ainda não cadastrou produtos.</p>}
        {Object.entries(groups).map(([name, items], i) => (
          <section key={name} id={`secao-${i}`} className="scroll-mt-32">
            <h2 className="font-display text-[22px] leading-tight text-marca">{name}</h2>
            <div>
              {items.map((p) => (
                <ProductRow key={p.id} product={p} disabled={!store.is_open} inCart={qtyOfProduct(store.id, p.id)} onAdd={() => handleAdd(p)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <CartBar storeId={store.id} />
      <ProductOptions product={picking} open={!!picking} onOpenChange={(o) => !o && setPicking(null)} onConfirm={confirmOptions} />
    </div>
  );
}