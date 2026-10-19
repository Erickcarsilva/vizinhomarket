import React from "react";
import { Link } from "react-router-dom";
import { Star, Clock } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl, categoryLabel } from "@/lib/constants";

export default function StoreCard({ store }) {
  return (
    <Link to={`/loja/${store.id}`} className="group block">
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
        <Image src={store.cover_url} alt={store.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        {!store.is_open && (
          <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
            <span className="text-background text-sm font-semibold tracking-wide uppercase">Fechado agora</span>
          </div>
        )}
        <span className="absolute top-3 left-3 bg-background/90 backdrop-blur text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full">
          {categoryLabel(store.category)}
        </span>
      </div>
      <div className="pt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl leading-tight">{store.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{store.delivery_time_min || 40} min</span>
            <span>{store.delivery_fee ? `Entrega ${brl(store.delivery_fee)}` : "Entrega grátis"}</span>
          </p>
        </div>
        {store.rating && (
          <span className="flex items-center gap-1 text-sm font-semibold"><Star className="w-4 h-4 fill-accent text-accent" />{store.rating.toFixed(1)}</span>
        )}
      </div>
    </Link>
  );
}