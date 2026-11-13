import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Send, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

export const SERVICE_STATUS = {
  REQUESTED: "Aguardando proposta", QUOTED: "Proposta recebida", ACCEPTED: "Proposta aceita", SCHEDULED: "Agendado",
  COMPLETED: "Concluído", DECLINED: "Recusado pelo prestador", CANCELLED: "Cancelado", EXPIRED: "Proposta vencida",
};
const when = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Pedido de orçamento do cliente: proposta, aceite, agenda, conversa e avaliação.
export default function Orcamento() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: r, isLoading } = useQuery({ queryKey: ["service", id], queryFn: () => base44.services.get(id), refetchInterval: 20000 });
  const { data: msgs = [] } = useQuery({ queryKey: ["service-msgs", id], queryFn: () => base44.services.messages(id), refetchInterval: 15000 });
  const [text, setText] = useState("");
  const [state, setState] = useState({ busy: "", error: "" });
  const [stars, setStars] = useState(0);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["service", id] }), qc.invalidateQueries({ queryKey: ["service-msgs", id] })]);
  const act = async (key, fn) => {
    setState({ busy: key, error: "" });
    try { await fn(); await refresh(); setState({ busy: "", error: "" }); } catch (e) { setState({ busy: "", error: e.message }); }
  };

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 pt-6"><div className="h-32 rounded-lg bg-secondary animate-pulse" /></div>;
  if (!r) return <div className="max-w-md mx-auto px-4 py-20 text-center"><h1 className="font-display text-2xl text-marca">Pedido não encontrado</h1><Link to="/meus-pedidos" className="btn-contorno mt-4">Meus pedidos</Link></div>;
  const closed = ["CANCELLED", "DECLINED", "EXPIRED"].includes(r.status);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-5">
      <Link to="/meus-pedidos" className="inline-flex items-center gap-1 text-sm font-semibold text-marca"><ChevronLeft className="w-4 h-4" aria-hidden="true" />Meus pedidos</Link>
      <div>
        <p className="text-[13px] text-muted-foreground">Orçamento {r.code} · {r.store?.name}{r.offering?.name ? ` · ${r.offering.name}` : ""}</p>
        <h1 className="font-display text-[28px] text-marca leading-tight mt-1" aria-live="polite">{SERVICE_STATUS[r.status]}</h1>
        {r.cancel_reason && closed && <p className="text-[15px] mt-1">Motivo: {r.cancel_reason}</p>}
      </div>

      {r.quote_amount && (
        <div className={`rounded-lg p-4 space-y-2 ${r.status === "QUOTED" ? "border-2 border-marca bg-card" : "border border-border bg-card"}`}>
          <p className="text-sm text-muted-foreground">Proposta do prestador</p>
          <p className="font-display text-[34px] leading-none">{brl(r.quote_amount)}</p>
          {r.quote_notes && <p className="text-[15px]">{r.quote_notes}</p>}
          {r.status === "QUOTED" && (
            <>
              <p className="text-[13px] text-muted-foreground">Válida até {when(r.quote_valid_until)}. Pagamento combinado direto com o prestador.</p>
              <div className="flex gap-2">
                <button type="button" className="btn-acao h-12 flex-1" disabled={!!state.busy} onClick={() => act("accept", () => base44.services.accept(id))}>
                  {state.busy === "accept" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Aceitar proposta
                </button>
                <button type="button" className="btn-contorno h-12" disabled={!!state.busy} onClick={() => { const why = window.prompt("Por que você não quer seguir?"); if (why) act("cancel", () => base44.services.cancel(id, why)); }}>Recusar</button>
              </div>
            </>
          )}
          {r.scheduled_at && <p className="text-[15px] font-semibold">Agendado para {when(r.scheduled_at)}</p>}
        </div>
      )}
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}

      {r.status === "COMPLETED" && !r.rating && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-[15px] font-semibold">Como foi o serviço?</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Nota">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} estrela(s)`} onClick={() => setStars(n)}>
                <Star className={`w-8 h-8 ${n <= stars ? "fill-[#C8892B] text-[#C8892B]" : "text-input"}`} />
              </button>
            ))}
          </div>
          <button type="button" className="btn-acao h-11" disabled={!stars || !!state.busy} onClick={() => act("rate", () => base44.services.rate(id, stars, text))}>Enviar avaliação</button>
        </div>
      )}

      <section aria-label="Conversa com o prestador" className="rounded-lg border border-border bg-card">
        <h2 className="px-4 pt-4 text-[15px] font-semibold">Conversa</h2>
        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {msgs.map((m) => (
            <div key={m.id} className={`text-[15px] ${m.author_kind === "system" ? "text-center text-[13px] text-muted-foreground" : m.author_kind === "customer" ? "ml-auto bg-[#E3EFE6]" : "bg-secondary"} ${m.author_kind !== "system" ? "max-w-[85%] w-fit rounded-2xl px-3 py-2" : ""}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.author_kind !== "system" && <p className="text-[11px] text-muted-foreground mt-0.5">{when(m.created_at)}</p>}
            </div>
          ))}
          <div ref={end} />
        </div>
        {!closed && (
          <form className="flex gap-2 p-3 border-t border-border" onSubmit={(e) => { e.preventDefault(); if (text.trim()) act("send", async () => { await base44.services.send(id, text); setText(""); }); }}>
            <input value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} placeholder="Escreva uma mensagem" aria-label="Mensagem" className="flex-1 h-11 rounded-lg border border-input bg-background px-3" />
            <button className="btn-acao h-11 px-4" disabled={!text.trim() || state.busy === "send"} aria-label="Enviar"><Send className="w-4 h-4" /></button>
          </form>
        )}
      </section>
      {["REQUESTED", "ACCEPTED", "SCHEDULED"].includes(r.status) && (
        <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { const why = window.prompt("Motivo do cancelamento"); if (why) act("cancel", () => base44.services.cancel(id, why)); }}>Cancelar pedido de orçamento</button>
      )}
    </div>
  );
}
