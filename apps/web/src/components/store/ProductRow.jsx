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
    <div data-produto={product.name} className="flex gap-4 py-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium">{product.name}</h4>
        {product.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>}
        <p className="mt-2 font-bold">{hasOptions(product) && (product.variants || []).some((v) => v.available) ? <><span className="text-xs font-normal text-muted-foreground mr-1">a partir de</span>{brl(startingPrice(product))}</> : brl(product.price)}</p>
      </div>
      {product.image_url ? (
        <div className="relative shrink-0 self-start">
          <button type="button" onClick={(e) => { e.stopPropagation(); setFav(toggleFavorite(product.id)); }} aria-label="Favoritar"
            className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shadow-sm">
            <Heart className={`w-4 h-4 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
          <Image src={product.image_url} alt={product.name} className="w-24 h-24 rounded-md object-cover" />
          <button onClick={onAdd} disabled={disabled} aria-label="Adicionar"
            className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md active:scale-95 transition-transform disabled:opacity-40">
            {inCart ? <span className="text-sm font-bold">{inCart}</span> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <div className="shrink-0 self-center flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); setFav(toggleFavorite(product.id)); }} aria-label="Favoritar"
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center">
            <Heart className={`w-4 h-4 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
          <button onClick={onAdd} disabled={disabled} aria-label="Adicionar"
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40">
            {inCart ? <span className="text-sm font-bold">{inCart}</span> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}