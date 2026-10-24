import { APP_VERSION } from "@/lib/version";
import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, LogIn, LogOut, Search, Home, ReceiptText, User, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useCart } from "@/lib/CartContext";
import { useAuth } from "@/lib/AuthContext";
import Brand from "@/components/layout/Brand";
import MobileMenu from "@/components/layout/MobileMenu";

// Menu de baixo no celular, como nos apps de delivery.
const TABS = [
  ["/", "Início", Home],
  ["/busca", "Busca", Search],
  ["/meus-pedidos", "Pedidos", ReceiptText],
  ["/perfil", "Perfil", User],
];

// "Entregar em …": endereço padrão do cliente; para quem não entrou, a cidade.
function DeliveryTo() {
  const { user, isAuthenticated } = useAuth();
  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses", user?.id],
    queryFn: () => base44.account.listAddresses(),
    enabled: !!user?.id,
  });
  const main = addresses.find((a) => a.is_default) || addresses[0];
  if (!isAuthenticated || !main) return <span className="block text-[13px] text-muted-foreground truncate">Sidrolândia/MS</span>;
  return (
    <Link to="/perfil" className="flex items-center gap-1 text-[13px] text-muted-foreground min-w-0" title="Trocar endereço de entrega">
      <span className="shrink-0">Entregar em</span>
      <strong className="font-semibold text-foreground truncate">{main.line}</strong>
      <ChevronDown className="w-3.5 h-3.5 text-marca shrink-0" strokeWidth={2.6} aria-hidden="true" />
    </Link>
  );
}

const linkTopo = "text-sm font-medium px-3 py-2 rounded-lg hover:bg-secondary transition-colors";

export default function Layout() {
  const { count } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <Link to="/" aria-label="VizinhoMarket, início" className="inline-block leading-none">
              <Brand size="sm" className="text-[23px] font-bold" />
            </Link>
            <DeliveryTo />
          </div>
          <nav aria-label="Atalhos" className="hidden sm:flex items-center gap-1">
            <NavLink to="/busca" className={linkTopo}>Buscar</NavLink>
            <NavLink to="/meus-pedidos" className={linkTopo}>Meus pedidos</NavLink>
            <NavLink to="/favoritos" className={linkTopo}>Favoritos</NavLink>
            <NavLink to="/perfil" className={linkTopo}>Perfil</NavLink>
            {isAuthenticated ? (
              <button onClick={() => logout(false)} className={`${linkTopo} flex items-center gap-2`}>
                <span className="max-w-[140px] truncate">{user?.full_name || user?.email || "Conta"}</span>
                <LogOut className="w-4 h-4" aria-label="Sair" />
              </button>
            ) : (
              <Link to="/login" className={`${linkTopo} flex items-center gap-1.5 text-marca font-semibold`}>
                <LogIn className="w-4 h-4" aria-hidden="true" /> Entrar
              </Link>
            )}
          </nav>
          <Link to="/carrinho" aria-label={count ? `Sacola, ${count} ${count === 1 ? "item" : "itens"}` : "Sacola"}
            className="relative shrink-0 flex items-center justify-center w-11 h-11 rounded-full bg-card border border-border text-marca hover:bg-secondary transition-colors">
            <ShoppingBag className="w-[21px] h-[21px]" strokeWidth={2} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-[19px] text-center">{count}</span>
            )}
          </Link>
          <MobileMenu />
        </div>
      </header>
      <main className="flex-1 pb-20 sm:pb-0"><Outlet /></main>
      <footer className="border-t border-border mt-10 pb-20 sm:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p><Brand size="sm" className="text-base font-bold" /> · Sidrolândia/MS · versão {APP_VERSION.split(" · ")[0]}</p>
          <div className="flex gap-4">
            <Link to="/termos-uso" className="hover:text-foreground transition-colors">Termos</Link>
            <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
          </div>
        </div>
      </footer>
      <nav aria-label="Menu principal" className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 h-[60px] text-[11px] ${isActive ? "text-marca font-bold" : "text-muted-foreground font-medium"}`}>
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden="true" className="absolute top-0 inset-x-6 h-[3px] rounded-b bg-marca" />}
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
