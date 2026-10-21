import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { usePartnerStore } from "@/lib/usePartnerStore";
import StoreSwitcher from "@/components/partner/StoreSwitcher";
import NoStore from "@/components/partner/NoStore";
import SalesCharts from "@/components/partner/SalesCharts";
import { brl } from "@/lib/constants";

const PERIODS = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "all", label: "Tudo" },
];
const fmtDay = (iso) => { const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}`; };

// Relatórios calculados no servidor (store_summary, store_daily, store_top_products): corretos com qualquer volume.
export default function Reports() {
  const { stores, store, pickStore, isLoading } = usePartnerStore();
  const [period, setPeriod] = useState("30");
  const range = useMemo(() => ({
    from: period === "all" ? "2020-01-01T00:00:00Z" : new Date(Date.now() - Number(period) * 864e5).toISOString(),
    to: new Date(Date.now() + 60000).toISOString(),
  }), [period]);
  const enabled = !!store;
  const { data: sum } = useQuery({ queryKey: ["orders", store?.id, "report-sum", range.from], queryFn: () => base44.partner.summary(store.id, range.from, range.to), enabled });
  const { data: days = [] } = useQuery({ queryKey: ["orders", store?.id, "report-daily", range.from], queryFn: () => base44.partner.daily(store.id, range.from, range.to), enabled });
  const { data: top = [] } = useQuery({ queryKey: ["orders", store?.id, "report-top", range.from], queryFn: () => base44.partner.topProducts(store.id, range.from, range.to, 5), enabled });

  const { daily, cumulative, topProducts, kpis } = useMemo(() => {
    const daily = days.map((d) => ({ label: fmtDay(d.day), value: Math.round(d.total * 100) / 100 }));
    let acc = 0;
    const cumulative = daily.map((d) => { acc += d.value; return { label: d.label, value: Math.round(acc * 100) / 100 }; });
    const topProducts = top.map((p) => ({ name: p.name, qty: p.quantity, revenue: p.revenue }));
    const kpis = { revenue: sum?.total ?? 0, orders: sum?.orders ?? 0, ticket: sum?.avg_ticket ?? 0, cancelled: sum?.cancelled ?? 0 };
    return { daily, cumulative, topProducts, kpis };
  }, [days, top, sum]);

  if (isLoading) return <div className="max-w-6xl mx-auto px-5 py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" /></div>;
  if (stores.length === 0) return <NoStore />;

  const stats = [
    ["Faturamento (entregues)", brl(kpis.revenue)],
    ["Pedidos", kpis.orders],
    ["Ticket médio", brl(kpis.ticket)],
    ["Cancelados", kpis.cancelled],
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-12 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Relatórios</p>
          <h1 className="font-display text-4xl mt-2">Vendas e faturamento</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-secondary rounded-full p-1">
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)} className={`h-9 px-4 rounded-full text-sm font-medium transition ${period === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{p.label}</button>
            ))}
          </div>
          <StoreSwitcher stores={stores} store={store} onPick={pickStore} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-5">
            <p className="font-display text-3xl">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      <SalesCharts daily={daily} cumulative={cumulative} />

      <section className="bg-card border border-border rounded-2xl p-5">
        <p className="text-sm font-semibold mb-4">Produtos mais pedidos</p>
        {topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período selecionado.</p>
        ) : (
          <div className="divide-y divide-border">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-4 py-3">
                <span className="font-display text-lg text-muted-foreground w-6">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.qty} pedidos · {brl(p.revenue)}</p>
                </div>
                <div className="w-32 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((p.qty / topProducts[0].qty) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}