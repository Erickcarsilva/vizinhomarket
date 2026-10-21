import React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/lib/CartContext";
import { brl } from "@/lib/constants";

export default function CartItems() {
  const { cart, setQty } = useCart();
  return (
    <div className="divide-y divide-border/70">
      {cart.items.map((i) => (
        <div key={i.key} className="py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{i.name}{i.variant_name ? ` (${i.variant_name})` : ""}</p>
            {i.addon_names?.length > 0 && <p className="text-xs text-muted-foreground truncate">+ {i.addon_names.join(", ")}</p>}
            <p className="text-sm text-muted-foreground">{brl(i.price)}</p>
          </div>
          <div className="flex items-center gap-3 bg-secondary rounded-full p-1">
            <button type="button" onClick={() => setQty(i.key, i.quantity - 1)} className="w-8 h-8 rounded-full hover:bg-background flex items-center justify-center transition"><Minus className="w-3.5 h-3.5" /></button>
            <span className="w-4 text-center text-sm font-semibold">{i.quantity}</span>
            <button type="button" onClick={() => setQty(i.key, i.quantity + 1)} className="w-8 h-8 rounded-full hover:bg-background flex items-center justify-center transition"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <p className="w-16 sm:w-24 text-right font-semibold">{brl(i.price * i.quantity)}</p>
          <button type="button" onClick={() => setQty(i.key, 0)} aria-label={`Remover ${i.name}`} className="w-8 h-8 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground hover:text-destructive transition shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}