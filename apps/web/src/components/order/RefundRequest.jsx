import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

const STATUS = { requested: "Em análise", approved: "Aprovado, devolvendo", processing: "Devolvendo", succeeded: "Devolvido", failed: "Falhou, a equipe vai resolver", rejected: "Não aprovado" };

// Problema com um pedido entregue: o cliente pede reembolso; a equipe decide e registra o motivo.
export default function RefundRequest({ order, windowDays = 7 }) {
  const qc = useQueryClient();
  const { data: refunds = [] } = useQuery({ queryKey: ["refunds", order.id], queryFn: () => base44.entities.Order.refunds(order.id) });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(order.total));
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: "", done: false });
  const within = order.delivered_at && Date.now() - Date.parse(order.delivered_at) < windowDays * 864e5;

  const submit = async () => {
    setState({ busy: true, error: "", done: false });
    try {
      await base44.entities.Order.requestRefund(order.id, Number(String(amount).replace(",", ".")), reason);
      setState({ busy: false, error: "", done: true }); setOpen(false);
      qc.invalidateQueries({ queryKey: ["refunds", order.id] });
    } catch (e) { setState({ busy: false, error: e.message, done: false }); }
  };

  return (
    <div className="space-y-2">
      {refunds.map((r) => (
        <div key={r.id} className="rounded-lg bg-card border border-border p-3 text-sm">
          <p><strong>Reembolso de {brl(r.amount)}</strong> · {STATUS[r.status] || r.status}</p>
          {r.decision_note && <p className="text-muted-foreground">Resposta: {r.decision_note}</p>}
        </div>
      ))}
      {state.done && <p className="text-sm text-[#1F6B47]">Pedido de reembolso enviado. Você acompanha a resposta aqui e em Ajuda.</p>}
      {within && !open && refunds.every((r) => ["rejected", "failed"].includes(r.status)) && (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-marca underline underline-offset-2">Teve problema com este pedido?</button>
      )}
      {open && (
        <div className="rounded-lg bg-card border border-border p-4 space-y-3">
          <p className="text-[15px] font-semibold">Pedir reembolso</p>
          <label className="block text-sm">Valor (até {brl(order.total)})
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <label className="block text-sm">O que aconteceu?
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={3} className="mt-1 w-full rounded-lg border border-input bg-background p-3" placeholder="Ex.: veio um item errado e faltou o refrigerante" />
          </label>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-contorno h-11 flex-1" onClick={() => setOpen(false)}>Voltar</button>
            <button type="button" className="btn-acao h-11 flex-1" disabled={reason.trim().length < 10 || state.busy} onClick={submit}>
              {state.busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Enviar
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">{order.payment_mode === "online" ? "Se aprovado, o valor volta para a mesma forma de pagamento." : "Pagamento feito direto à loja: se aprovado, a loja devolve e a equipe acompanha."}</p>
        </div>
      )}
    </div>
  );
}
