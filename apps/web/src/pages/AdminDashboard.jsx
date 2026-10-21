import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TrendingUp, Wallet, Store } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Metrics from "@/components/admin/Metrics";
import StoresTable from "@/components/admin/StoresTable";
import { brl } from "@/lib/constants";

export default function AdminDashboard() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ["stores", "all"], queryFn: () => base44.entities.Store.list("-created_date", 500) });
  const { data: orders = [] } = useQuery({ queryKey: ["orders", "all"], queryFn: () => base44.entities.Order.list("-created_date", 1000) });
  const { data: appErrors = [] } = useQuery({ queryKey: ["client-errors"], queryFn: () => base44.admin.listErrors(30) });

  const now = new Date();
  const inMonth = (d, year, month) => { const x = new Date(d); return x.getFullYear() === year && x.getMonth() === month; };
  const thisMonth = orders.filter((o) => inMonth(o.created_date, now.getFullYear(), now.getMonth()));
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = orders.filter((o) => inMonth(o.created_date, lm.getFullYear(), lm.getMonth()));
  const growth = lastMonth.length ? Math.round(((thisMonth.length - lastMonth.length) / lastMonth.length) * 100) : thisMonth.length ? 100 : 0;
  const gmv = orders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + (o.total || 0), 0);
  const pending = stores.filter((s) => s.status === "pending");

  const cards = [
    { icon: TrendingUp, label: "Pedidos no mês", value: thisMonth.length, sub: `${growth >= 0 ? "+" : ""}${growth}% vs. mês anterior` },
    { icon: Wallet, label: "Faturamento total", value: brl(gmv) },
    { icon: Store, label: "Lojas ativas", value: stores.filter((s) => s.status === "approved").length },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-12 space-y-10">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Painel administrativo</p>
        <h1 className="font-display text-4xl mt-2">Visão geral da plataforma</h1>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-muted-foreground"><Icon className="w-4 h-4" /><span className="text-xs uppercase tracking-[0.15em]">{c.label}</span></div>
              <p className="font-display text-3xl mt-3">{c.value}</p>
              {c.sub && <p className={`text-sm mt-1 ${growth >= 0 ? "text-emerald-600" : "text-destructive"}`}>{c.sub}</p>}
            </div>
          );
        })}
      </div>
      <Metrics stores={stores} orders={orders} />
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl">Pendências de aprovação</h2>
          <span className="text-sm text-muted-foreground">{pending.length} {pending.length === 1 ? "loja aguardando" : "lojas aguardando"}</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center rounded-2xl border border-border bg-card">Nenhuma loja aguardando aprovação.</p>
        ) : (
          <StoresTable stores={pending} onChanged={() => qc.invalidateQueries({ queryKey: ["stores"] })} />
        )}
      </section>
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl">Erros recentes no app</h2>
          <span className="text-sm text-muted-foreground">últimos 30</span>
        </div>
        {appErrors.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center rounded-2xl border border-border bg-card">Nenhum erro registrado.</p>
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border text-sm">
            {appErrors.map((e) => (
              <div key={e.id} className="p-4">
                <p className="font-medium break-words">{e.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(e.created_at).toLocaleString("pt-BR")} · {e.url || "?"} · {(e.user_agent || "").slice(0, 60)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
      <Link to="/admin" className="inline-flex items-center h-11 px-6 rounded-full border border-border font-semibold hover:bg-secondary transition-colors">Ver operação completa →</Link>
    </div>
  );
}