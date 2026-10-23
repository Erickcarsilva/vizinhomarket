import React from "react";

export default function CityPills({ value, onChange, cities }) {
  const base = "h-10 px-4 rounded-full border text-sm font-medium whitespace-nowrap transition-all";
  const on = "bg-primary text-primary-foreground border-primary";
  const off = "bg-card border-border hover:border-primary/40";
  return (
    <div className="max-w-6xl mx-auto px-5 mt-6 flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium mr-1">Cidade</span>
      <button onClick={() => onChange(null)} className={`${base} ${!value ? on : off}`}>Todas</button>
      {cities.map((c) => (
        <button key={c} onClick={() => onChange(c)} className={`${base} ${value === c ? on : off}`}>{c}</button>
      ))}
    </div>
  );
}