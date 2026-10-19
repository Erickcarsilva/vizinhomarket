import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import CategoryPills from "@/components/home/CategoryPills";
import CityPills from "@/components/home/CityPills";
import StoreCard from "@/components/home/StoreCard";
import { isStoreListable } from "@/lib/constants";

export default function Vitrine() {
  const params = new URLSearchParams(window.location.search);
  const [category, setCategory] = useState(params.get("categoria"));
  const [city, setCity] = useState(params.get("cidade"));
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const cities = [...new Set(stores.map((s) => s.city).filter(Boolean))];
  const visible = stores
    .filter(isStoreListable)
    .filter((s) => !city || s.city === city)
    .filter((s) => !category || s.category === category)
    .sort((a, b) => Number(b.is_open) - Number(a.is_open));

  return (
    <div className="max-w-6xl mx-auto px-5 py-12">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Vitrine</p>
        <h1 className="font-display text-4xl mt-2">Todas as lojas da cidade</h1>
      </div>
      <CategoryPills value={category} onChange={setCategory} />
      {cities.length > 1 && <CityPills value={city} onChange={setCity} cities={cities} />}
      <div className="flex items-baseline justify-between mt-10 mb-6">
        <h2 className="font-display text-2xl">{visible.length} {visible.length === 1 ? "loja" : "lojas"}</h2>
      </div>
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center">Nenhuma loja encontrada com esses filtros.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {visible.map((s) => <StoreCard key={s.id} store={s} />)}
        </div>
      )}
    </div>
  );
}