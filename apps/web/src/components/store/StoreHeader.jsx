import React from "react";
import { Clock, MapPin, Star, Bike } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl, categoryLabel, FULFILLMENT, deliveryFeeLabel } from "@/lib/constants";

export default function StoreHeader({ store }) {
  return (
    <div>
      <div className={`relative overflow-hidden bg-secondary ${store.cover_url ? "h-36 md:h-56" : "h-16"}`}>
        {store.cover_url && <Image src={store.cover_url} alt={store.name} className="w-full h-full object-cover" />}
      </div>
      <div className={`max-w-4xl mx-auto px-3 sm:px-5 relative ${store.cover_url ? "-mt-10" : "-mt-8"}`}>
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-background bg-card shadow-sm flex items-center justify-center">
          {store.logo_url ? (
            <Image src={store.logo_url} alt={`Logo ${store.name}`} className="w-full h-full object-cover" fittingType="fit" />
          ) : (
            <span className="text-3xl font-bold text-primary">{(store.name || "?")[0]}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <h1 className="text-2xl font-bold leading-tight">{store.name}</h1>
          {!store.is_open && <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">Fechada agora</span>}
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground mt-1">
          {store.rating ? <><Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /><span className="font-bold text-amber-800">{store.rating.toFixed(1).replace(".", ",")}</span><span aria-hidden="true">•</span></> : null}
          <span>{categoryLabel(store.category)}</span>
          {store.min_order ? <><span aria-hidden="true">•</span><span>Pedido mínimo {brl(store.min_order)}</span></> : null}
        </p>
        {store.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{store.description}</p>}
        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
          <span className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><Clock className="w-4 h-4 text-primary shrink-0" />{store.delivery_time_min || 40} min · {store.opening_hours || "Horário não informado"}</span>
          <span className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><Bike className="w-4 h-4 text-primary shrink-0" />{deliveryFeeLabel(store)}</span>
          {store.address && <span className="flex items-center gap-2 rounded-md border border-border px-3 py-2 sm:col-span-2"><MapPin className="w-4 h-4 text-primary shrink-0" />{store.address}</span>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(store.delivery_modes || []).map((m) => (
            <span key={m} className="text-xs px-2.5 py-1 rounded-full bg-secondary">{FULFILLMENT[m]}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
