import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
  </div>
);

// Exige login; se não tiver, vai para /login e volta depois.
export function RequireLogin() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const loc = useLocation();
  if (isLoadingAuth) return <Spinner />;
  if (!isAuthenticated) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}

// Exige papel de administrador.
export function RequireAdmin() {
  const { user, isAuthenticated, isLoadingAuth, logout } = useAuth();
  const loc = useLocation();
  if (isLoadingAuth) return <Spinner />;
  if (!isAuthenticated) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-display text-3xl">Acesso restrito</h1>
          <p className="text-muted-foreground">A conta <strong>{user?.email}</strong> não tem acesso ao painel administrativo.</p>
          <button onClick={() => logout(false)} className="h-11 px-6 rounded-full border border-border font-semibold">Entrar com outra conta</button>
        </div>
      </div>
    );
  }
  return <Outlet />;
}
