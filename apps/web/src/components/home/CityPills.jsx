import React from "react";

// Escolha de cidade (só aparece quando há lojas em mais de uma cidade).
export default function CityPills({ value, onChange, cities }) {
  const base = "h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors";
  const on = "bg-marca text-white border-marca";
  const off = "bg-card border-border hover:border-marca/40";
  return (
    <div className="px-4 sm:px-6 flex items-center gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Cidade">
      <span className="text-[13px] text-muted-foreground font-medium mr-1 shrink-0">Cidade</span>
      <button type="button" aria-pressed={!value} onClick={() => onChange(null)} className={`${base} ${!value ? on : off}`}>Todas</button>
      {cities.map((c) => (
        <button type="button" key={c} aria-pressed={value === c} onClick={() => onChange(c)} className={`${base} ${value === c ? on : off}`}>{c}</button>
      ))}
    </div>
  );
}
