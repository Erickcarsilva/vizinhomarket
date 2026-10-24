import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CATEGORIES, isStoreListable } from "@/lib/constants";
import { listaLojas } from "@/pages/Home";

export default function Categorias() {
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const active = stores.filter(isStoreListable);
  const count = (id) => active.filter((s) => s.category === id).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-10">
      <h1 className="font-display text-2xl text-marca">Categorias</h1>
      <p className="text-[15px] text-muted-foreground mt-1">Escolha pelo tipo de comércio.</p>
      <div className={`${listaLojas} mt-3`}>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const n = count(c.id);
          return (
            <Link key={c.id} to={`/vitrine?categoria=${c.id}`}
              className="flex items-center gap-3.5 py-3 min-w-0 border-b border-[#EDE6D8] hover:bg-secondary/50 transition-colors">
              <span className="w-12 h-12 shrink-0 rounded-[12px] bg-[#E5DDCE] text-marca flex items-center justify-center"><Icon className="w-6 h-6" aria-hidden="true" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold truncate">{c.label}</span>
                <span className="block text-[13px] text-muted-foreground">{isLoading ? "Carregando…" : n === 0 ? "Nenhuma loja ainda" : `${n} ${n === 1 ? "loja" : "lojas"}`}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
