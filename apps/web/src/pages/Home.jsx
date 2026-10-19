import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Hero from "@/components/home/Hero";
import CategoryPills from "@/components/home/CategoryPills";
import CityPills from "@/components/home/CityPills";
import StoreCard from "@/components/home/StoreCard";
import ProductCard from "@/components/home/ProductCard";
import WhyVizinho from "@/components/home/WhyVizinho";
import { isStoreListable } from "@/lib/constants";

const StoreGrid = ({ list }) => (
  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
    {list.map((s) => (
      <StoreCard key={s.id} store={s} />
    ))}
  </div>
);

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [city, setCity] = useState(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => base44.entities.Product.filter({ available: true }, "-created_date", 1000),
  });

  const cities = [...new Set(stores.map((s) => s.city).filter(Boolean))];
  const q = query.trim().toLowerCase();
  const matchStoreIds = new Set(
    products.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.store_id)
  );
  const visible = stores
    .filter(isStoreListable)
    .filter((s) => !city || s.city === city)
    .filter((s) => !category || s.category === category)
    .filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q) ||
        matchStoreIds.has(s.id)
    )
    .sort((a, b) => Number(b.is_open) - Number(a.is_open));

  const openNow = visible.filter((s) => s.is_open).slice(0, 6);
  const storeById = new Map(visible.map((s) => [s.id, s]));
  const featured = products
    .filter((p) => storeById.has(p.store_id))
    .sort((a, b) => Number(!!b.image_url) - Number(!!a.image_url))
    .slice(0, 8);

  return (
    <div>
      <Hero query={query} onQuery={setQuery} />
      <CategoryPills value={category} onChange={setCategory} />
      {cities.length > 1 && <CityPills value={city} onChange={setCity} cities={cities} />}

      {q ? (
        <section className="max-w-6xl mx-auto px-5 mt-12">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="font-display text-3xl">Resultados</h2>
            <span className="text-sm text-muted-foreground">
              {visible.length} {visible.length === 1 ? "loja" : "lojas"}
            </span>
          </div>
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-[4/3] rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center">
              Nenhuma loja encontrada. Tente ajustar a busca ou escolher outra categoria.
            </p>
          ) : (
            <StoreGrid list={visible} />
          )}
        </section>
      ) : (
        <>
          {openNow.length > 0 && (
            <section className="max-w-6xl mx-auto px-5 mt-12">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="font-display text-3xl">Lojas abertas agora</h2>
                <span className="text-sm text-muted-foreground">{openNow.length} abertas</span>
              </div>
              <div className="flex gap-5 overflow-x-auto pb-4 no-scrollbar">
                {openNow.map((s) => (
                  <div key={s.id} className="w-[260px] sm:w-[280px] shrink-0">
                    <StoreCard store={s} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="max-w-6xl mx-auto px-5 mt-12">
            <div className="flex items-baseline justify-between mb-8">
              <h2 className="font-display text-3xl">Explore lojas da cidade</h2>
              <span className="text-sm text-muted-foreground">
                {visible.length} {visible.length === 1 ? "loja" : "lojas"}
              </span>
            </div>
            {isLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="aspect-[4/3] rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-muted-foreground">Nenhuma loja disponível ainda.</p>
                <Link to="/indique-loja" className="inline-block text-primary underline underline-offset-4">
                  Conhece um comércio legal? Indique uma loja
                </Link>
              </div>
            ) : (
              <StoreGrid list={visible} />
            )}
          </section>

          {featured.length > 0 && (
            <section className="max-w-6xl mx-auto px-5 mt-16">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="font-display text-3xl">Produtos em destaque</h2>
                <Link to="/busca" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
                  Ver mais
                </Link>
              </div>
              <div className="flex gap-5 overflow-x-auto pb-4 no-scrollbar">
                {featured.map((p) => (
                  <ProductCard key={p.id} product={p} store={storeById.get(p.store_id)} />
                ))}
              </div>
            </section>
          )}

          <WhyVizinho />
        </>
      )}
    </div>
  );
}