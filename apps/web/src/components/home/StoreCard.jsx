import React from "react";
import { Link } from "react-router-dom";
import { Star, Bike } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl } from "@/lib/constants";

// Taxa curta para a linha da loja: "R$ 5,00", "Grátis" ou "R$ 6,00 a R$ 8,50" (por bairro).
export const shortFee = (s) => {
  if (s?.delivery_zones) {
    const a = s.delivery_fee_min, b = s.delivery_fee_max;
    if (!b) return "Grátis";
    return a === b ? brl(a) : `${a ? brl(a) : "Grátis"} a ${brl(b)}`;
  }
  return s?.delivery_fee ? brl(s.delivery_fee) : "Grátis";
};

// Loja em linha: logo quadrado, nome e uma linha só com nota, taxa e tempo.
export default function StoreCard({ store }) {
  const fee = shortFee(store);
  return (
    <Link to={`/loja/${store.id}`} data-loja={store.name} className="flex items-center gap-4 py-3 rounded-lg hover:bg-secondary/60 transition-colors">
      <span className={`w-[72px] h-[72px] rounded-2xl overflow-hidden border border-border bg-secondary shrink-0 flex items-center justify-center ${store.is_open ? "" : "grayscale opacity-60"}`}>
        {store.logo_url ? (
          <Image src={store.logo_url} alt="" className="w-full h-full object-cover" fittingType="fit" />
        ) : store.cover_url ? (
          <Image src={store.cover_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-extrabold text-primary">{(store.name || "?")[0]}</span>
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-semibold leading-tight truncate">{store.name}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1 whitespace-nowrap overflow-hidden">
          {store.rating ? (
            <><Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" /><span className="font-semibold text-foreground">{store.rating.toFixed(1).replace(".", ",")}</span></>
          ) : (
            <span className="font-semibold text-primary">Nova</span>
          )}
          <span aria-hidden="true">•</span>
          <Bike className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className={`font-semibold ${fee === "Grátis" ? "text-green-700" : "text-foreground"}`} data-taxa>{fee}</span>
          <span aria-hidden="true">•</span>
          <span className="truncate">{store.is_open ? `${store.delivery_time_min || 40} min` : "fechada agora"}</span>
        </span>
      </span>
    </Link>
  );
}
