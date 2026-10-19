import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
  </div>
);

const AccessDenied = () => (
  <div className="max-w-md mx-auto px-5 py-32 text-center">
    <h1 className="font-display text-3xl">Acesso restrito</h1>
    <p className="text-muted-foreground mt-3">Você não tem permissão para acessar esta página.</p>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement, allowedRoles }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, user } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  if (allowedRoles && (!user?.role || !allowedRoles.includes(user.role))) {
    return <AccessDenied />;
  }

  return <Outlet />;
}