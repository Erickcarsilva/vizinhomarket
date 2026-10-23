import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, RotateCcw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import CityPills from "@/components/home/CityPills";
import StoreCard from "@/components/home/StoreCard";
import ProductCard from "@/components/home/ProductCard";
import { CATEGORIES, categoryLabel, isStoreListable } from "@/lib/constants";

const Title = ({ children, right }) => (
  <div className="flex items-baseline justify-between mb-2">
    <h2 className="text-base font-bold">{children}</h2>
    {right}
  </div>
);

// Nome curto de cada categoria para as abas do topo.
const SHORT = { alimentacao: "Restaurantes", mercado: "Mercado", pet: "Pet shop", bebidas: "Bebidas", autopecas: "Autopeças", eletronicos: "Eletrônicos", lojas: "Variedades" };

// Abas de categoria fixas no topo, como nos apps de delivery: a escolhida fica destacada.
function CategoryTabs({ value, onChange }) {
  return (
    <div className="sticky top-14 z-30 bg-background shadow-[0_6px_10px_-8px_rgba(0,0,0,0.18)] rounded-b-2xl">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 sm:px-5 py-2.5">
        {CATEGORIES.map(({ id, label, icon: Icon }) => {
          const on = value === id;
          return (
            <button key={id} type="button" onClick={() => onChange(on ? null : id)} aria-pressed={on} title={label}
              className={`shrink-0 flex items-center gap-2 h-11 pl-3 pr-4 rounded-xl border-2 text-[15px] transition-colors ${on ? "border-primary bg-primary/10 text-primary font-semibold" : "border-transparent text-foreground/80"}`}>
              <Icon className={`w-5 h-5 ${on ? "text-primary" : "text-primary/80"}`} strokeWidth={2} aria-hidden="true" />
              {SHORT[id] || label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Cartazes das categorias que têm loja: levam para a lista filtrada.
function Banners({ stores, onPick }) {
  const items = [
    ["alimentacao", "Restaurantes e lanches", "bg-primary text-primary-foreground"],
    ["mercado", "Mercado em casa", "bg-amber-400 text-amber-950"],
    ["bebidas", "Bebidas geladas", "bg-neutral-900 text-white"],
  ].map(([id, title, tone]) => ({ id, title, tone, n: stores.filter((s) => s.category === id).length })).filter((b) => b.n > 0);
  if (!items.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 sm:px-5 py-3">
      {items.map((b) => (
        <button key={b.id} type="button" onClick={() => onPick(b.id)}
          className={`w-[78%] max-w-[300px] h-28 shrink-0 rounded-lg p-4 text-left flex flex-col justify-between ${b.tone}`}>
          <span className="text-xl font-extrabold uppercase leading-none">{b.title}</span>
          <span className="text-xs font-medium">{b.n} {b.n === 1 ? "loja" : "lojas"} na cidade · Ver</span>
        </button>
      ))}
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
  const resumo = last.items.map((i) => `${i.quantity} ${i.name}`).join(", ");
  return (
    <section className="px-3 sm:px-5 pt-3">
      <Title>Peça de novo</Title>
      <Link to={`/loja/${last.store_id}`} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary/60 transition-colors">
        <span className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0"><RotateCcw className="w-5 h-5" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{last.store_name}</span>
          <span className="block text-xs text-muted-foreground truncate">{resumo}</span>
        </span>
        <span className="text-sm font-bold text-primary">Ver loja</span>
      </Link>
    </section>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [city, setCity] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "approved"],
    queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => base44.entities.Product.filter({ available: true }, "-created_date", 1000),
  });

  const listable = stores.filter(isStoreListable);
  const cities = [...new Set(listable.map((s) => s.city).filter(Boolean))];
  const q = query.trim().toLowerCase();
  const matchStoreIds = new Set(products.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.store_id));
  const isFree = (s) => (s.delivery_zones ? s.delivery_fee_max === 0 : !s.delivery_fee);
  const visible = listable
    .filter((s) => !city || s.city === city)
    .filter((s) => !category || s.category === category)
    .filter((s) => !onlyOpen || s.is_open)
    .filter((s) => !freeDelivery || isFree(s))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || matchStoreIds.has(s.id))
    .sort((a, b) => Number(b.is_open) - Number(a.is_open));

  const storeById = new Map(listable.map((s) => [s.id, s]));
  const featured = products
    // Só produtos com foto: destaque sem foto não convence ninguém.
    .filter((p) => p.image_url && storeById.get(p.store_id)?.is_open && (!category || storeById.get(p.store_id)?.category === category))
    .slice(0, 10);
  const chip = (on) => `h-8 px-3 rounded-full border text-xs whitespace-nowrap transition-colors ${on ? "bg-foreground text-background border-foreground" : "bg-background border-border"}`;

  return (
    <div className="max-w-6xl mx-auto">
      <CategoryTabs value={category} onChange={setCategory} />
      <div className="px-3 sm:px-5 pt-3">
        <label className="flex items-center gap-2 h-11 px-3 rounded-md bg-secondary text-muted-foreground">
          <Search className="w-[18px] h-[18px] text-primary" strokeWidth={2.4} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar item ou loja" aria-label="Buscar item ou loja"
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none" />
        </label>
      </div>

      {cities.length > 1 && <div className="pt-2"><CityPills value={city} onChange={setCity} cities={cities} /></div>}

      {!q && !category && <Banners stores={listable} onPick={setCategory} />}
      {!q && <OrderAgain />}

      {!q && featured.length > 0 && (
        <section className="pt-4">
          <div className="px-3 sm:px-5"><Title right={<Link to="/busca" className="text-xs font-bold text-primary">Ver mais</Link>}>{category ? `Destaques em ${categoryLabel(category)}` : "Destaques de hoje"}</Title></div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-3 sm:px-5 pb-1">
            {featured.map((p) => <ProductCard key={p.id} product={p} store={storeById.get(p.store_id)} />)}
          </div>
        </section>
      )}

      <section className="pt-5 px-3 sm:px-5">
        <Title right={<span className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "loja" : "lojas"}</span>}>
          {q ? "Resultados" : category ? categoryLabel(category) : "Lojas"}
        </Title>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button type="button" onClick={() => setOnlyOpen((v) => !v)} aria-pressed={onlyOpen} className={chip(onlyOpen)}>Abertas agora</button>
          <button type="button" onClick={() => setFreeDelivery((v) => !v)} aria-pressed={freeDelivery} className={chip(freeDelivery)}>Entrega grátis</button>
          {category && <button type="button" onClick={() => setCategory(null)} className={`${chip(false)} inline-flex items-center gap-1`}>Todas as categorias <X className="w-3.5 h-3.5" aria-hidden="true" /></button>}
        </div>
        {isLoading ? (
          <div className="space-y-3 pt-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-muted-foreground">{listable.length ? "Nenhuma loja com esses filtros." : "Nenhuma loja disponível ainda."}</p>
            <Link to="/indique-loja" className="inline-block text-sm font-bold text-primary">Conhece um comércio? Indique uma loja</Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-x-8 pt-1">
            {visible.map((s) => <StoreCard key={s.id} store={s} />)}
          </div>
        )}
      </section>
    </div>
  );
}
