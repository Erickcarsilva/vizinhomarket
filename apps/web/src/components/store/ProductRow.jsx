import React, { useState, useEffect } from "react";
import { Plus, Heart } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";
import { isFavorite, toggleFavorite } from "@/lib/favorites";
import { hasOptions, startingPrice } from "@/components/store/ProductOptions";

// Botão de adicionar: terracota; com a loja fechada fica cinza-areia (legível, mas claramente indisponível).
function AddButton({ onAdd, disabled, inCart, name }) {
  return (
    <button type="button" onClick={onAdd} disabled={disabled} aria-label="Adicionar" title={disabled ? "Loja fechada" : `Adicionar ${name}`}
      className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm active:scale-95 transition-transform disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none disabled:border disabled:border-border">
      {inCart ? <span className="text-sm font-bold">{inCart}<span className="sr-only"> na sacola</span></span> : <Plus className="w-[18px] h-[18px]" strokeWidth={2.4} aria-hidden="true" />}
    </button>
  );
}

export default function ProductRow({ product, disabled, onAdd, inCart }) {
  const [fav, setFav] = useState(() => isFavorite(product.id));
  useEffect(() => setFav(isFavorite(product.id)), [product.id]);
  const favBtn = (cls) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); setFav(toggleFavorite(product.id)); }} aria-label="Favoritar" aria-pressed={fav}
      className={`rounded-full bg-card border border-border flex items-center justify-center ${cls}`}>
      <Heart className={`w-4 h-4 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
    </button>
  );
  const from = hasOptions(product) && (product.variants || []).some((v) => v.available);
  return (
    <div data-produto={product.name} className="flex gap-4 py-4 border-b border-[#EDE6D8] last:border-0">
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold leading-snug break-words">{product.name}</h3>
        {product.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>}
        <p className="mt-2 text-[15px] font-bold">{from ? <><span className="text-[13px] font-normal text-muted-foreground mr-1">a partir de</span>{brl(startingPrice(product))}</> : brl(product.price)}</p>
      </div>
      {product.image_url ? (
        <div className="relative shrink-0 self-start">
          {favBtn("absolute -top-2 -left-2 z-10 w-8 h-8 shadow-sm")}
          <Image src={product.image_url} alt="" className="w-24 h-24 rounded-lg object-cover bg-[#E5DDCE]" />
          <div className="absolute -bottom-2 -right-2"><AddButton onAdd={onAdd} disabled={disabled} inCart={inCart} name={product.name} /></div>
        </div>
      ) : (
        <div className="shrink-0 self-center flex items-center gap-2">
          {favBtn("w-10 h-10")}
          <AddButton onAdd={onAdd} disabled={disabled} inCart={inCart} name={product.name} />
        </div>
      )}
    </div>
  );
}
