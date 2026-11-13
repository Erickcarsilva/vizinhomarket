import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { TICKET_STATUS } from "@/components/services/Tickets";

const WHO = { customer: "Você", partner: "Loja", courier: "Entregador", admin: "Equipe VizinhoMarket", system: "" };

export default function Atendimento() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: t, isLoading } = useQuery({ queryKey: ["ticket", id], queryFn: () => base44.support.ticket(id), refetchInterval: 30000 });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const send = async (e) => {
    e.preventDefault(); setError("");
    try { await base44.support.reply(id, text); setText(""); qc.invalidateQueries({ queryKey: ["ticket", id] }); } catch (err) { setError(err.message); }
  };
  if (isLoading) return <div className="max-w-3xl mx-auto px-4 pt-6"><div className="h-24 rounded-lg bg-secondary animate-pulse" /></div>;
  if (!t) return <div className="max-w-md mx-auto px-4 py-20 text-center"><h1 className="font-display text-2xl text-marca">Atendimento não encontrado</h1></div>;
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-4">
      <Link to="/suporte" className="inline-flex items-center gap-1 text-sm font-semibold text-marca"><ChevronLeft className="w-4 h-4" aria-hidden="true" />Ajuda</Link>
      <div>
        <p className="text-[13px] text-muted-foreground">{TICKET_STATUS[t.status]}{t.order?.code ? ` · pedido ${t.order.code}` : ""}</p>
        <h1 className="font-display text-2xl text-marca">{t.subject}</h1>
      </div>
      <div className="space-y-2">
        {t.messages.map((m) => (
          <div key={m.id} className={`rounded-lg p-3 text-[15px] ${m.author_kind === "admin" ? "bg-[#E3EFE6]" : "bg-card border border-border"}`}>
            <p className="text-[12px] font-semibold text-muted-foreground">{WHO[m.author_kind]} · {new Date(m.created_at).toLocaleString("pt-BR")}</p>
            <p className="whitespace-pre-wrap break-words mt-1">{m.body}</p>
          </div>
        ))}
      </div>
      {t.status !== "closed" && (
        <form onSubmit={send} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} placeholder="Responder" aria-label="Responder" className="flex-1 h-11 rounded-lg border border-input bg-card px-3" />
          <button className="btn-acao h-11 px-4" disabled={!text.trim()} aria-label="Enviar"><Send className="w-4 h-4" /></button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
