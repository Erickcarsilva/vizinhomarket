import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import StoreCard from "@/components/home/StoreCard";
import { brl, isStoreListable } from "@/lib/constants";
import { Image } from "@/components/ui/image";

export default function Busca() {
  const [q, setQ] = useState("");
  const { data: stores = [], isLoading } = useQuery({ queryKey: ["stores", "approved"], queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200) });
  // Produtos: busca no servidor, 300 ms depois que a pessoa para de digitar.
  const [typed, setTyped] = useState("");
  useEffect(() => { const id = setTimeout(() => setTyped(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const { data: products = [], isFetching: searching } = useQuery({
    queryKey: ["products", "search", typed.toLowerCase()],
    queryFn: () => base44.entities.Product.search(typed),
    enabled: typed.length >= 2,
  });

  const active = stores.filter(isStoreListable);
  const term = q.trim().toLowerCase();
  const storeResults = term
    ? active.filter((s) => s.name.toLowerCase().includes(term) || (s.description || "").toLowerCase().includes(term))
    : active;
  const listable = new Set(active.map((s) => s.id));
  const productResults = typed.length >= 2 ? products.filter((p) => listable.has(p.store_id)) : [];

  return (
    <div className="max-w-6xl mx-auto px-5 py-12">
      <div className="mb-8">
        <h1 className="font-display text-4xl mt-2">Encontre lojas e produtos</h1>
      </div>
      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por loja ou produto..."
          className="w-full h-12 pl-12 pr-10 rounded-full border border-input bg-card text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Limpar" className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl mb-5">Lojas {!term && `(${storeResults.length})`}</h2>
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">{[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] rounded-2xl bg-muted animate-pulse" />)}</div>
        ) : storeResults.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma loja encontrada para "{q}".</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
            {storeResults.map((s) => <StoreCard key={s.id} store={s} />)}
          </div>
        )}
      </section>

      {term && (
        <section className="mt-14">
          <h2 className="font-display text-2xl mb-5">Produtos ({searching ? "…" : productResults.length})</h2>
          {searching && productResults.length === 0 ? (
            <p className="text-muted-foreground">Buscando…</p>
          ) : productResults.length === 0 ? (
            <p className="text-muted-foreground">Nenhum produto encontrado para "{q}".</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {productResults.slice(0, 16).map((p) => (
                <Link key={p.id} to={`/loja/${p.store_id}`} className="group rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors">
                  <div className="aspect-square bg-secondary">
                    {p.image_url ? (
                      <Image src={p.image_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-display text-3xl text-primary/40">{(p.name || "?")[0]}</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="font-display text-lg mt-1">{brl(p.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}