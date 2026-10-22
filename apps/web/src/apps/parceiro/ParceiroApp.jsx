import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import AppShell from "@/apps/shared/AppShell";
import { RequireLogin } from "@/apps/shared/Guards";
import PageNotFound from "@/lib/PageNotFound";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import RegisterStore from "@/pages/RegisterStore";
import Reports from "@/pages/Reports";
import EditStoreProfile from "@/pages/EditStoreProfile";
import Notificacoes from "@/pages/Notificacoes";
import ParceiroLayout from "./ParceiroLayout";
import Pedidos from "./pages/Pedidos";
import Entregas from "./pages/Entregas";
import Historico from "./pages/Historico";
import Cardapio from "./pages/Cardapio";
import Financeiro from "./pages/Financeiro";
import Loja from "./pages/Loja";
import Equipe from "./pages/Equipe";

// Painel do Comerciante (site): pedidos, entregas, cardápio, comissões e dados da loja.
export default function ParceiroApp() {
  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/termos-uso" element={<div className="max-w-3xl mx-auto"><Terms /></div>} />
        <Route path="/privacidade" element={<div className="max-w-3xl mx-auto"><Privacy /></div>} />
        <Route element={<RequireLogin />}>
          <Route element={<ParceiroLayout />}>
            <Route path="/" element={<Pedidos />} />
            <Route path="/entregas" element={<Entregas />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/cardapio" element={<Cardapio />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/loja" element={<Loja />} />
            <Route path="/loja/aparencia" element={<EditStoreProfile />} />
            <Route path="/equipe" element={<Equipe />} />
            <Route path="/alertas" element={<Notificacoes />} />
            <Route path="/cadastrar-loja" element={<RegisterStore />} />
            {/* endereços antigos */}
            <Route path="/lojista" element={<Navigate to="/" replace />} />
            <Route path="/gerenciar-produtos" element={<Navigate to="/cardapio" replace />} />
            <Route path="/editar-perfil" element={<Navigate to="/loja/aparencia" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AppShell>
  );
}
