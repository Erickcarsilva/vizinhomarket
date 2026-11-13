import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ReceiptText } from "lucide-react";
import { brl } from "@/lib/constants";
import { useMyOrders } from "@/lib/useMyOrders";
import { StoreLogo } from "@/components/home/StoreCard";
import { statusLabel } from "@/components/order/StatusTimeline";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { SERVICE_STATUS } from "@/pages/Orcamento";

// Cor do status no app do cliente: verde enquanto anda, cinza quando terminou, terracota escuro se cancelou.
const tom = (s) => s === "CANCELLED" ? "text-[#C2331A]" : s === "DELIVERED" ? "text-muted-foreground" : "text-marca";

export default function MyOrders() {
  const { orders, isLoading } = useMyOrders();
  const { data: servicos = [] } = useQuery({ queryKey: ["my-services"], queryFn: () => base44.services.mine() });
  const andamento = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const anteriores = orders.filter((o) => ["DELIVERED", "CANCELLED"].includes(o.status));
  const linha = (o) => (
    <Link key={o.id} to={`/pedido/${o.id}`} className="flex items-center gap-3.5 py-3 min-w-0 border-b border-[#E8ECE9] last:border-0 hover:bg-secondary/50 transition-colors">
      <StoreLogo store={{ name: o.store_name }} size={48} className="rounded-[12px]" />
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold truncate">{o.store_name}</span>
        <span className={`block text-[13px] font-semibold ${tom(o.status)}`}>{o.status === "CANCELLED" ? "Cancelado" : statusLabel(o.status, o.fulfillment)}</span>
        <span className="block text-[13px] text-muted-foreground">{new Date(o.created_date).toLocaleDateString("pt-BR")} · {brl(o.total)}</span>
      </span>
      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
    </Link>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10">
      <h1 className="font-display text-2xl text-marca">Meus pedidos</h1>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground mt-2">Carregando pedidos…</p>
      ) : orders.length === 0 && servicos.length === 0 ? (
        <div className="text-center py-16">
          <span className="mx-auto w-16 h-16 rounded-full bg-[#EAF6EF] text-marca flex items-center justify-center"><ReceiptText className="w-7 h-7" aria-hidden="true" /></span>
          <p className="font-semibold mt-4">Você ainda não fez nenhum pedido.</p>
          <p className="text-muted-foreground text-sm mt-1">Quando pedir, você acompanha tudo por aqui.</p>
          <Link to="/" className="btn-acao mt-6">Ver as lojas</Link>
        </div>
      ) : (
        <>
          {andamento.length > 0 && (
            <section className="pt-4">
              <h2 className="text-sm font-semibold text-muted-foreground mb-1">Em andamento</h2>
              <div>{andamento.map(linha)}</div>
            </section>
          )}
          {servicos.length > 0 && (
            <section className="pt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-1">Orçamentos de serviços</h2>
              <div>{servicos.map((r) => (
                <Link key={r.id} to={`/orcamento/${r.id}`} className="flex items-center gap-3.5 py-3 min-w-0 border-b border-[#E8ECE9] last:border-0 hover:bg-secondary/50 transition-colors">
                  <StoreLogo store={{ name: r.store?.name || "?" }} size={48} className="rounded-[12px]" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold truncate">{r.store?.name}</span>
                    <span className={`block text-[13px] font-semibold ${["CANCELLED", "DECLINED", "EXPIRED"].includes(r.status) ? "text-[#C2331A]" : r.status === "COMPLETED" ? "text-muted-foreground" : "text-marca"}`}>{SERVICE_STATUS[r.status]}</span>
                    <span className="block text-[13px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}{r.quote_amount ? ` · ${brl(r.quote_amount)}` : ""}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                </Link>
              ))}</div>
            </section>
          )}
          {anteriores.length > 0 && (
            <section className="pt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-1">Anteriores</h2>
              <div>{anteriores.map(linha)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
