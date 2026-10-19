import React from "react";
import { Clock, MapPin, Star, Bike } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl, categoryLabel, FULFILLMENT } from "@/lib/constants";

export default function StoreHeader({ store }) {
  return (
    <div>
      <div className="relative h-56 md:h-80 overflow-hidden">
        <Image src={store.cover_url} alt={store.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
      </div>
      <div className="max-w-4xl mx-auto px-5 -mt-16 relative">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border-4 border-background bg-card shadow-sm flex items-center justify-center mb-5">
          {store.logo_url ? (
            <Image src={store.logo_url} alt={`Logo ${store.name}`} className="w-full h-full object-cover" fittingType="fit" />
          ) : (
            <span className="font-display text-4xl text-primary/70">{(store.name || "?")[0]}</span>
          )}
        </div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">{categoryLabel(store.category)}</p>
        <h1 className="font-display text-4xl md:text-5xl mt-2 tracking-tight">{store.name}</h1>
        {store.description && <p className="text-muted-foreground mt-3 max-w-2xl">{store.description}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm">
          {store.rating && <span className="flex items-center gap-1.5"><Star className="w-4 h-4 fill-accent text-accent" />{store.rating.toFixed(1)}</span>}
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{store.delivery_time_min || 40} min · {store.opening_hours || "Horário não informado"}</span>
          <span className="flex items-center gap-1.5"><Bike className="w-4 h-4" />{store.delivery_fee ? brl(store.delivery_fee) : "Grátis"}{store.min_order ? ` · mínimo ${brl(store.min_order)}` : ""}</span>
          {store.address && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{store.address}</span>}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {(store.delivery_modes || []).map((m) => (
            <span key={m} className="text-xs px-3 py-1 rounded-full bg-secondary">{FULFILLMENT[m]}</span>
          ))}
          {!store.is_open && <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Fechado agora</span>}
        </div>
      </div>
    </div>
  );
}