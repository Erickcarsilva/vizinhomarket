import React from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, Store, ShoppingBag, Users, Bike, Wallet, Settings, AlertTriangle } from "lucide-react";
import Overview from "@/components/admin/panel/Overview";
import StoresAdmin from "@/components/admin/panel/StoresAdmin";
import OrdersAdmin from "@/components/admin/panel/OrdersAdmin";
import UsersAdmin from "@/components/admin/panel/UsersAdmin";
import CouriersAdmin from "@/components/admin/panel/CouriersAdmin";
import InvoicesAdmin from "@/components/admin/panel/InvoicesAdmin";
import SettingsAdmin from "@/components/admin/panel/SettingsAdmin";
import LogsAdmin from "@/components/admin/panel/LogsAdmin";

const TABS = [
  ["visao", "Visão geral", LayoutDashboard],
  ["lojas", "Lojas", Store],
  ["pedidos", "Pedidos", ShoppingBag],
  ["usuarios", "Usuários", Users],
  ["entregadores", "Entregadores", Bike],
  ["comissoes", "Comissões", Wallet],
  ["config", "Configurações", Settings],
  ["registros", "Erros e histórico", AlertTriangle],
];

export default function AdminPanel() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("aba")) ? params.get("aba") : "visao";
  const goTo = (k) => setParams(k === "visao" ? {} : { aba: k });

  return (
    <div className="max-w-6xl mx-auto px-5 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Administração</p>
        <h1 className="font-display text-4xl mt-2">Painel do VizinhoMarket</h1>
      </div>
      <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5" aria-label="Seções do painel">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => goTo(k)} aria-current={tab === k ? "page" : undefined}
            className={`h-10 px-4 rounded-full text-sm whitespace-nowrap flex items-center gap-2 border transition ${tab === k ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:bg-secondary"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </nav>
      {tab === "visao" && <Overview goTo={goTo} />}
      {tab === "lojas" && <StoresAdmin />}
      {tab === "pedidos" && <OrdersAdmin />}
      {tab === "usuarios" && <UsersAdmin />}
      {tab === "entregadores" && <CouriersAdmin />}
      {tab === "comissoes" && <InvoicesAdmin />}
      {tab === "config" && <SettingsAdmin />}
      {tab === "registros" && <LogsAdmin />}
    </div>
  );
}
