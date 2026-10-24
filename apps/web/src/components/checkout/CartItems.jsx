import React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/lib/CartContext";
import { brl } from "@/lib/constants";

// Itens da sacola: nome e opções em cima; quantidade e valor embaixo (cabe em 360 px).
export default function CartItems() {
  const { cart, setQty } = useCart();
  return (
    <ul className="divide-y divide-[#EDE6D8]">
      {cart.items.map((i) => {
        const nome = `${i.name}${i.variant_name ? ` (${i.variant_name})` : ""}`;
        return (
          <li key={i.key} className="py-3.5 min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold break-words">{nome}</p>
                {i.addon_names?.length > 0 && <p className="text-[13px] text-muted-foreground break-words">+ {i.addon_names.join(", ")}</p>}
                <p className="text-[13px] text-muted-foreground">{brl(i.price)} cada</p>
              </div>
              <button type="button" onClick={() => setQty(i.key, 0)} aria-label={`Remover ${i.name}`} className="-mr-2 -mt-1 w-10 h-10 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0">
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                <button type="button" onClick={() => setQty(i.key, i.quantity - 1)} aria-label={`Diminuir ${i.name}`} className="w-9 h-9 rounded-md hover:bg-secondary text-marca flex items-center justify-center"><Minus className="w-4 h-4" aria-hidden="true" /></button>
                <span className="w-7 text-center text-[15px] font-semibold" aria-live="polite"><span className="sr-only">Quantidade </span>{i.quantity}</span>
                <button type="button" onClick={() => setQty(i.key, i.quantity + 1)} aria-label={`Aumentar ${i.name}`} className="w-9 h-9 rounded-md hover:bg-secondary text-marca flex items-center justify-center"><Plus className="w-4 h-4" aria-hidden="true" /></button>
              </div>
              <p className="text-[15px] font-bold">{brl(i.price * i.quantity)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
