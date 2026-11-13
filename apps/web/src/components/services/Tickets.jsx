import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

export const TICKET_STATUS = { open: "Aberto", waiting_customer: "Aguardando você", waiting_store: "Aguardando a loja", resolved: "Resolvido", closed: "Encerrado" };
const KINDS = [["support", "Dúvida"], ["delivery", "Entrega"], ["dispute", "Problema com loja"], ["account", "Minha conta"], ["other", "Outro"]];

// Atendimentos do usuário logado: abre um novo e lista os anteriores.
export default function Tickets() {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["my-tickets"], queryFn: () => base44.support.myTickets() });
  const [f, setF] = useState({ kind: "support", subject: "", message: "" });
  const [state, setState] = useState({ busy: false, error: "", ok: false });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: "", ok: false });
    try { await base44.support.open(f.kind, f.subject, f.message); setF({ kind: "support", subject: "", message: "" }); setState({ busy: false, error: "", ok: true }); qc.invalidateQueries({ queryKey: ["my-tickets"] }); }
    catch (err) { setState({ busy: false, error: err.message, ok: false }); }
  };
  return (
    <section className="space-y-4" aria-label="Meus atendimentos">
      <h2 className="font-display text-xl text-marca">Fale com a equipe</h2>
      <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 space-y-3">
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Assunto" className="w-full h-11 rounded-lg border border-input bg-background px-3">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value.slice(0, 120) })} placeholder="Resumo em poucas palavras" aria-label="Resumo" className="w-full h-11 rounded-lg border border-input bg-background px-3" />
        <textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value.slice(0, 2000) })} rows={3} placeholder="Conte o que aconteceu. Se for sobre um pedido, abra pela tela do pedido." aria-label="Mensagem" className="w-full rounded-lg border border-input bg-background p-3" />
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-[#1F6B47]">Recebemos sua mensagem. A resposta aparece aqui.</p>}
        <button className="btn-acao h-11" disabled={state.busy || f.subject.trim().length < 3 || !f.message.trim()}>{state.busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Enviar</button>
      </form>
      {isLoading ? null : list.length > 0 && (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {list.map((t) => (
            <Link key={t.id} to={`/atendimento/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/50">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{t.subject}</span>
                <span className="block text-[13px] text-muted-foreground">{TICKET_STATUS[t.status]} · {new Date(t.updated_at).toLocaleDateString("pt-BR")}{t.order?.code ? ` · ${t.order.code}` : ""}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
