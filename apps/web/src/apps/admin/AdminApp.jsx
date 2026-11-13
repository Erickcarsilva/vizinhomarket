import React from "react";
import { Route, Routes, useNavigate, useLocation } from "react-router-dom";
import AppShell from "@/apps/shared/AppShell";
import { RequireAdmin } from "@/apps/shared/Guards";
import PageNotFound from "@/lib/PageNotFound";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminLayout, { ADMIN_NAV, allowedPaths } from "./AdminLayout";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import CitiesAdmin from "@/components/admin/panel/CitiesAdmin";
import StaffAdmin from "@/components/admin/panel/StaffAdmin";
import Overview from "@/components/admin/panel/Overview";
import StoresAdmin from "@/components/admin/panel/StoresAdmin";
import OrdersAdmin from "@/components/admin/panel/OrdersAdmin";
import UsersAdmin from "@/components/admin/panel/UsersAdmin";
import CouriersAdmin from "@/components/admin/panel/CouriersAdmin";
import InvoicesAdmin from "@/components/admin/panel/InvoicesAdmin";
import SettingsAdmin from "@/components/admin/panel/SettingsAdmin";
import LogsAdmin from "@/components/admin/panel/LogsAdmin";
import FinanceAdmin from "@/components/admin/panel/FinanceAdmin";
import RefundsAdmin from "@/components/admin/panel/RefundsAdmin";
import SupportAdmin from "@/components/admin/panel/SupportAdmin";
import CouponsAdmin from "@/components/admin/panel/CouponsAdmin";
import DeliveriesAdmin from "@/components/admin/panel/DeliveriesAdmin";
import CategoriesAdmin from "@/components/admin/panel/CategoriesAdmin";

const TAB_PATH = { visao: "/", lojas: "/lojas", pedidos: "/pedidos", usuarios: "/usuarios", entregadores: "/entregadores", comissoes: "/comissoes", config: "/config", registros: "/registros", reembolsos: "/reembolsos", atendimento: "/atendimento", entregas: "/entregas", financeiro: "/financeiro" };

function Page({ children }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const allowed = allowedPaths(user);
  // Equipe por área: fora da sua área, vai para a primeira tela permitida.
  if (allowed && !allowed.includes(pathname)) return <Navigate to={allowed[0] || "/login"} replace />;
  const title = (ADMIN_NAV.find(([to]) => to === pathname) || [null, "Painel"])[1];
  return (
    <div className="max-w-6xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Administração</p>
        <h1 className="font-display text-4xl mt-2">{title}</h1>
      </div>
      {children}
    </div>
  );
}

function OverviewPage() {
  const navigate = useNavigate();
  return <Page><Overview goTo={(tab) => navigate(TAB_PATH[tab] || "/")} /></Page>;
}

// Painel Admin (site): só para contas com papel de administrador. Não tem cadastro aberto.
export default function AdminApp() {
  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<RequireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/lojas" element={<Page><StoresAdmin /></Page>} />
            <Route path="/pedidos" element={<Page><OrdersAdmin /></Page>} />
            <Route path="/usuarios" element={<Page><UsersAdmin /></Page>} />
            <Route path="/entregadores" element={<Page><CouriersAdmin /></Page>} />
            <Route path="/comissoes" element={<Page><InvoicesAdmin /></Page>} />
            <Route path="/entregas" element={<Page><DeliveriesAdmin /></Page>} />
            <Route path="/financeiro" element={<Page><FinanceAdmin /></Page>} />
            <Route path="/reembolsos" element={<Page><RefundsAdmin /></Page>} />
            <Route path="/atendimento" element={<Page><SupportAdmin /></Page>} />
            <Route path="/cupons" element={<Page><CouponsAdmin /></Page>} />
            <Route path="/categorias" element={<Page><CategoriesAdmin /></Page>} />
            <Route path="/cidades" element={<Page><CitiesAdmin /></Page>} />
            <Route path="/equipe" element={<Page><StaffAdmin /></Page>} />
            <Route path="/config" element={<Page><SettingsAdmin /></Page>} />
            <Route path="/registros" element={<Page><LogsAdmin /></Page>} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AppShell>
  );
}
