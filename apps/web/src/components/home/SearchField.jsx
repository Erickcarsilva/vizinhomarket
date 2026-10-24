import React from "react";
import { Search, X } from "lucide-react";

// Campo de busca do app do cliente (Início e Busca usam o mesmo).
export default function SearchField({ value, onChange, autoFocus = false, label = "Buscar loja, prato ou produto" }) {
  return (
    <label className="flex items-center gap-2.5 h-12 px-3.5 rounded-lg bg-card border border-input focus-within:ring-2 focus-within:ring-ring">
      <Search className="w-[18px] h-[18px] text-marca shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <input type="search" autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label}
        className="flex-1 min-w-0 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar busca" className="shrink-0 -mr-1.5 w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </label>
  );
}
