import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  // O link do e-mail volta com a sessão de recuperação no endereço (#access_token=...); o Supabase a lê sozinho.
  // "checking" enquanto confere, "ok" com sessão válida, "invalid" para link vencido/usado.
  const [link, setLink] = useState(() => (/error_code=|error=/.test(window.location.hash) ? "invalid" : "checking"));
  useEffect(() => {
    if (link === "invalid") return undefined;
    let done = false;
    const ok = () => { if (!done) { done = true; setLink("ok"); } };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) ok();
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) ok(); });
    const t = setTimeout(() => { if (!done) setLink("invalid"); }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      if (newPassword.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres");
      await base44.auth.resetPassword({ newPassword });
      window.history.replaceState(null, "", "/reset-password");
      window.location.href = "/"; // já entra logado com a senha nova
    } catch (err) {
      setError(err.message || "Falha ao redefinir a senha");
    } finally {
      setLoading(false);
    }
  };

  if (link === "checking") {
    return (
      <AuthLayout icon={Loader2} title="Conferindo o link" subtitle="Só um instante…">
        <p className="text-sm text-muted-foreground text-center">Abrindo a troca de senha.</p>
      </AuthLayout>
    );
  }

  if (link === "invalid") {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Link inválido"
        subtitle="Este link venceu ou já foi usado"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Solicitar um novo link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Cada link vale uma vez e por pouco tempo. Peça um novo e use o último e-mail que chegar. Se aparecer "aguarde", espere um minuto antes de pedir de novo.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="Nova senha"
      subtitle="Digite sua nova senha abaixo"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Redefinindo...
            </>
          ) : (
            "Redefinir senha"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}