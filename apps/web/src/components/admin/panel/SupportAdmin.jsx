import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, Chip, Btn, Empty, ErrorLine, Seg, useAction, fmtDate } from "./ui";

const ST = { open: ["Aberto", "warn"], waiting_customer: ["Aguardando cliente", "info"], waiting_store: ["Aguardando loja", "info"], resolved: ["Resolvido", "ok"], closed: ["Encerrado", "default"] };
const KIND = { support: "Dúvida", refund: "Reembolso", dispute: "Disputa", delivery: "Entrega", account: "Conta", other: "Outro" };
const WHO = { customer: "Cliente", partner: "Loja", courier: "Entregador", admin: "Equipe", system: "Sistema" };

function Ticket({ t, onChanged }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const { data: msgs = [] } = useQuery({ queryKey: ["admin-ticket", t.id], queryFn: () => base44.admin.ticketMessages(t.id), enabled: open });
  const { busy, error, run } = useAction(onChanged);
  return (
    <Card className="p-4 space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 text-left" aria-expanded={open}>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{t.subject}</p>
          <p className="text-xs text-muted-foreground">{KIND[t.kind]}{t.order?.code ? ` · ${t.order.code}` : ""}{t.store?.name ? ` · ${t.store.name}` : ""} · {fmtDate(t.updated_at)}</p>
        </div>
        <Chip tone={ST[t.status][1]}>{ST[t.status][0]}</Chip>
      </button>
      {open && (
        <>
          <div className="space-y-2">
            {msgs.map((m) => <div key={m.id} className={`text-sm rounded-xl px-3 py-2 ${m.author_kind === "admin" ? "bg-primary/10" : "bg-secondary"}`}><p className="text-[11px] font-semibold text-muted-foreground">{WHO[m.author_kind]} · {fmtDate(m.created_at)}</p><p className="whitespace-pre-wrap">{m.body}</p></div>)}
          </div>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Resposta para quem abriu" className="w-full rounded-xl border border-border bg-card p-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" busy={busy === "r"} disabled={!reply.trim()} onClick={() => run("r", async () => { await base44.admin.setTicket(t.id, "waiting_customer", reply); setReply(""); })}>Responder</Btn>
            <Btn busy={busy === "s"} onClick={() => run("s", () => base44.admin.setTicket(t.id, "waiting_store", reply))}>Aguardar loja</Btn>
            <Btn busy={busy === "ok"} onClick={() => run("ok", () => base44.admin.setTicket(t.id, "resolved", reply))}>Resolver</Btn>
            <Btn variant="danger" busy={busy === "c"} onClick={() => run("c", () => base44.admin.setTicket(t.id, "closed", reply))}>Encerrar</Btn>
          </div>
          <ErrorLine error={error} />
        </>
      )}
    </Card>
  );
}

export default function SupportAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => base44.admin.tickets(status || null), refetchInterval: 60000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-tickets"] });
  return (
    <div className="space-y-4">
      <Seg options={[["open", "Abertos"], ["waiting_customer", "Aguardando cliente"], ["resolved", "Resolvidos"], ["", "Todos"]]} value={status} onChange={setStatus} />
      {isLoading ? null : data.length === 0 ? <Empty>Nenhum atendimento aqui.</Empty> : data.map((t) => <Ticket key={t.id} t={t} onChanged={refresh} />)}
    </div>
  );
}
