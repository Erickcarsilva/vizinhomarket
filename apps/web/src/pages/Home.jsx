import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, RotateCcw, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import CityPills from "@/components/home/CityPills";
import StoreCard from "@/components/home/StoreCard";
import ProductCard from "@/components/home/ProductCard";
import CategoryTabs from "@/components/home/CategoryTabs";
import { categoryLabel, isStoreListable } from "@/lib/constants";

// Lista de lojas que nunca fica mais larga que a tela (nome longo é cortado com reticências).
export const listaLojas = "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[repeat(2,minmax(0,1fr))] gap-x-10";

function SectionTitle({ children, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-1">
      <div className="min-w-0">
        <h2 className="font-display text-[22px] leading-tight text-marca">{children}</h2>
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
      <Link to={`/loja/${last.store_id}`} className="flex items-center gap-3 rounded-lg bg-card border border-border px-3.5 py-3 hover:border-marca/40 transition-colors">
        <RotateCcw className="w-5 h-5 text-marca shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-muted-foreground">Peça de novo</span>
          <span className="block text-[15px] font-semibold truncate">{last.store_name}</span>
          <span className="block text-[13px] text-muted-foreground truncate">{resumo}</span>
        </span>
        <span className="text-sm font-semibold text-marca underline underline-offset-4 shrink-0">Ver loja</span>
      </Link>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3.5 py-3">
          <div className="w-[60px] h-[60px] rounded-[14px] bg-secondary animate-pulse" />
          <div className="flex-1 space-y-2"><div className="h-4 w-2/3 rounded bg-secondary animate-pulse" /><div className="h-3 w-1/2 rounded bg-secondary animate-pulse" /></div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [city, setCity] = useState(null);

  const { data: stores = [], isLoading, isError, refetch, isFetching } = useQuery({
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
  const visible = listable
    .filter((s) => !city || s.city === city)
    .filter((s) => !category || s.category === category)
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || matchStoreIds.has(s.id));
  const open = visible.filter((s) => s.is_open);
  const closed = visible.filter((s) => !s.is_open);

  const storeById = new Map(listable.map((s) => [s.id, s]));
  const featured = products
    // Só produtos com foto: destaque sem foto não convence ninguém.
    .filter((p) => p.image_url && storeById.get(p.store_id)?.is_open && (!category || storeById.get(p.store_id)?.category === category))
    .slice(0, 10);
  const present = new Set(listable.map((s) => s.category));
  const catName = category ? categoryLabel(category) : "";

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="sr-only">Lojas de Sidrolândia no VizinhoMarket</h1>
      <div className="px-4 sm:px-6 pt-3">
        <label className="flex items-center gap-2.5 h-12 px-3.5 rounded-lg bg-card border border-input focus-within:ring-2 focus-within:ring-ring">
          <Search className="w-[18px] h-[18px] text-marca shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar loja, prato ou produto" aria-label="Buscar loja, prato ou produto"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none" />
        </label>
      </div>

      <CategoryTabs value={category} onChange={setCategory} available={present} />
      {cities.length > 1 && <div className="pt-3"><CityPills value={city} onChange={setCity} cities={cities} /></div>}

      {!q && !category && <OrderAgain />}

      {!q && featured.length > 0 && (
        <section className="pt-6">
          <div className="px-4 sm:px-6"><SectionTitle right={<Link to="/busca" className="text-sm font-semibold text-marca underline underline-offset-4">Ver mais</Link>}>{category ? `Destaques em ${catName}` : "Destaques de hoje"}</SectionTitle></div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pt-2 pb-1">
            {featured.map((p) => <ProductCard key={p.id} product={p} store={storeById.get(p.store_id)} />)}
          </div>
        </section>
      )}

      <section className="pt-6 px-4 sm:px-6" aria-live="polite">
        {isLoading ? (
          <>
            <SectionTitle>{q ? "Resultados" : "Abertas agora"}</SectionTitle>
            <p className="text-[13px] text-muted-foreground">Carregando lojas…</p>
            <Skeleton />
          </>
        ) : isError ? (
          <div className="py-10 text-center space-y-3" role="alert" data-erro-lojas>
            <p className="font-semibold">Não foi possível carregar as lojas.</p>
            <p className="text-sm text-muted-foreground">Confira sua internet e tente de novo.</p>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn-contorno h-11">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Tentar de novo
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="font-semibold">
              {q ? `Nada encontrado para “${query.trim()}”.` : category ? `Ainda não há lojas de ${catName}.` : "Ainda não há lojas no VizinhoMarket."}
            </p>
            {(q || category) ? (
              <button type="button" onClick={() => { setQuery(""); setCategory(null); }} className="btn-contorno h-11">Ver todas as lojas</button>
            ) : (
              <Link to="/indique-loja" className="btn-contorno h-11">Indique um comércio da cidade</Link>
            )}
          </div>
        ) : (
          <>
            <SectionTitle sub={`${open.length} ${open.length === 1 ? "loja" : "lojas"} ${catName ? `de ${catName} ` : ""}entregando agora`}>
              {q ? "Resultados" : "Abertas agora"}
            </SectionTitle>
            {open.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nenhuma loja aberta neste momento.</p>
            ) : (
              <div className={listaLojas}>{open.map((s) => <StoreCard key={s.id} store={s} />)}</div>
            )}
            {closed.length > 0 && (
              <div className="pt-7">
                <h2 className="text-sm font-semibold text-muted-foreground mb-1">Fechadas agora</h2>
                <div className={listaLojas}>{closed.map((s) => <StoreCard key={s.id} store={s} />)}</div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
