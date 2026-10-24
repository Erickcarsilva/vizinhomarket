import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu as MenuIcon, Heart, Store, LogOut, LogIn, UserPlus, HelpCircle, MessageCircle, Megaphone } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import Brand from "@/components/layout/Brand";
import { APP_VERSION } from "@/lib/version";
import { URLS } from "@/lib/appConfig";

// Menu ☰ do celular: só o que não está no menu de baixo (conta, ajuda e "venda no VizinhoMarket").
const item = "flex items-center gap-3 min-h-[48px] px-3 rounded-lg hover:bg-secondary transition-colors text-[15px] font-medium";

function Item({ to, icon: Icon, label, onClick }) {
  return (
    <Link to={to} onClick={onClick} className={item}>
      <Icon className="w-5 h-5 text-marca shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

const Group = ({ children }) => <p className="text-[13px] font-semibold text-muted-foreground px-3 pt-5 pb-1">{children}</p>;

export default function MobileMenu() {
  const { isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu"
        className="sm:hidden shrink-0 flex items-center justify-center w-11 h-11 rounded-full hover:bg-secondary transition-colors">
        <MenuIcon className="w-[22px] h-[22px]" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[84%] sm:max-w-sm p-0 flex flex-col bg-background">
          <div className="flex items-center px-5 h-16 border-b border-border shrink-0">
            <SheetTitle asChild><span><Brand size="md" className="font-bold" /></span></SheetTitle>
          </div>
          <nav aria-label="Mais opções" className="flex-1 overflow-y-auto px-2 py-2">
            <Group>Conta</Group>
            {!isAuthenticated ? (
              <>
                <Item to="/login" icon={LogIn} label="Entrar" onClick={close} />
                <Item to="/register" icon={UserPlus} label="Criar conta" onClick={close} />
              </>
            ) : (
              <>
                <Item to="/favoritos" icon={Heart} label="Favoritos" onClick={close} />
                <Item to="/indique-loja" icon={Megaphone} label="Indique uma loja" onClick={close} />
              </>
            )}

            <Group>Ajuda</Group>
            <Item to="/faq" icon={HelpCircle} label="Dúvidas" onClick={close} />
            <Item to="/suporte" icon={MessageCircle} label="Falar com o suporte" onClick={close} />

            <Group>Tem um comércio?</Group>
            <a href={URLS.parceiro} className={item}>
              <Store className="w-5 h-5 text-marca shrink-0" aria-hidden="true" />
              <span>Venda no VizinhoMarket</span>
            </a>

            {isAuthenticated && (
              <button type="button" onClick={() => { close(); logout(false); }} className={`${item} w-full mt-4 text-muted-foreground`}>
                <LogOut className="w-5 h-5" aria-hidden="true" /> Sair da conta
              </button>
            )}
            <p className="px-3 pt-6 pb-3 text-xs text-muted-foreground">Versão {APP_VERSION}</p>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
