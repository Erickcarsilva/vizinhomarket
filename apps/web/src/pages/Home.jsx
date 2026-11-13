import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, RefreshCw, MapPin, KeyRound, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import CityPills from "@/components/home/CityPills";
import StoreCard, { StoreTile } from "@/components/home/StoreCard";
import ProductCard from "@/components/home/ProductCard";
import CategoryTabs from "@/components/home/CategoryTabs";
import SearchField from "@/components/home/SearchField";
import { categoryLabel, isStoreListable } from "@/lib/constants";
import { HOME_GROUPS } from "@/lib/categoryStyle";
import Toldo from "@/components/brand/Toldo";
import RuaComercial from "@/components/brand/RuaComercial";

// Lista de lojas que nunca fica mais larga que a tela (nome longo é cortado com reticências).
export const listaLojas = "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[repeat(2,minmax(0,1fr))] gap-x-10";

function SectionTitle({ children, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-1">
      <div className="min-w-0">
        <h2 className="font-display text-[21px] leading-tight">{children}</h2>
        {sub && <p className="text-[13px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// Último pedido entregue: atalho para voltar à loja.
function OrderAgain() {
  const { user } = useAuth();
  const { data: last } = useQuery({
    queryKey: ["orders", "last-delivered", user?.id],
    queryFn: async () => (await base44.entities.Order.filter({ customer_id: user.id, status: "DELIVERED" }, "-created_date", 1))[0] || null,
    enabled: !!user?.id,
  });
  if (!last) return null;
  const resumo = last.items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
  return (
    <section className="px-4 sm:px-6 pt-5" aria-label="Peça de novo">
      <Link to={`/loja/${last.store_id}`} className="flex items-center gap-3 rounded-[10px] bg-secondary px-3.5 py-3 hover:bg-secondary/70 transition-colors">
        <RotateCcw className="w-5 h-5 text-marca shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-muted-foreground">Peça de novo</span>
          <span className="block text-[15px] font-semibold truncate">{last.store_name}</span>
          <span className="block text-[13px] text-muted-foreground truncate">{resumo}</span>
        </span>
        <span className="text-sm font-semibold text-marca shrink-0">Pedir de novo</span>
      </Link>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3.5 py-3">
          <div className="w-14 h-14 rounded-[10px] bg-secondary animate-pulse" />
          <div className="flex-1 space-y-2"><div className="h-4 w-2/3 rounded bg-secondary animate-pulse" /><div className="h-3 w-1/2 rounded bg-secondary animate-pulse" /></div>
        </div>
      ))}
    </div>
  );
}

// Filtros rápidos: só com dados reais da loja.
const FILTERS = [
  ["gratis", "Entrega grátis", (s) => !s.delivery_zones && !s.delivery_fee],
  ["retirada", "Retirar na loja", (s) => (s.delivery_modes || []).includes("retirada")],
  ["app", "Paga pelo app", (s) => s.accepts_online_payment],
];

function Rail({ children, label }) {
  return <div role="group" aria-label={label} className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-1 snap-x">{children}</div>;
}

