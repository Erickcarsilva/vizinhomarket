import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import StoreCard from "@/components/home/StoreCard";
import SearchField from "@/components/home/SearchField";
import { listaLojas } from "@/pages/Home";
import { brl, isStoreListable } from "@/lib/constants";
import { Image } from "@/components/ui/image";

function Title({ children }) {
  return <h2 className="font-display text-[22px] leading-tight text-marca mb-1">{children}</h2>;
}

// Produto encontrado: linha com foto, nome, loja e preço.
function ProductRow({ p, store }) {
  return (
    <Link to={`/loja/${p.store_id}`} className="flex items-center gap-3.5 py-3 min-w-0 border-b border-[#EDE6D8] last:border-0 hover:bg-secondary/50 transition-colors">
      <span className="w-[60px] h-[60px] shrink-0 rounded-[14px] overflow-hidden bg-[#E5DDCE] flex items-center justify-center">
        {p.image_url ? <Image src={p.image_url} alt="" className="w-full h-full object-cover" />
          : <span aria-hidden="true" className="font-display font-semibold text-[23px] text-marca">{(p.name || "?")[0]}</span>}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-base font-semibold leading-tight truncate">{p.name}</span>
        <span className="text-[13px] text-muted-foreground truncate">{store?.name || "Loja"}</span>
      </span>
      <span className="shrink-0 text-[15px] font-bold text-primary">{brl(p.price)}</span>
    </Link>
  );
}

export default function Busca() {
  const [q, setQ] = useState("");
  const { data: stores = [], isLoading } = useQuery({ queryKey: ["stores", "approved"], queryFn: () => base44.entities.Store.filter({ status: "approved" }, "-rating", 200) });
  // Produtos: busca no servidor, 300 ms depois que a pessoa para de digitar.
  const [typed, setTyped] = useState("");
  useEffect(() => { const id = setTimeout(() => setTyped(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const { data: products = [], isFetching: searching } = useQuery({
    queryKey: ["products", "search", typed.toLowerCase()],
    queryFn: () => base44.entities.Product.search(typed),
    enabled: typed.length >= 2,
  });

  const active = stores.filter(isStoreListable);
  const byId = new Map(active.map((s) => [s.id, s]));
  const term = q.trim().toLowerCase();
  const storeResults = (term
    ? active.filter((s) => s.name.toLowerCase().includes(term) || (s.description || "").toLowerCase().includes(term))
    : active).slice().sort((a, b) => Number(b.is_open) - Number(a.is_open));
  const productResults = typed.length >= 2 ? products.filter((p) => byId.has(p.store_id)) : [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-10">
      <h1 className="font-display text-2xl text-marca mb-3">Buscar</h1>
      <SearchField value={q} onChange={setQ} autoFocus />

      {term && (
        <section className="pt-6" aria-live="polite">
          <Title>Produtos</Title>
          <p className="text-[13px] text-muted-foreground">{searching ? "Buscando…" : `${productResults.length} ${productResults.length === 1 ? "produto encontrado" : "produtos encontrados"}`}</p>
          {!searching && productResults.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhum produto encontrado para “{q.trim()}”.</p>
          ) : (
            <div className={listaLojas}>{productResults.slice(0, 16).map((p) => <ProductRow key={p.id} p={p} store={byId.get(p.store_id)} />)}</div>
          )}
        </section>
      )}

      <section className="pt-6">
        <Title>{term ? "Lojas" : "Todas as lojas"}</Title>
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Carregando lojas…</p>
        ) : storeResults.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nenhuma loja encontrada para “{q.trim()}”.</p>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">{storeResults.length} {storeResults.length === 1 ? "loja" : "lojas"}</p>
            <div className={listaLojas}>{storeResults.map((s) => <StoreCard key={s.id} store={s} />)}</div>
          </>
        )}
      </section>
    </div>
  );
}
