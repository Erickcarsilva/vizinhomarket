import React from "react";
import { Clock, MapPin, Star, Bike, ShoppingBasket } from "lucide-react";
import { Image } from "@/components/ui/image";
import { StoreLogo } from "@/components/home/StoreCard";
import { brl, categoryLabel, FULFILLMENT, deliveryFeeLabel } from "@/lib/constants";
import { nextOpening } from "@/lib/hours";

function Info({ icon: Icon, children }) {
  return (
    <span className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 text-marca shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

// Topo da loja: capa (se houver), logo, nome, situação (aberta/fechada) e informações de entrega.
export default function StoreHeader({ store }) {
  const opens = !store.is_open && !store.is_paused ? nextOpening(store.hours, store.city_timezone) : null;
  return (
    <div>
      {store.cover_url && (
        <div className="relative overflow-hidden bg-secondary h-36 md:h-56">
          <Image src={store.cover_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className={`max-w-4xl mx-auto px-4 sm:px-6 relative ${store.cover_url ? "-mt-9" : "pt-5"}`}>
        <StoreLogo store={store} size={76} className="border-4 border-background rounded-[18px]" />
        <h1 className="font-display text-[26px] leading-tight text-marca mt-3 break-words">{store.name}</h1>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground mt-1">
          {store.rating ? (
            <><Star className="w-3.5 h-3.5 fill-[#B7791F] text-[#B7791F]" aria-hidden="true" /><span className="font-semibold text-foreground"><span className="sr-only">Nota </span>{store.rating.toFixed(1).replace(".", ",")}</span><span aria-hidden="true">·</span></>
          ) : <><span className="font-semibold text-marca">Nova</span><span aria-hidden="true">·</span></>}
          <span>{categoryLabel(store.category)}</span>
        </p>

        {store.is_open ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-marca">
            <span className="w-2 h-2 rounded-full bg-marca" aria-hidden="true" /> Aberta agora
          </p>
        ) : (
          <div role="status" className="mt-3 rounded-lg border border-[#E2C9B8] bg-[#F6E9E0] px-3.5 py-2.5 text-sm">
            <p className="font-semibold text-[#7A3A1F]">{store.is_paused ? "Loja pausada no momento" : "Fechada agora"}{opens ? ` · abre ${opens}` : ""}</p>
            <p className="text-[#5C4A3F] mt-0.5">Você pode ver o cardápio, mas só dá para pedir quando ela abrir.</p>
          </div>
        )}

        {store.description && <p className="text-[15px] text-muted-foreground mt-3 max-w-2xl">{store.description}</p>}

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 py-3 border-y border-border text-sm">
          <Info icon={Clock}>{store.delivery_time_min || 40} min · {store.opening_hours || "Horário não informado"}</Info>
          <Info icon={Bike}>{deliveryFeeLabel(store)}</Info>
          {store.min_order ? <Info icon={ShoppingBasket}>Pedido mínimo {brl(store.min_order)}</Info> : null}
          {store.address && <Info icon={MapPin}>{store.address}</Info>}
        </div>
        {(store.delivery_modes || []).length > 0 && (
          <p className="text-[13px] text-muted-foreground mt-2">{(store.delivery_modes || []).map((m) => FULFILLMENT[m]).filter(Boolean).join(" · ")}</p>
        )}
      </div>
    </div>
  );
}
