import React from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";

// Produto em destaque: foto quadrada, nome em 2 linhas, preço e loja.
export default function ProductCard({ product, store }) {
  return (
    <Link to={`/loja/${product.store_id}`} className="block w-[136px] shrink-0 group">
      <div className="aspect-square rounded-lg overflow-hidden bg-[#E5DDCE] border border-border">
        {product.image_url ? (
          <Image src={product.image_url} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" fittingType="fill" />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-display text-3xl text-marca" aria-hidden="true">{(product.name || "?")[0]}</div>
        )}
      </div>
      <p className="text-[14px] font-medium leading-tight mt-2 line-clamp-2 min-h-[2.4em]">{product.name}</p>
      <p className="text-[15px] font-bold text-primary mt-1">{brl(product.price)}</p>
      <p className="text-[12px] text-muted-foreground truncate">{store?.name}</p>
    </Link>
  );
}
