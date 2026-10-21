import React from "react";
import { Star, MapPin } from "lucide-react";

// Endereços salvos na conta (tabela addresses). Toque para usar no pedido.
export default function SavedAddresses({ list = [], value, onPick }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((a) => (
        <button type="button" key={a.id} onClick={() => onPick(a.line)} className={`h-9 px-3 rounded-full border text-xs flex items-center gap-1.5 transition ${value === a.line ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-secondary"}`}>
          {a.is_default && <Star className="w-3 h-3 fill-current" />}
          <MapPin className="w-3 h-3" />
          {a.line.length > 30 ? a.line.slice(0, 30) + "…" : a.line}
        </button>
      ))}
    </div>
  );
}
