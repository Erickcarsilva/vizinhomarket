import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { queryClientInstance } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import ScrollToTop from "@/components/ScrollToTop";

// Estrutura comum aos três produtos: login, cache de dados, rotas e avisos.
function AuthGate({ children }) {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (authError?.type === "not_configured") {
    return (
      <div className="max-w-md mx-auto px-5 py-32 text-center space-y-3">
        <h1 className="font-display text-3xl">Quase lá</h1>
        <p className="text-muted-foreground">Falta ligar ao banco de dados. Crie o arquivo <code>.env.local</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>).</p>
      </div>
    );
  }
  if (authError?.type === "user_not_registered") return <UserNotRegisteredError />;
  if (authError?.type === "auth_required") { navigateToLogin(); return null; }
  return children;
}

export default function AppShell({ children, wrap: Wrap = React.Fragment }) {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Wrap>
            <AuthGate>{children}</AuthGate>
          </Wrap>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
