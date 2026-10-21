import React from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import StoreSettings from "@/components/partner/StoreSettings";

export default function Loja() {
  const { store } = useOutletContext();
  const qc = useQueryClient();
  if (!store) return null;
  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Minha loja</p>
          <h1 className="font-display text-4xl mt-2">Funcionamento</h1>
          <p className="text-sm text-muted-foreground mt-2">Abrir e pausar a loja, horário, taxa de entrega, pedido mínimo, chave Pix e formas de entrega.</p>
        </div>
        <Link to="/loja/aparencia" className="h-10 px-5 rounded-full border border-border text-sm font-semibold flex items-center hover:bg-secondary">Logo e capa</Link>
      </div>
      <StoreSettings key={store.id + (store.updated_date || "")} store={store} onSaved={() => qc.invalidateQueries({ queryKey: ["stores"] })} />
    </div>
  );
}
