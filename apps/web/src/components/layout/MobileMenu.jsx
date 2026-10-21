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
  Package,
  BarChart3,
  Wallet,
  Settings,
  Shield,
  LogOut,
  LogIn,
  UserPlus,
  HelpCircle,
  MessageCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import Brand from "@/components/layout/Brand";
import { APP_VERSION } from "@/lib/version";

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
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  // Detecta se o usuário possui lojas (limit 1 — chamada leve) só quando o
  // menu está aberto, para não carregar dados em todas as páginas.
  const { data: myStores = [] } = useQuery({
    queryKey: ["my-stores", user?.id],
    queryFn: () => base44.entities.Store.filter({ created_by_id: user.id }, "-created_date", 1),
    enabled: !!user && open,
  });
  const hasStores = myStores.length > 0;
  const isAdmin = user?.role === "admin";
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

            {isAuthenticated && hasStores && (
              <>
                <GroupLabel>Minha loja</GroupLabel>
                <NavLink to="/lojista" icon={Store} label="Painel da loja" onClick={close} />
                <NavLink to="/gerenciar-produtos" icon={Package} label="Produtos" onClick={close} />
                <NavLink to="/relatorios" icon={BarChart3} label="Relatórios" onClick={close} />
                <NavLink to="/financeiro" icon={Wallet} label="Comissões" onClick={close} />
                <NavLink to="/editar-perfil" icon={Settings} label="Perfil da loja" onClick={close} />
              </>
            )}

            {isAdmin && (
              <>
                <GroupLabel>Administração</GroupLabel>
                <NavLink to="/admin" icon={Shield} label="Painel administrativo" onClick={close} />
                <NavLink to="/admin?aba=lojas" icon={Store} label="Lojas" onClick={close} />
                <NavLink to="/admin?aba=pedidos" icon={ShoppingBag} label="Todos os pedidos" onClick={close} />
                <NavLink to="/admin?aba=comissoes" icon={Wallet} label="Comissões e faturas" onClick={close} />
              </>
            )}

            {!hasStores && (
              <>
                <GroupLabel>Para comerciantes</GroupLabel>
                <NavLink to="/cadastrar-loja" icon={Store} label="Cadastre sua loja" onClick={close} />
              </>
            )}

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