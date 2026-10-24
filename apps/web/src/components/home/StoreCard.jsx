import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl, categoryLabel } from "@/lib/constants";
import { nextOpening } from "@/lib/hours";

// Taxa curta para a linha da loja: "R$ 5,00", "Entrega grátis" ou "a partir de R$ 5,00" (taxa por bairro).
export const shortFee = (s) => {
  if (s?.delivery_zones) {
    const a = s.delivery_fee_min, b = s.delivery_fee_max;
    if (!b) return "Entrega grátis";
    return a === b ? brl(a) : `a partir de ${a ? brl(a) : "R$ 0,00"}`;
  }
  return s?.delivery_fee ? brl(s.delivery_fee) : "Entrega grátis";
};

// Iniciais para a loja sem logo: "Marmitaria da Praça" → "MP".
export const monogram = (name = "") => {
  const words = name.split(/\s+/).filter((w) => w && !/^(d[aeo]s?|e|&)$/i.test(w));
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
};

export function StoreLogo({ store, size = 60, className = "", muted = false }) {
  const style = { width: size, height: size };
  return (
    <span style={style} className={`shrink-0 overflow-hidden rounded-[14px] bg-[#E5DDCE] flex items-center justify-center ${className}`}>
      {store.logo_url ? (
        <Image src={store.logo_url} alt="" className={`w-full h-full object-cover ${muted ? "grayscale" : ""}`} fittingType="fit" />
      ) : (
        <span aria-hidden="true" className={`font-display font-semibold ${muted ? "text-[#57534A]" : "text-marca"}`} style={{ fontSize: Math.round(size * 0.38) }}>{monogram(store.name)}</span>
      )}
    </span>
  );
}

// Loja em linha: logo (ou monograma), nome, categoria e nota · tempo · taxa. Loja fechada mostra quando abre.
export default function StoreCard({ store }) {
  const fee = shortFee(store);
  const open = store.is_open;
  const opens = !open && !store.is_paused ? nextOpening(store.hours, store.city_timezone) : null;
  return (
    <Link to={`/loja/${store.id}`} data-loja={store.name}
      className="flex items-center gap-3.5 py-3 min-w-0 border-b border-[#EDE6D8] last:border-0 hover:bg-secondary/50 transition-colors">
      <StoreLogo store={store} muted={!open} />
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className={`text-base font-semibold leading-tight truncate ${open ? "" : "text-muted-foreground"}`}>{store.name}</span>
        <span className="text-[13px] text-muted-foreground truncate">
          {open ? categoryLabel(store.category) : `${store.is_paused ? "Pausada no momento" : opens ? `Abre ${opens}` : "Fechada agora"} · ${categoryLabel(store.category)}`}
        </span>
        {open && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden">
            {store.rating ? (
              <><Star className="w-3.5 h-3.5 fill-[#B7791F] text-[#B7791F] shrink-0" aria-hidden="true" /><span className="font-semibold text-foreground">{store.rating.toFixed(1).replace(".", ",")}</span></>
            ) : (
              <span className="font-semibold text-marca">Nova</span>
            )}
            <span aria-hidden="true">·</span>
            <span>{store.delivery_time_min || 40} min</span>
            <span aria-hidden="true">·</span>
            <span data-taxa className={`font-semibold truncate ${/grátis/.test(fee) ? "text-marca" : "text-foreground"}`}>{fee}</span>
          </span>
        )}
      </span>
    </Link>
  );
}
