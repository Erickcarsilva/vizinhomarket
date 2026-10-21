import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  LayoutGrid,
  Search,
  ShoppingBag,
  Heart,
  User as UserIcon,
  Store,
  LogOut,
  LogIn,
  UserPlus,
  HelpCircle,
  MessageCircle,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import Brand from "@/components/layout/Brand";
import { APP_VERSION } from "@/lib/version";
import { URLS } from "@/lib/appConfig";

function NavLink({ to, icon: Icon, label, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 min-h-[44px] px-2 py-2 rounded-xl hover:bg-secondary transition-colors text-[15px] font-medium"
    >
      <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function GroupLabel({ children }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold px-2 pt-4 pb-1">
      {children}
    </p>
  );
}

export default function MobileMenu() {
  const { isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        className="sm:hidden flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary transition-colors"
      >
        <MenuIcon className="w-5 h-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[82%] sm:max-w-sm p-0 flex flex-col">
          <div className="flex items-center justify-between px-5 h-16 border-b border-border shrink-0">
            <Brand size="md" />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <GroupLabel>Navegação</GroupLabel>
            <NavLink to="/" icon={HomeIcon} label="Início" onClick={close} />
            <NavLink to="/busca" icon={Search} label="Buscar" onClick={close} />
            <NavLink to="/categorias" icon={LayoutGrid} label="Categorias" onClick={close} />

            {!isAuthenticated ? (
              <>
                <GroupLabel>Conta</GroupLabel>
                <NavLink to="/login" icon={LogIn} label="Entrar" onClick={close} />
                <NavLink to="/register" icon={UserPlus} label="Criar conta" onClick={close} />
              </>
            ) : (
              <>
                <GroupLabel>Minha conta</GroupLabel>
                <NavLink to="/meus-pedidos" icon={ShoppingBag} label="Meus pedidos" onClick={close} />
                <NavLink to="/favoritos" icon={Heart} label="Favoritos" onClick={close} />
                <NavLink to="/perfil" icon={UserIcon} label="Perfil" onClick={close} />
                <NavLink to="/indique-loja" icon={Store} label="Indique uma loja" onClick={close} />
              </>
            )}

            <GroupLabel>Para comerciantes</GroupLabel>
            <a href={URLS.parceiro} className="flex items-center gap-3 min-h-[44px] px-2 py-2 rounded-xl hover:bg-secondary transition-colors text-[15px] font-medium">
              <Store className="w-5 h-5 text-muted-foreground shrink-0" />
              <span>Venda no VizinhoMarket</span>
            </a>

            <GroupLabel>Ajuda</GroupLabel>
            <NavLink to="/faq" icon={HelpCircle} label="Dúvidas" onClick={close} />
            <NavLink to="/suporte" icon={MessageCircle} label="Suporte" onClick={close} />

            {isAuthenticated && (
              <div className="pt-4 px-2">
                <button
                  onClick={() => {
                    close();
                    logout(false);
                  }}
                  className="w-full flex items-center gap-3 min-h-[44px] px-2 py-2 rounded-xl hover:bg-secondary transition-colors text-[15px] font-medium text-muted-foreground"
                >
                  <LogOut className="w-5 h-5" /> Sair da conta
                </button>
              </div>
            )}
            <p className="px-2 pt-6 pb-2 text-[11px] text-muted-foreground">Versão {APP_VERSION}</p>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}