import React, { useState, useEffect } from "react";
import { Plus, Heart } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";
import { isFavorite, toggleFavorite } from "@/lib/favorites";
import { hasOptions, startingPrice } from "@/components/store/ProductOptions";

export default function ProductRow({ product, disabled, onAdd, inCart }) {
  const [fav, setFav] = useState(() => isFavorite(product.id));
  useEffect(() => setFav(isFavorite(product.id)), [product.id]);
  return (
    <div className="flex gap-5 py-5 border-b border-border/70 last:border-0">
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold">{product.name}</h4>
        {product.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>}
        <p className="mt-2 font-display text-lg">{hasOptions(product) && (product.variants || []).some((v) => v.available) ? <><span className="text-xs font-sans text-muted-foreground mr-1">a partir de</span>{brl(startingPrice(product))}</> : brl(product.price)}</p>
      </div>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setFav(toggleFavorite(product.id)); }}
          aria-label="Favoritar"
          className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shadow hover:scale-110 active:scale-95 transition-transform"
        >
          <Heart className={`w-4 h-4 ${fav ? "fill-accent text-accent" : "text-muted-foreground"}`} />
        </button>
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} className="w-24 h-24 rounded-xl object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-secondary flex items-center justify-center font-display text-3xl text-primary/40">
            {product.name[0]}
          </div>
        )}
        <button
          onClick={onAdd}
          disabled={disabled}
          aria-label="Adicionar"
          className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
        >
          {inCart ? <span className="text-sm font-bold">{inCart}</span> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}