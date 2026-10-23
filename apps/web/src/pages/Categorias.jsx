import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CATEGORIES, isStoreListable } from "@/lib/constants";

export default function Categorias() {
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const active = stores.filter(isStoreListable);
  const count = (id) => active.filter((s) => s.category === id).length;

  return (
    <div className="max-w-6xl mx-auto px-5 py-12">
      <div className="mb-10">
        <h1 className="font-display text-4xl mt-2">Categorias</h1>
        <p className="text-muted-foreground mt-3 max-w-xl">Encontre rapidamente o que você precisa, escolhendo por tipo de comércio.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const n = count(c.id);
          return (
            <Link
              key={c.id}
              to={`/vitrine?categoria=${c.id}`}
              className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-sm transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="w-6 h-6" />
              </div>
              <h2 className="font-display text-2xl mt-4">{c.label}</h2>
              <p className="text-sm text-muted-foreground mt-1">{isLoading ? "—" : `${n} ${n === 1 ? "loja" : "lojas"}`}</p>
              <span className="inline-block mt-4 text-sm font-semibold text-primary group-hover:underline">Explorar →</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}