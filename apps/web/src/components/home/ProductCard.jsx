import React from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";

// Produto em destaque: foto quadrada, nome em 2 linhas, preço e loja.
export default function ProductCard({ product, store }) {
  return (
    <Link to={`/loja/${product.store_id}`} className="block w-[132px] shrink-0">
      <div className="aspect-square rounded-md overflow-hidden bg-secondary">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} className="w-full h-full object-cover" fittingType="fill" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary/30">{(product.name || "?")[0]}</div>
        )}
      </div>
      <p className="text-[13px] leading-tight mt-1.5 line-clamp-2 min-h-[2.1em]">{product.name}</p>
      <p className="text-sm font-bold mt-0.5">{brl(product.price)}</p>
      <p className="text-[11px] text-muted-foreground truncate">{store?.name}</p>
    </Link>
  );
}
