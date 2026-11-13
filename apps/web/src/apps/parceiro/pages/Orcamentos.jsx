import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, MapPin, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

const ST = { REQUESTED: ["Novo pedido", "bg-amber-100 text-amber-800"], QUOTED: ["Proposta enviada", "bg-sky-100 text-sky-800"], ACCEPTED: ["Aceito: agende", "bg-emerald-100 text-emerald-800"],
  SCHEDULED: ["Agendado", "bg-violet-100 text-violet-800"], COMPLETED: ["Concluído", "bg-secondary"], DECLINED: ["Recusado", "bg-secondary"], CANCELLED: ["Cancelado", "bg-red-100 text-red-700"], EXPIRED: ["Proposta vencida", "bg-secondary"] };
const when = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function RequestCard({ r, onChanged }) {
  const [open, setOpen] = useState(r.status === "REQUESTED");
  const [q, setQ] = useState({ amount: r.quote_amount || "", notes: r.quote_notes || "", days: "7" });
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState("");
  const [state, setState] = useState({ busy: "", error: "" });
  const { data: msgs = [] } = useQuery({ queryKey: ["service-msgs", r.id], queryFn: () => base44.services.messages(r.id), enabled: open, refetchInterval: open ? 20000 : false });
  const { data: contact } = useQuery({ queryKey: ["service-contact", r.id], queryFn: () => base44.services.contact(r.id), enabled: open && ["ACCEPTED", "SCHEDULED", "COMPLETED"].includes(r.status) });
  const act = async (key, fn) => { setState({ busy: key, error: "" }); try { await fn(); setState({ busy: "", error: "" }); onChanged(); } catch (e) { setState({ busy: "", error: e.message }); } };
  const input = "h-10 rounded-xl border border-border bg-background px-3 text-sm";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <button type="button" className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="min-w-0">
          <p className="font-semibold">{r.customer_name} · {r.code}</p>
          <p className="text-xs text-muted-foreground">{when(r.created_at)}{r.offering?.name ? ` · ${r.offering.name}` : ""}{r.quote_amount ? ` · ${brl(r.quote_amount)}` : ""}</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${ST[r.status][1]}`}>{ST[r.status][0]}</span>
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm bg-secondary rounded-xl px-3 py-2 whitespace-pre-wrap">{r.description}</p>
          {r.preferred_window && <p className="text-sm">Preferência: {r.preferred_window}</p>}
          {contact && (
            <div className="text-sm space-y-1">
              {contact.phone && <a className="flex items-center gap-2 font-semibold" href={`tel:${contact.phone}`}><Phone className="w-4 h-4" />{contact.phone}</a>}
              {contact.address && <p className="flex items-center gap-2"><MapPin className="w-4 h-4" />{contact.address}</p>}
            </div>
          )}
          {["REQUESTED", "QUOTED"].includes(r.status) && (
            <div className="grid sm:grid-cols-[140px_1fr_110px_auto] gap-2 items-end">
              <label className="text-xs space-y-1">Valor (R$)<input value={q.amount} onChange={(e) => setQ({ ...q, amount: e.target.value })} inputMode="decimal" className={`${input} w-full`} /></label>
              <label className="text-xs space-y-1">O que está incluso<input value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value.slice(0, 1000) })} className={`${input} w-full`} /></label>
              <label className="text-xs space-y-1">Validade (dias)<input value={q.days} onChange={(e) => setQ({ ...q, days: e.target.value.replace(/\D/g, "") })} className={`${input} w-full`} /></label>
              <button disabled={!q.amount || !!state.busy} onClick={() => act("quote", () => base44.services.quote(r.id, String(q.amount).replace(",", "."), q.notes, q.days))} className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">{r.status === "QUOTED" ? "Atualizar proposta" : "Enviar proposta"}</button>
            </div>
          )}
          {["ACCEPTED", "SCHEDULED"].includes(r.status) && (
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs space-y-1">Data e hora<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} /></label>
              <button disabled={!at || !!state.busy} onClick={() => act("schedule", () => base44.services.schedule(r.id, at))} className="h-10 px-4 rounded-full border border-border text-sm font-semibold disabled:opacity-40">{r.scheduled_at ? "Reagendar" : "Agendar"}</button>
              <button disabled={!!state.busy} onClick={() => window.confirm("Marcar o serviço como concluído? A comissão entra na fatura do mês.") && act("done", () => base44.services.complete(r.id))} className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">Concluir serviço</button>
            </div>
          )}
          {r.scheduled_at && <p className="text-sm font-semibold">Agendado: {when(r.scheduled_at)}</p>}
          <div className="rounded-xl border border-border p-3 space-y-2 max-h-64 overflow-y-auto">
            {msgs.map((m) => <p key={m.id} className={`text-sm ${m.author_kind === "system" ? "text-xs text-muted-foreground" : ""}`}><strong>{m.author_kind === "customer" ? "Cliente" : m.author_kind === "provider" ? "Você" : ""}</strong>{m.author_kind !== "system" ? ": " : ""}{m.body}</p>)}
          </div>
          {!["CANCELLED", "DECLINED", "EXPIRED"].includes(r.status) && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("msg", async () => { await base44.services.send(r.id, msg); setMsg(""); }); }}>
              <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Mensagem ao cliente" className={`${input} flex-1`} />
              <button disabled={!msg.trim()} className="h-10 w-10 rounded-full border border-border flex items-center justify-center" aria-label="Enviar"><Send className="w-4 h-4" /></button>
            </form>
          )}
          {["REQUESTED", "QUOTED"].includes(r.status) && <button className="text-xs text-muted-foreground underline" onClick={() => { const why = window.prompt("Motivo da recusa"); if (why) act("decline", () => base44.services.decline(r.id, why)); }}>Recusar pedido</button>}
          {state.busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        </div>
      )}
    </div>
  );
}

// Orçamentos (prestadores de serviço): responder, agendar e concluir.
export default function Orcamentos() {
  const { store } = useOutletContext();
  const qc = useQueryClient();
  const [tab, setTab] = useState("open");
  const { data: list = [], isLoading } = useQuery({ queryKey: ["service-requests", store?.id, tab], queryFn: () => base44.services.forStore(store.id, tab === "open"), enabled: !!store, refetchInterval: 30000 });
  if (!store) return null;
  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Serviços</p>
        <h1 className="font-display text-4xl mt-2">Pedidos de orçamento</h1>
        <p className="text-sm text-muted-foreground mt-2">Telefone e endereço do cliente aparecem depois que ele aceita a proposta. A comissão é cobrada só de serviço concluído.</p>
      </div>
      <div className="flex gap-2">{[["open", "Em aberto"], ["done", "Encerrados"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`h-9 px-4 rounded-full text-sm border ${tab === k ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}>{l}</button>)}</div>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : list.length === 0 ? <p className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border p-6 text-center">Nada por aqui.</p> :
        list.map((r) => <RequestCard key={r.id} r={r} onChanged={() => qc.invalidateQueries({ queryKey: ["service-requests", store.id] })} />)}
    </div>
  );
}
