import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import AppShell from "@/apps/shared/AppShell";
import { RequireLogin } from "@/apps/shared/Guards";
import { CartProvider } from "@/lib/CartContext";
import NaoEncontrada from "@/pages/NaoEncontrada";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Home from "@/pages/Home";
import StorePage from "@/pages/StorePage";
import Checkout from "@/pages/Checkout";
import OrderTracking from "@/pages/OrderTracking";
import MyOrders from "@/pages/MyOrders";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import DeleteAccount from "@/pages/DeleteAccount";
import Profile from "@/pages/Profile";
import Support from "@/pages/Support";
import Vitrine from "@/pages/Vitrine";
import Favoritos from "@/pages/Favoritos";
import Sobre from "@/pages/Sobre";
import Categorias from "@/pages/Categorias";
import Faq from "@/pages/Faq";
import IndiqueLoja from "@/pages/IndiqueLoja";
import Busca from "@/pages/Busca";
import Avaliacoes from "@/pages/Avaliacoes";
import { URLS } from "@/lib/appConfig";
// Letras do App do Cliente servidas pelo próprio site (só entram no build do cliente).
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "@fontsource/lora/latin-500.css";
import "@fontsource/lora/latin-600.css";
import "@fontsource/lora/latin-700.css";

// Endereços antigos de lojista/admin agora moram nos painéis próprios.
const GoTo = ({ href }) => { window.location.replace(href); return null; };

// App do Cliente: comprar, acompanhar pedidos e conta.
export default function ClienteApp() {
  return (
    <AppShell wrap={CartProvider}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/loja/:id" element={<StorePage />} />
          <Route path="/carrinho" element={<Checkout />} />
          <Route path="/pedido/:id" element={<OrderTracking />} />
          <Route path="/termos" element={<Navigate to="/termos-uso" replace />} />
          <Route path="/termos-uso" element={<Terms />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/excluir-conta" element={<DeleteAccount />} />
          <Route path="/suporte" element={<Support />} />
          <Route path="/vitrine" element={<Vitrine />} />
          <Route path="/sobre" element={<Sobre />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/busca" element={<Busca />} />
          <Route element={<RequireLogin />}>
            <Route path="/meus-pedidos" element={<MyOrders />} />
            <Route path="/historico-pedidos" element={<Navigate to="/meus-pedidos" replace />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/minha-conta" element={<Navigate to="/perfil" replace />} />
            <Route path="/meus-enderecos" element={<Navigate to="/perfil" replace />} />
            <Route path="/favoritos" element={<Favoritos />} />
            <Route path="/avaliacoes" element={<Avaliacoes />} />
            <Route path="/indique-loja" element={<IndiqueLoja />} />
          </Route>
          {["/lojista", "/cadastrar-loja", "/gerenciar-produtos", "/financeiro", "/relatorios", "/editar-perfil"].map((p) => (
            <Route key={p} path={p} element={<GoTo href={URLS.parceiro} />} />
          ))}
          {["/admin", "/admin-dashboard"].map((p) => <Route key={p} path={p} element={<GoTo href={URLS.admin} />} />)}
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Routes>
    </AppShell>
  );
}