// Uma "rua" do marketplace (Comida, Mercado, Saúde, Lojas, Serviços): até 4 lojas e o atalho para ver todas.
function Street({ group, stores }) {
  const [all, setAll] = useState(false);
  const shown = all ? stores : stores.slice(0, 4);
  return (
    <section className="pt-8 px-4 sm:px-6" aria-label={group.title}>
      <SectionTitle right={stores.length > 4 && !all ? <button type="button" onClick={() => setAll(true)} className="text-sm font-semibold text-marca">Ver as {stores.length}</button> : null}>{group.title}</SectionTitle>
      <div className={listaLojas}>{shown.map((st) => <StoreCard key={st.id} store={st} />)}</div>
    </section>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [city, setCity] = useState(null);
  const [filters, setFilters] = useState([]);

  const { data: stores = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => base44.entities.Product.filter({ available: true }, "-created_date", 1000),
  });
  const { data: config } = useQuery({ queryKey: ["public-config"], queryFn: () => base44.support.config(), staleTime: 300000 });

  const listable = stores.filter(isStoreListable);
  const cities = [...new Set(listable.map((s) => s.city).filter(Boolean))];
  const q = query.trim().toLowerCase();
  const matchStoreIds = new Set(products.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.store_id));
  const activeFilters = FILTERS.filter(([k]) => filters.includes(k));
  const visible = listable
    .filter((s) => !city || s.city === city)
    .filter((s) => !category || s.category === category)
    .filter((s) => activeFilters.every(([, , fn]) => fn(s)))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || matchStoreIds.has(s.id));
  const open = visible.filter((s) => s.is_open);
  const closed = visible.filter((s) => !s.is_open);
  const browsing = !q && !category && !filters.length;

  const storeById = new Map(listable.map((s) => [s.id, s]));
  const featured = products
    // Só produtos com foto: vitrine sem foto não convence.
    .filter((p) => p.image_url && storeById.get(p.store_id)?.is_open)
    .slice(0, 12);
  const present = new Set(listable.map((s) => s.category));
  const catName = category ? categoryLabel(category) : "";
  const availableFilters = FILTERS.filter(([k]) => k !== "app" || config?.online_payments_enabled);
  const toggleFilter = (k) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const streets = HOME_GROUPS.map((g) => ({ group: g, stores: open.filter((s) => g.slugs.includes(s.category)) })).filter((x) => x.stores.length);

  return (
    <div>
      {/* Fachada: o que é o VizinhoMarket + busca. Termina na borda de toldo (assinatura da marca). */}
      <section className="bg-marca text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-5 md:pt-10 md:pb-8 md:grid md:grid-cols-[minmax(0,1fr)_400px] md:gap-10 md:items-end">
          <div>
            <h1 className="font-display text-[26px] md:text-[40px] leading-[1.08] max-w-[22ch]">O comércio de Sidrolândia, entregue na sua porta</h1>
            <p className="text-[14px] md:text-[16px] text-white/85 mt-1.5">Comida, mercado, farmácia, lojas e serviços da cidade.</p>
            <div className="mt-4 max-w-2xl"><SearchField value={query} onChange={setQuery} onDark /></div>
          </div>
          <RuaComercial className="hidden md:block w-full h-auto -mb-8" />
        </div>
      </section>
      <Toldo />

      <div className="max-w-6xl mx-auto">
        <section className="px-4 sm:px-6 pt-5" aria-label="Categorias">
          <CategoryTabs variant="grid" value={category} onChange={setCategory} available={present} max={7} />
        </section>

        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6 pt-5" role="group" aria-label="Filtros">
          {availableFilters.map(([k, label]) => {
            const on = filters.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => toggleFilter(k)}
                className={`shrink-0 h-9 px-3.5 rounded-[8px] text-[13.5px] font-semibold border transition-colors ${on ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/40"}`}>
                {label}
              </button>
            );
          })}
        </div>
        {cities.length > 1 && <div className="pt-3"><CityPills value={city} onChange={setCity} cities={cities} /></div>}

        {browsing && <OrderAgain />}

        {isLoading ? (
          <section className="pt-7 px-4 sm:px-6"><SectionTitle>Abertas agora</SectionTitle><Skeleton /></section>
        ) : isError ? (
          <div className="py-10 px-4 text-center space-y-3" role="alert" data-erro-lojas>
            <p className="font-semibold">Não foi possível carregar as lojas.</p>
            <p className="text-sm text-muted-foreground">Confira sua internet e tente de novo.</p>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn-contorno h-11">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Tentar de novo
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <p className="font-semibold">
              {q ? `Nada encontrado para “${query.trim()}”.` : category ? `Ainda não há lojas de ${catName}.` : filters.length ? "Nenhuma loja com esses filtros agora." : "Ainda não há lojas no VizinhoMarket."}
            </p>
            {(q || category || filters.length) ? (
              <button type="button" onClick={() => { setQuery(""); setCategory(null); setFilters([]); }} className="btn-contorno h-11">Ver todas as lojas</button>
            ) : (
              <Link to="/indique-loja" className="btn-contorno h-11">Indique um comércio da cidade</Link>
            )}
          </div>
        ) : browsing ? (
          <>
            {open.length > 0 && (
              <section className="pt-8" aria-label="Abertas agora">
                <div className="px-4 sm:px-6"><SectionTitle sub={`${open.length} ${open.length === 1 ? "loja aberta" : "lojas abertas"} agora`}>Abertas agora</SectionTitle></div>
                <Rail label="Lojas abertas">{open.slice(0, 10).map((st) => <StoreTile key={st.id} store={st} />)}</Rail>
              </section>
            )}
            {featured.length > 0 && (
              <section className="pt-8" aria-label="Do cardápio das lojas">
                <div className="px-4 sm:px-6"><SectionTitle right={<Link to="/busca" className="text-sm font-semibold text-marca">Buscar produto</Link>}>Do cardápio das lojas</SectionTitle></div>
                <Rail label="Produtos">{featured.map((p) => <ProductCard key={p.id} product={p} store={storeById.get(p.store_id)} />)}</Rail>
              </section>
            )}
            {streets.map(({ group, stores: st }) => <Street key={group.id} group={group} stores={st} />)}
            {closed.length > 0 && (
              <section className="pt-8 px-4 sm:px-6" aria-label="Fechadas agora">
                <SectionTitle>Fechadas agora</SectionTitle>
                <div className={listaLojas}>{closed.map((s) => <StoreCard key={s.id} store={s} />)}</div>
              </section>
            )}
            <HowItWorks />
          </>
        ) : (
          <section className="pt-7 px-4 sm:px-6" aria-live="polite">
            <SectionTitle sub={`${open.length} ${open.length === 1 ? "loja" : "lojas"} ${catName ? `de ${catName} ` : ""}abertas agora`}>{q ? "Resultados" : catName || "Lojas"}</SectionTitle>
            {open.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nenhuma loja aberta neste momento.</p> : <div className={listaLojas}>{open.map((s) => <StoreCard key={s.id} store={s} />)}</div>}
            {closed.length > 0 && (
              <div className="pt-7">
                <h2 className="text-sm font-semibold text-muted-foreground mb-1">Fechadas agora</h2>
                <div className={listaLojas}>{closed.map((s) => <StoreCard key={s.id} store={s} />)}</div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// Como funciona: fatos do serviço (o que de fato acontece), não slogans.
function HowItWorks() {
  const items = [
    [MapPin, "Lojas e prestadores da cidade", "Quem vende é o comércio de Sidrolândia: você fala direto com a loja quando precisa."],
    [KeyRound, "Código de entrega", "O pedido só é dado como entregue com os 4 números que aparecem no seu app."],
    [Wallet, "Pague como preferir", "Na entrega (Pix, cartão ou dinheiro) ou pelo app, quando a loja aceitar."],
  ];
  return (
    <section className="mt-10 mx-4 sm:mx-6 mb-6 border-t border-border pt-6 grid sm:grid-cols-3 gap-5" aria-label="Como funciona">
      {items.map(([Icon, title, text]) => (
        <div key={title} className="flex gap-3">
          <Icon className="w-5 h-5 text-marca shrink-0 mt-0.5" aria-hidden="true" />
          <div><p className="font-semibold text-[15px]">{title}</p><p className="text-[13.5px] text-muted-foreground mt-0.5">{text}</p></div>
        </div>
      ))}
    </section>
  );
}
