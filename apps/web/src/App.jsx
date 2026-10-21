import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import { CartProvider } from '@/lib/CartContext';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import StorePage from '@/pages/StorePage';
import Checkout from '@/pages/Checkout';
import OrderTracking from '@/pages/OrderTracking';
import MyOrders from '@/pages/MyOrders';
import Partner from '@/pages/Partner';
import Admin from '@/pages/Admin';
import RegisterStore from '@/pages/RegisterStore';
import Driver from '@/pages/Driver';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import DeleteAccount from '@/pages/DeleteAccount';
import Reports from '@/pages/Reports';
import ManageProducts from '@/pages/ManageProducts';
import Profile from '@/pages/Profile';
import EditStoreProfile from '@/pages/EditStoreProfile';
import Support from '@/pages/Support';
import Finance from '@/pages/Finance';
import Vitrine from '@/pages/Vitrine';
import Favoritos from '@/pages/Favoritos';
import Sobre from '@/pages/Sobre';
import Categorias from '@/pages/Categorias';
import Faq from '@/pages/Faq';
import IndiqueLoja from '@/pages/IndiqueLoja';
import Busca from '@/pages/Busca';
import Avaliacoes from '@/pages/Avaliacoes';
import Notificacoes from '@/pages/Notificacoes';
import AdminDashboard from '@/pages/AdminDashboard';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'not_configured') {
    return (
      <div className="max-w-md mx-auto px-5 py-32 text-center space-y-3">
        <h1 className="font-display text-3xl">Quase lá</h1>
        <p className="text-muted-foreground">Falta ligar o app ao banco de dados. Crie o arquivo <code>.env.local</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>).</p>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
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
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/excluir-conta" element={<DeleteAccount />} />
        <Route path="/suporte" element={<Support />} />
        <Route path="/vitrine" element={<Vitrine />} />
        <Route path="/sobre" element={<Sobre />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/busca" element={<Busca />} />
        <Route path="/termos-uso" element={<Terms />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/meus-pedidos" element={<MyOrders />} />
          <Route path="/cadastrar-loja" element={<RegisterStore />} />
          <Route path="/lojista" element={<Partner />} />
          <Route path="/entregador" element={<Navigate to="/entregador-dashboard" replace />} />
          <Route path="/assinatura" element={<Navigate to="/financeiro" replace />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/gerenciar-produtos" element={<ManageProducts />} />
          <Route path="/configuracoes-loja" element={<Navigate to="/editar-perfil" replace />} />
          <Route path="/editar-perfil" element={<EditStoreProfile />} />
          <Route path="/financeiro" element={<Finance />} />
          <Route path="/meus-enderecos" element={<Navigate to="/perfil" replace />} />
          <Route path="/favoritos" element={<Favoritos />} />
          <Route path="/avaliacoes" element={<Avaliacoes />} />
          <Route path="/configuracoes-notificacoes" element={<Notificacoes />} />
          <Route path="/assinatura-detalhes" element={<Navigate to="/financeiro" replace />} />
          <Route path="/minha-conta" element={<Navigate to="/perfil" replace />} />
          <Route path="/indique-loja" element={<IndiqueLoja />} />
          <Route path="/historico-pedidos" element={<Navigate to="/meus-pedidos" replace />} />
          <Route path="/entregador-dashboard" element={<Driver />} />
          <Route path="/perfil" element={<Profile />} />
        </Route>
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} allowedRoles={["admin"]} />}>
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <CartProvider>
            <AuthenticatedApp />
          </CartProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App