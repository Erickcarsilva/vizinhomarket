import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCart } from "@/lib/CartContext";
import StoreHeader from "@/components/store/StoreHeader";
import ProductRow from "@/components/store/ProductRow";
import CartBar from "@/components/store/CartBar";

export default function StorePage() {
  const { id } = useParams();
  const { cart, add, clear } = useCart();

  const { data: store, isLoading } = useQuery({ queryKey: ["store", id], queryFn: () => base44.entities.Store.get(id) });
  const { data: products = [] } = useQuery({
    queryKey: ["products", id],
    queryFn: () => base44.entities.Product.filter({ store_id: id, available: true }, "category", 500),
  });

  if (isLoading) return <div className="h-80 bg-muted animate-pulse" />;
  if (!store || store.status !== "approved") return <p className="text-center py-24 text-muted-foreground">Loja não encontrada.</p>;

  const handleAdd = (product) => {
    if (cart.store && cart.store.id !== store.id) {
      if (!window.confirm(`Seu carrinho tem itens de ${cart.store.name}. Deseja esvaziá-lo e começar um novo pedido aqui?`)) return;
      clear();
    }
    add(store, product);
  };

  const groups = products.reduce((acc, p) => {
    const key = p.category || "Produtos";
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});
  const qtyOf = (pid) => cart.store?.id === store.id ? cart.items.find((i) => i.product_id === pid)?.quantity : 0;

  return (
    <div className="pb-24">
      <StoreHeader store={store} />
      <div className="max-w-4xl mx-auto px-5 mt-12 space-y-12">
        {Object.keys(groups).length === 0 && <p className="text-muted-foreground">Esta loja ainda não cadastrou produtos.</p>}
        {Object.entries(groups).map(([name, items]) => (
          <section key={name}>
            <h2 className="font-display text-2xl mb-2">{name}</h2>
            <div>
              {items.map((p) => (
                <ProductRow key={p.id} product={p} disabled={!store.is_open} inCart={qtyOf(p.id)} onAdd={() => handleAdd(p)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <CartBar storeId={store.id} />
    </div>
  );
}