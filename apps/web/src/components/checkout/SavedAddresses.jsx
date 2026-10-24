import React from "react";
import { Star, MapPin } from "lucide-react";

// Endereços salvos na conta (tabela addresses). Toque para usar no pedido.
export default function SavedAddresses({ list = [], value, onPick }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Endereços salvos">
      {list.map((a) => (
        <button type="button" key={a.id} onClick={() => onPick(a.line)} aria-pressed={value === a.line} title={a.line}
          className={`min-h-[40px] max-w-full px-3 rounded-lg border text-[13px] flex items-center gap-1.5 transition-colors ${value === a.line ? "border-marca bg-card text-marca font-semibold ring-1 ring-marca" : "border-border bg-card hover:border-marca/40"}`}>
          {a.is_default && <Star className="w-3.5 h-3.5 fill-current shrink-0" aria-label="Padrão" />}
          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{a.line}</span>
        </button>
      ))}
    </div>
  );
}
