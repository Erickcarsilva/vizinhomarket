import React from "react";
import { Link } from "react-router-dom";
import { CATEGORIES } from "@/lib/constants";
import { ALL_STYLE, CATEGORY_STYLE, categoryStyle } from "@/lib/categoryStyle";

// Nomes curtos e cores vêm do sistema de categorias (lib/categoryStyle.js).
export const SHORT = Object.fromEntries(Object.entries(CATEGORY_STYLE).map(([k, v]) => [k, v.short]));

// Bloco de categoria: placa colorida com o símbolo e o nome. Todas do mesmo tamanho e peso — nenhuma domina.
function Tile({ style, label, on, onClick, to, compact }) {
  const Icon = style.icon;
  const inner = (
    <>
      <span className={`${compact ? "w-12 h-12" : "w-full aspect-[5/4]"} rounded-[10px] flex items-center justify-center transition-transform group-active:scale-95 ${on ? "outline outline-2 outline-offset-2 outline-foreground" : ""}`}
        style={{ background: style.bg }}>
        <Icon className={compact ? "w-6 h-6" : "w-8 h-8"} style={{ color: style.fg }} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className={`text-[12.5px] leading-tight text-center ${on ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}>{label}</span>
    </>
  );
  const cls = `group flex flex-col items-center gap-1.5 ${compact ? "w-16 shrink-0" : "min-w-0"}`;
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} aria-pressed={on} className={cls}>{inner}</button>;
}

// Atalhos de categoria.
//  - variant "grid" (Início): grade de 4 colunas no celular, 9 no computador, com "Todas" levando à página de categorias.
//  - variant "row" (Vitrine e Busca): linha com rolagem lateral, presa ao topo ao rolar.
// available: categorias que têm loja (as outras não aparecem).
export default function CategoryTabs({ value, onChange, available, sticky = true, variant = "row", max = 7 }) {
  const list = CATEGORIES.filter((c) => !available || available.has(c.id));
  if (variant === "grid") {
    const shown = list.slice(0, max);
    return (
      <nav aria-label="Categorias" className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-x-3 gap-y-4">
        {shown.map((c) => <Tile key={c.id} style={categoryStyle(c.id)} label={categoryStyle(c.id).short} on={value === c.id} onClick={() => onChange(value === c.id ? null : c.id)} />)}
        <Tile style={ALL_STYLE} label={list.length > shown.length ? "Todas" : "Ver todas"} to="/categorias" />
      </nav>
    );
  }
  return (
    <div className={`${sticky ? "sticky top-16 z-30" : ""} bg-background border-b border-border`}>
      <nav aria-label="Categorias" className="flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6 py-2">
        <Tile compact style={ALL_STYLE} label="Tudo" on={!value} onClick={() => onChange(null)} />
        {list.map((c) => <Tile compact key={c.id} style={categoryStyle(c.id)} label={categoryStyle(c.id).short} on={value === c.id} onClick={() => onChange(c.id)} />)}
      </nav>
    </div>
  );
}
