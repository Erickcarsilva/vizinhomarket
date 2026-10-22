import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Equipe da loja: o dono convida atendentes (pessoas que já têm conta no app) pelo e-mail.
export default function Equipe() {
  const { store } = useOutletContext();
  const qc = useQueryClient();
  const { data: members = [], isLoading, error: loadError } = useQuery({ queryKey: ["members", store?.id], queryFn: () => base44.partner.members(store.id), enabled: !!store });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!store) return null;

  const run = async (key, fn, okText) => {
    setBusy(key); setMsg(null);
    try { await fn(); await qc.invalidateQueries({ queryKey: ["members", store.id] }); setMsg({ ok: true, text: okText }); }
    catch (err) { setMsg({ ok: false, text: err?.message || "Não foi possível concluir." }); }
    finally { setBusy(null); }
  };
  const invite = (e) => {
    e.preventDefault();
    const clean = email.trim();
    run("add", async () => { await base44.partner.addStaff(store.id, clean); setEmail(""); }, `${clean} agora é atendente da loja.`);
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Equipe</p>
        <h1 className="font-display text-4xl mt-2">Quem usa o painel</h1>
        <p className="text-sm text-muted-foreground mt-2">O atendente recebe os pedidos (com o alarme), cuida das entregas e do cardápio. Ele não vê comissões, faturas e relatórios, e não muda os dados da loja, as taxas nem a chave Pix.</p>
      </div>

      <form onSubmit={invite} className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <p className="font-semibold">Convidar atendente</p>
        <p className="text-xs text-muted-foreground">A pessoa precisa ter criado a conta no app antes. Depois ela entra neste painel com o próprio e-mail e senha.</p>
        <div className="flex flex-wrap gap-2">
          <input type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} placeholder="e-mail do atendente" className="flex-1 min-w-[220px] h-11 px-4 rounded-xl border border-border bg-background" />
          <button disabled={busy === "add" || !email.trim()} className="h-11 px-5 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50">
            {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Convidar
          </button>
        </div>
      </form>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {loadError && <p className="p-6 text-sm text-destructive">{loadError.message}</p>}
        {members.map((m) => (
          <div key={m.user_id} className="p-4 flex items-center gap-3" data-member={m.email}>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{m.full_name || m.email}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email} · {m.role === "owner" ? "Dono" : "Atendente"}</p>
            </div>
            {m.role !== "owner" && (
              <button type="button" disabled={busy === m.user_id} onClick={() => window.confirm(`Tirar ${m.email} da equipe?`) && run(m.user_id, () => base44.partner.removeStaff(store.id, m.user_id), `${m.email} saiu da equipe.`)}
                className="h-9 px-3 rounded-full border border-border text-sm flex items-center gap-1.5 hover:bg-secondary disabled:opacity-50" aria-label={`Remover ${m.email}`}>
                <Trash2 className="w-4 h-4" /> Remover
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
