import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";

// Página pública de exclusão de conta (a Google Play exige um link na web, além da opção no app).
export default function DeleteAccount() {
  const { isAuthenticated, user } = useAuth();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const remove = async () => {
    setBusy(true); setError("");
    try { await base44.account.deleteAccount(); setDone(true); }
    catch (e) { setError(e.message || "Não foi possível excluir agora. Tente de novo."); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto px-5 py-28 text-center">
        <h1 className="font-display text-4xl">Conta excluída</h1>
        <p className="text-muted-foreground mt-3">Seus dados pessoais foram apagados. Obrigado por ter usado o VizinhoMarket.</p>
        <a href="/" className="inline-block mt-8 h-12 leading-[3rem] px-8 rounded-full bg-primary text-primary-foreground font-semibold">Voltar ao início</a>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-5 py-14 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Privacidade</p>
        <h1 className="font-display text-4xl mt-2">Excluir conta do VizinhoMarket</h1>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3 text-sm leading-relaxed">
        <p><strong>O que é apagado:</strong> nome, telefone, e-mail de acesso, endereços salvos e o comentário das suas avaliações.</p>
        <p><strong>O que fica, sem identificar você:</strong> o registro dos pedidos (itens, valores e datas), porque a loja precisa dele para a contabilidade e para obrigações fiscais.</p>
        <p><strong>Antes de excluir:</strong> espere terminar qualquer pedido em andamento. Se você é dono de uma loja, fale com o suporte para encerrar a loja primeiro.</p>
        <p>A exclusão é imediata e não pode ser desfeita.</p>
      </div>

      {!isAuthenticated ? (
        <div className="space-y-3">
          <p className="text-sm">Para excluir, entre na sua conta e volte a esta página (ou vá em <strong>Perfil → Excluir minha conta</strong> no app).</p>
          <Link to="/login?returnTo=/excluir-conta" className="inline-block h-12 leading-[3rem] px-8 rounded-full bg-primary text-primary-foreground font-semibold">Entrar para excluir</Link>
        </div>
      ) : (
        <div className="border border-destructive/40 rounded-2xl p-6 space-y-4">
          <p className="text-sm">Você está conectado como <strong>{user?.email}</strong>. Para confirmar, digite <strong>EXCLUIR</strong> abaixo.</p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="EXCLUIR" className="h-12 max-w-xs" autoCapitalize="characters" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button onClick={remove} disabled={busy || typed.trim().toUpperCase() !== "EXCLUIR"}
            className="h-12 px-8 rounded-full bg-destructive text-destructive-foreground font-semibold flex items-center gap-2 disabled:opacity-40">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Excluir minha conta
          </button>
        </div>
      )}
    </div>
  );
}
