import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Store, ShoppingBag, Users, Bike, Wallet, Settings, AlertTriangle, LogOut, Menu, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import Brand from "@/components/layout/Brand";
import { APP_VERSION } from "@/lib/version";
import { URLS } from "@/lib/appConfig";

export const ADMIN_NAV = [
  ["/", "Visão geral", LayoutDashboard],
  ["/lojas", "Lojas", Store],
  ["/pedidos", "Pedidos", ShoppingBag],
  ["/usuarios", "Usuários", Users],
  ["/entregadores", "Entregadores", Bike],
  ["/comissoes", "Comissões e faturas", Wallet],
  ["/config", "Configurações", Settings],
  ["/registros", "Erros e histórico", AlertTriangle],
];

function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <Brand size="md" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-semibold mt-1">Painel administrativo</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {ADMIN_NAV.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 min-h-[44px] px-3 rounded-xl text-[15px] font-medium transition ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
            <Icon className="w-5 h-5 shrink-0" />{label}
          </NavLink>
        ))}
        <div className="pt-3 mt-3 border-t border-border space-y-0.5">
          <a href={URLS.cliente} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-h-[40px] px-3 rounded-xl text-sm text-muted-foreground hover:bg-secondary"><ExternalLink className="w-4 h-4" />Abrir app do cliente</a>
          <a href={URLS.parceiro} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-h-[40px] px-3 rounded-xl text-sm text-muted-foreground hover:bg-secondary"><ExternalLink className="w-4 h-4" />Abrir painel do comerciante</a>
        </div>
      </nav>
      <div className="px-5 py-4 border-t border-border space-y-2">
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        <button onClick={() => logout(true)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4" />Sair</button>
        <p className="text-[10px] text-muted-foreground">Versão {APP_VERSION}</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-card/50 sticky top-0 h-screen"><Sidebar /></aside>
      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border h-14 px-4 flex items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="w-10 h-10 -ml-2 rounded-full hover:bg-secondary flex items-center justify-center"><Menu className="w-5 h-5" /></button>
          <p className="font-semibold">Painel administrativo</p>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[82%] max-w-xs p-0">
            <SheetTitle className="sr-only">Menu do painel</SheetTitle>
            <Sidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
