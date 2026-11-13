import React from "react";
import { LayoutGrid } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";

// Nome curto de cada categoria.
export const SHORT = {
  alimentacao: "Restaurantes", mercado: "Mercado", pet: "Pet shop", bebidas: "Bebidas", autopecas: "Autopeças", eletronicos: "Eletrônicos",
  lojas: "Variedades", conveniencia: "Conveniência", moda: "Moda", casa: "Casa", construcao: "Construção", beleza: "Beleza",
  papelaria: "Papelaria", flores: "Flores", brinquedos: "Brinquedos", agro: "Agro", servicos: "Serviços", farmacia: "Farmácia",
};
// Cor de cada categoria (fundo claro + ícone forte). Ajuda a reconhecer a categoria de longe.
export const CAT_COLOR = {
  alimentacao: ["#FFE8DF", "#D9431A"], mercado: ["#E3F6EA", "#077043"], pet: ["#FFF1D6", "#A15C00"], bebidas: ["#E5EEFF", "#2457C5"],
  autopecas: ["#ECEEF1", "#3B4552"], eletronicos: ["#EAE8FF", "#5038C8"], lojas: ["#FCE7F3", "#B0256E"], conveniencia: ["#FFF7CC", "#8A6A00"],
  moda: ["#FCE7F3", "#B0256E"], casa: ["#EFEADF", "#6B5530"], construcao: ["#FFEBD6", "#A34A00"], beleza: ["#FBE8F7", "#9C2C8A"],
  papelaria: ["#E3F2FD", "#1B5E9A"], flores: ["#FFE6EC", "#C0264E"], brinquedos: ["#E6F7F5", "#0F766E"], agro: ["#EEF6DD", "#4D6B12"],
  servicos: ["#E9EEF5", "#2F4A6B"], farmacia: ["#E3F6EA", "#077043"],
};

// Categorias como ícones redondos em linha (rolagem lateral). O mesmo componente no Início, na Vitrine e na Busca.
// available: categorias que têm loja (as outras não aparecem). sticky: fica preso abaixo do topo ao rolar.
export default function CategoryTabs({ value, onChange, available, sticky = true }) {
  const list = CATEGORIES.filter((c) => !available || available.has(c.id));
  const tile = (id, label, Icon, colors) => {
    const on = value === id;
    const [bg, fg] = colors;
    return (
      <button key={id ?? "tudo"} type="button" onClick={() => onChange(id)} aria-pressed={on}
        className="shrink-0 w-[76px] flex flex-col items-center gap-1.5 pt-2 pb-2 group">
        <span className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 ${on ? "ring-2 ring-offset-2 ring-marca" : ""}`} style={{ background: bg }}>
          <Icon className="w-7 h-7" style={{ color: fg }} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className={`text-[12.5px] leading-tight text-center ${on ? "font-bold text-foreground" : "font-medium text-[#3E4743]"}`}>{label}</span>
      </button>
    );
  };
  return (
    <div className={`${sticky ? "sticky top-16 z-30" : ""} bg-background border-b border-border mt-1`}>
      <nav aria-label="Categorias" className="flex gap-1 overflow-x-auto no-scrollbar px-2 sm:px-4">
        {tile(null, "Tudo", LayoutGrid, ["#F0F4F1", "#141E19"])}
        {list.map((c) => tile(c.id, SHORT[c.id] || c.label, c.icon, CAT_COLOR[c.id] || ["#F0F4F1", "#141E19"]))}
      </nav>
    </div>
  );
}
