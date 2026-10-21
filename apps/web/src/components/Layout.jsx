import { APP_VERSION } from "@/lib/version";
import React from "react";
import { Link, Outlet } from "react-router-dom";
import { ShoppingBag, LogIn, LogOut, Search } from "lucide-react";
import { useCart } from "@/lib/CartContext";
import { useAuth } from "@/lib/AuthContext";
import Brand from "@/components/layout/Brand";
import MobileMenu from "@/components/layout/MobileMenu";

export default function Layout() {
  const { count } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-2">
            <Brand />
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Sidrolândia</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/busca" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary transition-colors" aria-label="Buscar">
              <Search className="w-4 h-4" />
            </Link>
            <Link to="/meus-pedidos" className="hidden sm:inline-block text-sm font-medium px-3 py-2 rounded-full hover:bg-secondary transition-colors">
              Meus pedidos
            </Link>
            <Link to="/perfil" className="hidden sm:inline-block text-sm font-medium px-3 py-2 rounded-full hover:bg-secondary transition-colors">
              Perfil
            </Link>
            <Link to="/favoritos" className="hidden sm:inline-block text-sm font-medium px-3 py-2 rounded-full hover:bg-secondary transition-colors">
              Favoritos
            </Link>
            {isAuthenticated ? (
              <button onClick={() => logout(false)} className="hidden sm:flex items-center gap-2 h-10 px-4 rounded-full border border-border text-sm font-medium hover:bg-secondary transition-colors">
                <span className="max-w-[120px] truncate">{user?.full_name || user?.email || "Conta"}</span>
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <Link to="/login" className="hidden sm:flex items-center gap-2 h-10 px-4 rounded-full border border-border text-sm font-medium hover:bg-secondary transition-colors">
                <LogIn className="w-4 h-4" />
                <span>Entrar</span>
              </Link>
            )}
            <Link to="/carrinho" className="flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              <ShoppingBag className="w-4 h-4" />
              {count > 0 && <span>{count}</span>}
            </Link>
            <MobileMenu />
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p><Brand size="sm" className="text-foreground" /> · Sidrolândia/MS <span className="opacity-60">· v. {APP_VERSION.split(" · ")[0]}</span></p>
          <div className="flex gap-4">
            <Link to="/termos-uso" className="hover:text-foreground transition-colors">Termos</Link>
            <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}