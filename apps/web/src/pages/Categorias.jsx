import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CATEGORIES, isStoreListable } from "@/lib/constants";
import { categoryStyle } from "@/lib/categoryStyle";

// Todas as categorias, com a cor e o símbolo de cada uma e a quantidade real de lojas.
// As que já têm loja vêm primeiro; as vazias ficam no fim, mais discretas (não somem: mostram o que a cidade ainda pode ter).
export default function Categorias() {
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const active = stores.filter(isStoreListable);
  const count = (id) => active.filter((s) => s.category === id).length;
  const list = [...CATEGORIES].sort((a, b) => Number(count(b.id) > 0) - Number(count(a.id) > 0));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-10">
      <h1 className="font-display text-[26px]">Categorias</h1>
      <p className="text-[15px] text-muted-foreground mt-1">Tudo o que o comércio da cidade oferece, por tipo.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-5">
        {list.map((c) => {
          const st = categoryStyle(c.id);
          const Icon = st.icon;
          const n = count(c.id);
          return (
            <Link key={c.id} to={`/vitrine?categoria=${c.id}`}
              className={`relative overflow-hidden rounded-[10px] p-3.5 min-h-[104px] flex flex-col justify-between transition-transform active:scale-[0.98] ${n === 0 ? "opacity-70" : ""}`}
              style={{ background: st.bg }}>
              <Icon className="absolute -right-2 -bottom-2 w-16 h-16" style={{ color: st.fg, opacity: 0.22 }} strokeWidth={1.5} aria-hidden="true" />
              <span className="relative text-[15px] font-bold leading-tight" style={{ color: st.fg }}>{c.label}</span>
              <span className="relative text-[12.5px] font-semibold text-foreground/75">{isLoading ? "…" : n === 0 ? "Em breve" : `${n} ${n === 1 ? "loja" : "lojas"}`}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
