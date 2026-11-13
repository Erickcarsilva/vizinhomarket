import React from "react";
import { Link } from "react-router-dom";
import { Star, Clock } from "lucide-react";
import { Image } from "@/components/ui/image";
import { brl, categoryLabel } from "@/lib/constants";
import { categoryStyle } from "@/lib/categoryStyle";
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

// Logo da loja; sem logo, as iniciais na cor da categoria (a loja continua reconhecível na lista).
export function StoreLogo({ store, size = 56, className = "", muted = false }) {
  const st = categoryStyle(store.category);
  const [bg, fg] = muted ? ["#EEF1EF", "#55615B"] : [st.bg, st.fg];
  return (
    <span style={{ width: size, height: size, background: store.logo_url ? "#F0F3F1" : bg }}
      className={`shrink-0 overflow-hidden rounded-[10px] flex items-center justify-center ${className}`}>
      {store.logo_url ? (
        <Image src={store.logo_url} alt="" className={`w-full h-full object-cover ${muted ? "grayscale" : ""}`} fittingType="fit" />
      ) : (
        <span aria-hidden="true" className="font-display" style={{ fontSize: Math.round(size * 0.36), color: fg }}>{monogram(store.name)}</span>
      )}
    </span>
  );
}

// Nota real (com quantidade) ou "Nova" quando a loja ainda não tem avaliações. Nada inventado.
function Rating({ store }) {
  if (!store.rating) return <span className="font-semibold text-marca">Nova</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-[#E8A400] text-[#E8A400] shrink-0" aria-hidden="true" />
      <span className="font-semibold text-foreground">{store.rating.toFixed(1).replace(".", ",")}</span>
    </span>
  );
}

const sep = <span aria-hidden="true" className="text-border">|</span>;

// Loja em linha (listas): logo, nome, categoria e as informações de decisão (nota · tempo · taxa).
// Loja fechada fica em cinza e diz quando abre.
export default function StoreCard({ store }) {
  const fee = shortFee(store);
  const open = store.is_open;
  const opens = !open && !store.is_paused ? nextOpening(store.hours, store.city_timezone) : null;
  return (
    <Link to={`/loja/${store.id}`} data-loja={store.name}
      className="flex items-center gap-3.5 py-3 min-w-0 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
      <StoreLogo store={store} muted={!open} />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-[16px] font-semibold leading-tight truncate ${open ? "" : "text-muted-foreground"}`}>{store.name}</span>
        <span className="text-[13px] text-muted-foreground truncate">
          {open ? (store.category_name || categoryLabel(store.category)) : `${store.is_paused ? "Pausada no momento" : opens ? `Abre ${opens}` : "Fechada agora"} · ${(store.category_name || categoryLabel(store.category))}`}
        </span>
        {open && (
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden mt-0.5">
            <Rating store={store} />
            {store.delivery_time_min ? <>{sep}<span>{store.delivery_time_min} min</span></> : null}
            {sep}
            {store.is_service
              ? <span className="font-semibold text-foreground truncate">Orçamento sem compromisso</span>
              : <span data-taxa className={`font-semibold truncate ${/grátis/.test(fee) ? "text-marca" : "text-foreground"}`}>{fee}</span>}
          </span>
        )}
      </span>
    </Link>
  );
}

// Loja em cartão (vitrines horizontais): fachada na cor da categoria com toldo, logo, nome e informações reais.
export function StoreTile({ store }) {
  const st = categoryStyle(store.category);
  const fee = shortFee(store);
  return (
    <Link to={`/loja/${store.id}`} data-loja={store.name} className="block w-[200px] shrink-0 group">
      <div className="relative rounded-[10px] overflow-hidden border border-border bg-card">
        <div className="relative h-[64px] overflow-hidden" style={{ background: st.bg }}>
          {store.cover_url ? <Image src={store.cover_url} alt="" className="w-full h-full object-cover" fittingType="fill" />
            : React.createElement(st.icon, { "aria-hidden": true, className: "absolute -right-2 -top-3 w-20 h-20", style: { color: st.fg, opacity: 0.14 }, strokeWidth: 1.4 })}
        </div>
        <div className="relative px-3 pb-3 -mt-6">
          <StoreLogo store={store} size={48} className="border-2 border-card" />
          <p className="text-[15px] font-semibold leading-tight mt-2 truncate group-hover:underline underline-offset-2">{store.name}</p>
          <p className="text-[12.5px] text-muted-foreground truncate">{(store.category_name || categoryLabel(store.category))}</p>
          <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground mt-1.5 whitespace-nowrap overflow-hidden">
            <Rating store={store} />
            {store.delivery_time_min ? <>{sep}<span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{store.delivery_time_min} min</span></> : null}
          </p>
          {store.is_service
            ? <p className="text-[12.5px] font-semibold mt-0.5 truncate">Pede orçamento pelo app</p>
            : <p data-taxa className={`text-[12.5px] font-semibold mt-0.5 truncate ${/grátis/.test(fee) ? "text-marca" : "text-foreground"}`}>{fee === "Entrega grátis" ? fee : `Entrega ${fee}`}</p>}
        </div>
      </div>
    </Link>
  );
}
