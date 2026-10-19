import React from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";

export default function ProductCard({ product, store }) {
  return (
    <Link to={`/loja/${product.store_id}`} className="group block w-[220px] sm:w-[240px] shrink-0">
      <div className="aspect-square rounded-2xl overflow-hidden bg-secondary">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            fittingType="fill"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-display text-4xl text-primary/30">
            {(product.name || "?")[0]}
          </div>
        )}
      </div>
      <p className="font-medium mt-3 truncate">{product.name}</p>
      <p className="text-xs text-muted-foreground truncate">{store?.name}</p>
      <p className="font-display text-lg mt-0.5">{brl(product.price)}</p>
    </Link>
  );
}