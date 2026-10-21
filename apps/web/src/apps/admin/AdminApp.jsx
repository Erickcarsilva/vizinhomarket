import React from "react";
import { Route, Routes, useNavigate, useLocation } from "react-router-dom";
import AppShell from "@/apps/shared/AppShell";
import { RequireAdmin } from "@/apps/shared/Guards";
import PageNotFound from "@/lib/PageNotFound";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminLayout, { ADMIN_NAV } from "./AdminLayout";
import Overview from "@/components/admin/panel/Overview";
import StoresAdmin from "@/components/admin/panel/StoresAdmin";
import OrdersAdmin from "@/components/admin/panel/OrdersAdmin";
import UsersAdmin from "@/components/admin/panel/UsersAdmin";
import CouriersAdmin from "@/components/admin/panel/CouriersAdmin";
import InvoicesAdmin from "@/components/admin/panel/InvoicesAdmin";
import SettingsAdmin from "@/components/admin/panel/SettingsAdmin";
import LogsAdmin from "@/components/admin/panel/LogsAdmin";

const TAB_PATH = { visao: "/", lojas: "/lojas", pedidos: "/pedidos", usuarios: "/usuarios", entregadores: "/entregadores", comissoes: "/comissoes", config: "/config", registros: "/registros" };

function Page({ children }) {
  const { pathname } = useLocation();
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
            <Route path="/config" element={<Page><SettingsAdmin /></Page>} />
            <Route path="/registros" element={<Page><LogsAdmin /></Page>} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AppShell>
  );
}
