import React from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";
import { categoryStyle } from "@/lib/categoryStyle";

// Arte provisória para item sem foto: o símbolo da categoria da loja sobre a cor dela.
// Fica claro que é provisório (não finge ser foto) e some sozinho quando a loja cadastra a foto.
export function CategoryArt({ category, className = "", iconClass = "w-9 h-9" }) {
  const st = categoryStyle(category);
  const Icon = st.icon;
  return (
    <div className={`w-full h-full flex items-center justify-center ${className}`} style={{ background: st.bg }} aria-hidden="true">
      <Icon className={iconClass} style={{ color: st.fg, opacity: 0.75 }} strokeWidth={1.6} />
    </div>
  );
}

// Produto em vitrine: foto quadrada (ou arte da categoria), preço em destaque, nome e loja.
export default function ProductCard({ product, store }) {
  return (
    <Link to={`/loja/${product.store_id}`} className="block w-[140px] shrink-0 group">
      <div className="aspect-square rounded-[10px] overflow-hidden border border-border">
        {product.image_url ? (
          <Image src={product.image_url} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" fittingType="fill" />
        ) : (
          <CategoryArt category={store?.category} />
        )}
      </div>
      <p className="text-[16px] font-bold mt-2">{brl(product.price)}</p>
      <p className="text-[13.5px] leading-tight line-clamp-2 min-h-[2.4em]">{product.name}</p>
      <p className="text-[12px] text-muted-foreground truncate mt-0.5">{store?.name}</p>
    </Link>
  );
}
