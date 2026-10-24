import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import CategoryTabs from "@/components/home/CategoryTabs";
import CityPills from "@/components/home/CityPills";
import StoreCard from "@/components/home/StoreCard";
import { listaLojas } from "@/pages/Home";
import { categoryLabel, isStoreListable } from "@/lib/constants";

export default function Vitrine() {
  const params = new URLSearchParams(window.location.search);
  const [category, setCategory] = useState(params.get("categoria"));
  const [city, setCity] = useState(params.get("cidade"));
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const listable = stores.filter(isStoreListable);
  const cities = [...new Set(listable.map((s) => s.city).filter(Boolean))];
  const present = new Set(listable.map((s) => s.category));
  const visible = listable
    .filter((s) => !city || s.city === city)
    .filter((s) => !category || s.category === category)
    .sort((a, b) => Number(b.is_open) - Number(a.is_open));

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <h1 className="font-display text-2xl text-marca px-4 sm:px-6 pt-4">Todas as lojas da cidade</h1>
      <CategoryTabs value={category} onChange={setCategory} available={present} />
      {cities.length > 1 && <div className="pt-3"><CityPills value={city} onChange={setCity} cities={cities} /></div>}
      <section className="px-4 sm:px-6 pt-5" aria-live="polite">
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Carregando lojas…</p>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center">Nenhuma loja encontrada com esses filtros.</p>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">{visible.length} {visible.length === 1 ? "loja" : "lojas"}{category ? ` de ${categoryLabel(category)}` : ""}</p>
            <div className={listaLojas}>{visible.map((s) => <StoreCard key={s.id} store={s} />)}</div>
          </>
        )}
      </section>
    </div>
  );
}
