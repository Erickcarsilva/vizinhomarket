import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { brl, STATUS, FULFILLMENT, PAYMENT, nextStatus, nextActionLabel } from "@/lib/constants";

export default function OrderCard({ order, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // "code" | "cancel"
  const [input, setInput] = useState("");
  const [ageChecked, setAgeChecked] = useState(false);
  const next = nextStatus(order);
  const open = !["DELIVERED", "CANCELLED"].includes(order.status);

  const move = async (status, extra = {}) => {
    if (status === "DELIVERED" && !extra.delivery_code) { setMode("code"); setInput(""); return; }
    setBusy(true);
    setError("");
    try {
      await base44.entities.Order.update(order.id, { status, ...extra });
      setMode(null);
      onChanged();
    } catch (e) {
      setError(e.message || "Não foi possível atualizar o pedido. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{order.customer_name}</p>
          <p className="text-xs text-muted-foreground">{order.code} · {new Date(order.created_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {order.customer_phone}</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${STATUS[order.status].tone}`}>{STATUS[order.status].label}</span>
      </div>
      <ul className="text-sm space-y-0.5">
        {order.items.map((i, n) => (
          <li key={n}>
            <span className="font-medium">{i.quantity}× {i.name}</span>
            {i.addons?.length > 0 && <span className="block pl-5 text-xs text-muted-foreground">+ {i.addons.join(", ")}</span>}
          </li>
        ))}
      </ul>
      {order.age_check_required && (
        <p data-conferir-idade className="text-sm font-semibold rounded-lg bg-amber-100 text-amber-900 px-3 py-2">+18: confira um documento com foto antes de entregar</p>
      )}
      {order.notes && <p className="text-sm bg-secondary rounded-lg px-3 py-2">“{order.notes}”</p>}
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>{FULFILLMENT[order.fulfillment]}{order.address ? ` · ${order.address}` : ""}</p>
        <p>{PAYMENT[order.payment_method]}{order.change_for ? ` · troco p/ ${brl(order.change_for)}` : ""}</p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="font-display text-xl">{brl(order.total)}</span>
        {open && (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => { setMode("cancel"); setInput(""); }} className="h-9 px-4 rounded-full text-sm border border-border hover:bg-secondary transition disabled:opacity-40">
              {order.status === "CREATED" ? "Recusar" : "Cancelar"}
            </button>
            {next && (
              <button disabled={busy} onClick={() => move(next)} className="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground font-semibold hover:opacity-90 transition disabled:opacity-40">
                {nextActionLabel(order)}
              </button>
            )}
          </div>
        )}
      </div>
      {mode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "code") {
              if (!/^\d{4}$/.test(input)) { setError("Digite os 4 números do código do cliente."); return; }
              if (order.age_check_required && !ageChecked) { setError("Confira o documento do cliente (18 anos ou mais) e marque a caixa."); return; }
              move("DELIVERED", { delivery_code: input, age_checked: ageChecked });
            } else {
              if (input.trim().length < 3) { setError("Escreva o motivo do cancelamento."); return; }
              move("CANCELLED", { cancel_reason: input.trim() });
            }
          }}
          className="flex flex-wrap gap-2 pt-2"
        >
          {mode === "code" && order.age_check_required && (
            <label className="w-full flex gap-2 items-start text-sm">
              <input type="checkbox" checked={ageChecked} onChange={(e) => { setAgeChecked(e.target.checked); setError(""); }} className="mt-1" />
              <span>Conferi o documento com foto: o cliente tem 18 anos ou mais.</span>
            </label>
          )}
          <input
            autoFocus
            value={input}
            onChange={(e) => { setInput(mode === "code" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value); setError(""); }}
            inputMode={mode === "code" ? "numeric" : "text"}
            placeholder={mode === "code" ? "Código do cliente (4 números)" : "Motivo (ex.: produto em falta)"}
            className="flex-1 min-w-[10rem] h-10 rounded-full border border-border bg-transparent px-4 text-sm"
          />
          <button disabled={busy} className="h-10 px-4 rounded-full text-sm bg-primary text-primary-foreground font-semibold disabled:opacity-40">
            {mode === "code" ? "Confirmar" : "Cancelar pedido"}
          </button>
          <button type="button" onClick={() => { setMode(null); setError(""); }} className="h-10 px-3 rounded-full text-sm border border-border">Voltar</button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}