import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";
import { Card, Chip, Btn, Empty, ErrorLine, Seg, useAction, fmtDate } from "./ui";

const ST = { requested: ["Aguardando decisão", "warn"], approved: ["Aprovado", "info"], processing: ["Processando", "info"], succeeded: ["Concluído", "ok"], failed: ["Falhou", "bad"], rejected: ["Recusado", "default"] };

// Reembolsos: o admin decide com justificativa e define quem arca (loja ou plataforma). Online: o gateway devolve.
export default function RefundsAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("requested");
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-refunds", status], queryFn: () => base44.admin.refunds(status || null) });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-refunds"] }));
  const [form, setForm] = useState({});
  const f = (id) => form[id] || { amount: "", charged: "store", note: "" };
  const setF = (id, patch) => setForm((x) => ({ ...x, [id]: { ...f(id), ...patch } }));
  return (
    <div className="space-y-4">
      <Seg options={[["requested", "Para decidir"], ["approved", "Aprovados"], ["failed", "Com falha"], ["succeeded", "Concluídos"], ["", "Todos"]]} value={status} onChange={setStatus} />
      <ErrorLine error={error} />
      {isLoading ? null : data.length === 0 ? <Empty>Nenhum reembolso aqui.</Empty> : data.map((r) => (
        <Card key={r.id} className="p-5 space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{r.order?.code} · {r.order?.store?.name} · {brl(r.amount)} de {brl(r.order?.total)}</p>
              <p className="text-xs text-muted-foreground">{r.mode === "gateway" ? "Pago pelo app (devolução automática)" : "Pago direto à loja (a loja devolve)"} · {fmtDate(r.created_at)}</p>
            </div>
            <Chip tone={ST[r.status][1]}>{ST[r.status][0]}</Chip>
          </div>
          <p className="text-sm bg-secondary rounded-xl px-3 py-2">“{r.reason}”</p>
          {r.decision_note && <p className="text-xs text-muted-foreground">Decisão: {r.decision_note}{r.charged_to ? ` · arcado por: ${r.charged_to === "store" ? "loja" : "plataforma"}` : ""}</p>}
          {r.failure_reason && <p className="text-xs text-destructive">Erro do gateway: {r.failure_reason}</p>}
          {r.status === "requested" && (
            <div className="grid sm:grid-cols-[120px_160px_1fr] gap-2">
              <input value={f(r.id).amount} onChange={(e) => setF(r.id, { amount: e.target.value })} placeholder={String(r.amount)} inputMode="decimal" aria-label="Valor aprovado" className="h-10 rounded-xl border border-border bg-card px-3 text-sm" />
              <select value={f(r.id).charged} onChange={(e) => setF(r.id, { charged: e.target.value })} aria-label="Quem arca" className="h-10 rounded-xl border border-border bg-card px-3 text-sm"><option value="store">Loja arca</option><option value="platform">Plataforma arca</option></select>
              <input value={f(r.id).note} onChange={(e) => setF(r.id, { note: e.target.value })} placeholder="Justificativa (obrigatória)" className="h-10 rounded-xl border border-border bg-card px-3 text-sm" />
              <div className="sm:col-span-3 flex gap-2">
                <Btn variant="primary" busy={busy === `a-${r.id}`} disabled={f(r.id).note.trim().length < 5} onClick={() => run(`a-${r.id}`, () => base44.admin.decideRefund(r.id, true, f(r.id).amount ? Number(f(r.id).amount.replace(",", ".")) : null, f(r.id).charged, f(r.id).note))}>Aprovar</Btn>
                <Btn variant="danger" busy={busy === `r-${r.id}`} disabled={f(r.id).note.trim().length < 5} onClick={() => run(`r-${r.id}`, () => base44.admin.decideRefund(r.id, false, null, f(r.id).charged, f(r.id).note))}>Recusar</Btn>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
