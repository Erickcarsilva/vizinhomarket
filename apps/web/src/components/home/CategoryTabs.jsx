import React from "react";
import { CATEGORIES } from "@/lib/constants";

// Nome curto de cada categoria para as abas.
export const SHORT = { alimentacao: "Restaurantes", mercado: "Mercado", pet: "Pet shop", bebidas: "Bebidas", autopecas: "Autopeças", eletronicos: "Eletrônicos", lojas: "Variedades" };

// Abas de categoria em linha, com sublinhado verde na escolhida. O mesmo componente no Início, na Vitrine e na Busca.
// available: categorias que têm loja (as outras não aparecem). sticky: fica preso abaixo do topo ao rolar.
export default function CategoryTabs({ value, onChange, available, sticky = true }) {
  const list = CATEGORIES.filter((c) => !available || available.has(c.id));
  const tab = (id, label) => {
    const on = value === id;
    return (
      <button key={id ?? "tudo"} type="button" onClick={() => onChange(id)} aria-pressed={on}
        className={`shrink-0 h-11 border-b-2 text-[15px] transition-colors ${on ? "border-marca text-marca font-semibold" : "border-transparent text-[#4A4840] font-medium hover:text-foreground"}`}>
        {label}
      </button>
    );
  };
  return (
    <div className={`${sticky ? "sticky top-16 z-30" : ""} bg-background border-b border-border mt-2`}>
      <nav aria-label="Categorias" className="flex gap-6 overflow-x-auto no-scrollbar px-4 sm:px-6">
        {tab(null, "Tudo")}
        {list.map((c) => tab(c.id, SHORT[c.id] || c.label))}
      </nav>
    </div>
  );
}
