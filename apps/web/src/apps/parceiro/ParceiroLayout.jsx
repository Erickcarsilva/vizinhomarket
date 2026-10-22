import React, { useState } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { ClipboardList, Bike, History, UtensilsCrossed, Wallet, BarChart3, Store, Bell, LogOut, Menu, Plus, Users } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import { usePartnerStore } from "@/lib/usePartnerStore";
import { useStoreOrders } from "@/lib/useStoreOrders";
import NewOrderAlert from "@/components/partner/NewOrderAlert";
import Brand from "@/components/layout/Brand";
import { APP_VERSION } from "@/lib/version";

// Campos: endereço, nome, ícone, contador, só o dono vê (o atendente cuida de pedidos, entregas e cardápio),
// só depois da aprovação (loja em análise não recebe pedidos: vê só o que precisa para se preparar).
const NAV = [
  ["/", "Pedidos", ClipboardList, "orders", false, true],
  ["/entregas", "Entregas", Bike, "deliveries", false, true],
  ["/historico", "Pedidos entregues", History, null, true, true],
  ["/cardapio", "Cardápio e preços", UtensilsCrossed],
  ["/financeiro", "Comissões e faturas", Wallet, null, true, true],
  ["/relatorios", "Relatórios", BarChart3, null, true, true],
  ["/loja", "Minha loja", Store, null, true],
  ["/equipe", "Equipe", Users, null, true],
  ["/alertas", "Alertas", Bell],
];
export const OWNER_ONLY = NAV.filter((n) => n[4]).map((n) => n[0]);
export const APPROVED_ONLY = NAV.filter((n) => n[5]).map((n) => n[0]);
const matches = (list, path) => list.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));

function Sidebar({ store, stores, pickStore, counts, onNavigate, isOwner }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <Brand size="md" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-semibold mt-1">Painel do comerciante</p>
        {stores.length > 1 ? (
          <select value={store?.id} onChange={(e) => pickStore(e.target.value)} className="mt-4 w-full h-10 rounded-xl border border-border bg-card px-3 text-sm">
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <p className="mt-4 font-semibold truncate">{store?.name}</p>
        )}
        {!isOwner && store && <p className="mt-1 text-xs text-muted-foreground">Você é atendente desta loja</p>}
        {store && store.status !== "approved" && (
          <p data-loja-status={store.status} className="mt-2 text-xs rounded-lg bg-amber-100 text-amber-800 px-2 py-1">{store.status === "pending" ? "Aguardando aprovação do VizinhoMarket" : "Loja suspensa: fale com o suporte"}</p>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.filter((n) => (isOwner || !n[4]) && (store?.status !== "pending" || !n[5])).map(([to, label, Icon, countKey]) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 min-h-[44px] px-3 rounded-xl text-[15px] font-medium transition ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <span className="flex-1">{label}</span>
            {countKey && counts[countKey] > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center">{counts[countKey]}</span>}
          </NavLink>
        ))}
        <NavLink to="/cadastrar-loja" onClick={onNavigate} className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl text-sm text-muted-foreground hover:bg-secondary">
          <Plus className="w-4 h-4" />Cadastrar outra loja
        </NavLink>
      </nav>
      <div className="px-5 py-4 border-t border-border space-y-2">
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        <button onClick={() => logout(true)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4" />Sair</button>
        <p className="text-[10px] text-muted-foreground">Versão {APP_VERSION}</p>
      </div>
    </div>
  );
}

export default function ParceiroLayout() {
  const { stores, store, pickStore, isLoading, isOwner } = usePartnerStore();
  const { orders, ready } = useStoreOrders(store?.id);
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  if (isLoading) {
    return <div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }
  // Ainda não tem loja: vai direto para o cadastro.
  if (!stores.length && loc.pathname !== "/cadastrar-loja") return <Navigate to="/cadastrar-loja" replace />;

  const counts = {
    orders: orders.filter((o) => o.status === "CREATED").length,
    deliveries: orders.filter((o) => ["READY", "IN_TRANSIT"].includes(o.status) && o.fulfillment !== "retirada").length,
  };
  const side = <Sidebar store={store} stores={stores} pickStore={pickStore} counts={counts} isOwner={isOwner} onNavigate={() => setOpen(false)} />;
  // Atendente que abre um endereço só do dono volta para Pedidos.
  const pending = store?.status === "pending";
  if (store && !isOwner && matches(OWNER_ONLY, loc.pathname)) return <Navigate to={pending ? "/cardapio" : "/"} replace />;
  // Loja em análise: pedidos e financeiro só aparecem depois da aprovação.
  if (pending && matches(APPROVED_ONLY, loc.pathname)) return <Navigate to={isOwner ? "/loja" : "/cardapio"} replace />;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-card/50 sticky top-0 h-screen">{side}</aside>
      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border h-14 px-4 flex items-center justify-between">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="w-10 h-10 -ml-2 rounded-full hover:bg-secondary flex items-center justify-center"><Menu className="w-5 h-5" /></button>
          <p className="font-semibold truncate px-2">{store?.name || "Painel do comerciante"}</p>
          <span className={`min-w-[28px] h-7 px-2 rounded-full text-xs font-bold flex items-center justify-center ${counts.orders ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>{counts.orders}</span>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[82%] max-w-xs p-0">
            <SheetTitle className="sr-only">Menu do painel</SheetTitle>
            {side}
          </SheetContent>
        </Sheet>
        {pending && (
          <div data-em-analise className="px-5 pt-4 max-w-6xl mx-auto">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
              <p className="font-semibold">Sua loja está em análise</p>
              <p className="mt-1">Enquanto isso, deixe tudo pronto: dados da loja, horários, bairros de entrega e o cardápio com fotos.
                Ela ainda não aparece para os clientes e não recebe pedidos. Assim que for aprovada, Pedidos e Financeiro aparecem aqui no menu.</p>
            </div>
          </div>
        )}
        {store && !pending && (
          <div className="px-5 pt-4 max-w-6xl mx-auto">
            <NewOrderAlert key={store.id} orders={orders} ready={ready} />
          </div>
        )}
        <main><Outlet context={{ store, stores, isOwner }} /></main>
      </div>
    </div>
  );
}
