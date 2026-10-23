import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Image } from "@/components/ui/image";
import { categoryLabel, deliveryFeeLabel } from "@/lib/constants";

// Loja em linha, como nas listas dos apps de delivery: logo, nome, nota, categoria, tempo e taxa.
export default function StoreCard({ store }) {
  const fee = deliveryFeeLabel(store);
  const free = /grátis/i.test(fee);
  return (
    <Link to={`/loja/${store.id}`} data-loja={store.name} className={`flex items-center gap-3 py-3 border-b border-border hover:bg-secondary/60 transition-colors ${store.is_open ? "" : "opacity-60"}`}>
      <span className="w-14 h-14 rounded-full overflow-hidden border border-border bg-secondary shrink-0 flex items-center justify-center">
        {store.logo_url ? (
          <Image src={store.logo_url} alt="" className="w-full h-full object-cover" fittingType="fit" />
        ) : store.cover_url ? (
          <Image src={store.cover_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-bold text-primary">{(store.name || "?")[0]}</span>
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{store.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          {store.rating ? (
            <><Star className="w-3 h-3 fill-amber-500 text-amber-500" /><span className="font-bold text-amber-800">{store.rating.toFixed(1).replace(".", ",")}</span><span aria-hidden="true">•</span></>
          ) : (
            <><span className="font-semibold text-primary">Novo</span><span aria-hidden="true">•</span></>
          )}
          <span className="truncate">{categoryLabel(store.category)}</span>
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          {store.is_open ? `${store.delivery_time_min || 40} min` : "Fechada agora"} <span aria-hidden="true">•</span>{" "}
          <span className={free ? "text-green-700 font-medium" : ""}>{fee}</span>
        </span>
      </span>
    </Link>
  );
}
