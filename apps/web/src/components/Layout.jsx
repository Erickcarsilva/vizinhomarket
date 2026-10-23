import { APP_VERSION } from "@/lib/version";
import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ShoppingBag, LogIn, LogOut, Search, Home, ReceiptText, User } from "lucide-react";
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

export default function Layout() {
  const { count } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-2">
            <Brand size="sm" />
            <span className="hidden sm:inline text-xs text-muted-foreground">Sidrolândia</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/busca" className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary transition-colors" aria-label="Buscar">
              <Search className="w-4 h-4" />
            </Link>
            <Link to="/meus-pedidos" className="hidden sm:inline-block text-sm font-medium px-3 py-2 rounded-md hover:bg-secondary transition-colors">Meus pedidos</Link>
            <Link to="/favoritos" className="hidden sm:inline-block text-sm font-medium px-3 py-2 rounded-md hover:bg-secondary transition-colors">Favoritos</Link>
            <Link to="/perfil" className="hidden sm:inline-block text-sm font-medium px-3 py-2 rounded-md hover:bg-secondary transition-colors">Perfil</Link>
            {isAuthenticated ? (
              <button onClick={() => logout(false)} className="hidden sm:flex items-center gap-2 h-10 px-3 rounded-md text-sm font-medium hover:bg-secondary transition-colors">
                <span className="max-w-[120px] truncate">{user?.full_name || user?.email || "Conta"}</span>
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <Link to="/login" className="flex items-center gap-1.5 h-10 px-3 rounded-md text-sm font-semibold text-primary hover:bg-secondary transition-colors">
                <LogIn className="w-4 h-4" />
                <span>Entrar</span>
              </Link>
            )}
            <Link to="/carrinho" aria-label="Sacola" className="relative flex items-center justify-center w-10 h-10 rounded-full text-primary hover:bg-secondary transition-colors">
              <ShoppingBag className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-[18px] text-center">{count}</span>
              )}
            </Link>
            <MobileMenu />
          </nav>
        </div>
      </header>
      <main className="flex-1 pb-20 sm:pb-0"><Outlet /></main>
      <footer className="border-t border-border mt-10 pb-20 sm:pb-0">
        <div className="max-w-6xl mx-auto px-5 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p><Brand size="sm" className="text-base" /> · Sidrolândia/MS <span className="opacity-70">· v. {APP_VERSION.split(" · ")[0]}</span></p>
          <div className="flex gap-4">
            <Link to="/termos-uso" className="hover:text-foreground transition-colors">Termos</Link>
            <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
          </div>
        </div>
      </footer>
      <nav aria-label="Menu principal" className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] ${isActive ? "text-foreground font-bold" : "text-muted-foreground"}`}>
            {({ isActive }) => (<><Icon className={`w-[22px] h-[22px] ${isActive ? "text-primary" : ""}`} strokeWidth={isActive ? 2.4 : 2} />{label}</>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
