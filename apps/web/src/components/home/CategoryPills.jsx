import React from "react";
import { CATEGORIES } from "@/lib/constants";

export default function CategoryPills({ value, onChange }) {
  const base = "flex items-center gap-2 h-11 px-5 rounded-full border text-sm font-medium whitespace-nowrap transition-all";
  const on = "bg-primary text-primary-foreground border-primary";
  const off = "bg-card border-border hover:border-primary/40";
  return (
    <div className="max-w-6xl mx-auto px-5 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      <button onClick={() => onChange(null)} className={`${base} ${!value ? on : off}`}>Todas</button>
      {CATEGORIES.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => onChange(id)} className={`${base} ${value === id ? on : off}`}>
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );
}