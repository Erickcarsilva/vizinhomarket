import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

const EMPTY = { code: "", description: "", kind: "percent", value: "10", min_subtotal: "", max_redemptions: "", per_user_limit: "1", ends_at: "", first_order_only: false };
const KIND = { percent: "% de desconto", fixed: "Valor fixo (R$)", free_delivery: "Entrega grátis" };
const describe = (c) => (c.kind === "percent" ? `${Number(c.value)}% off` : c.kind === "fixed" ? `${brl(c.value)} off` : "Entrega grátis") +
  (Number(c.min_subtotal) ? ` · pedido mín. ${brl(c.min_subtotal)}` : "");

// Cupons da loja (bancados pela loja). A validação e o desconto acontecem no servidor no momento do pedido.
export default function Promocoes() {
  const { store } = useOutletContext();
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["coupons", store?.id], queryFn: () => base44.partner.coupons(store.id), enabled: !!store });
  const [f, setF] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: "", ok: "" });
  if (!store) return null;
  const save = async (payload, okMsg) => {
    setState({ busy: true, error: "", ok: "" });
    try { await base44.partner.saveCoupon(store.id, payload); setState({ busy: false, error: "", ok: okMsg }); qc.invalidateQueries({ queryKey: ["coupons", store.id] }); return true; }
    catch (e) { setState({ busy: false, error: e.message, ok: "" }); return false; }
  };
  const submit = async (e) => {
    e.preventDefault();
    const ok = await save({
      code: f.code, description: f.description || null, kind: f.kind, value: f.kind === "free_delivery" ? 0 : Number(String(f.value).replace(",", ".")),
      min_subtotal: f.min_subtotal ? Number(f.min_subtotal) : 0, max_redemptions: f.max_redemptions ? Number(f.max_redemptions) : null,
      per_user_limit: Number(f.per_user_limit) || 1, ends_at: f.ends_at ? new Date(`${f.ends_at}T23:59:59`).toISOString() : null, first_order_only: f.first_order_only,
    }, "Cupom criado. Divulgue o código para seus clientes.");
    if (ok) setF(EMPTY);
  };
  const input = "w-full h-11 rounded-xl border border-border bg-card px-3 text-sm";
  return (
    <div className="max-w-5xl mx-auto px-5 py-8 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Marketing</p>
        <h1 className="font-display text-4xl mt-2">Promoções e cupons</h1>
        <p className="text-sm text-muted-foreground mt-2">O desconto do cupom da loja sai do valor da loja, e a comissão é calculada sobre o valor com desconto.</p>
      </div>
      <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 grid sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">Código<input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30) })} placeholder="EX.: BEMVINDO10" className={input} /></label>
        <label className="text-sm space-y-1">Tipo<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={input}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {f.kind !== "free_delivery" && <label className="text-sm space-y-1">{f.kind === "percent" ? "Percentual (%)" : "Valor (R$)"}<input required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} inputMode="decimal" className={input} /></label>}
        <label className="text-sm space-y-1">Pedido mínimo (R$, opcional)<input value={f.min_subtotal} onChange={(e) => setF({ ...f, min_subtotal: e.target.value })} inputMode="decimal" className={input} /></label>
        <label className="text-sm space-y-1">Limite total de usos (opcional)<input value={f.max_redemptions} onChange={(e) => setF({ ...f, max_redemptions: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} /></label>
        <label className="text-sm space-y-1">Usos por cliente<input value={f.per_user_limit} onChange={(e) => setF({ ...f, per_user_limit: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} /></label>
        <label className="text-sm space-y-1">Válido até (opcional)<input type="date" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} className={input} /></label>
        <label className="text-sm flex items-center gap-2 pt-6"><input type="checkbox" checked={f.first_order_only} onChange={(e) => setF({ ...f, first_order_only: e.target.checked })} />Só no primeiro pedido do cliente</label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button disabled={state.busy || f.code.length < 3} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 disabled:opacity-40">{state.busy && <Loader2 className="w-4 h-4 animate-spin" />}Criar cupom</button>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
        </div>
      </form>
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Seus cupons</h2>
        {isLoading ? null : list.length === 0 ? <p className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border p-6 text-center">Nenhum cupom ainda.</p> : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {list.map((c) => (
              <div key={c.id} className="p-4 flex items-center gap-3">
                <Tag className="w-5 h-5 text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold font-mono">{c.code}</p>
                  <p className="text-xs text-muted-foreground">{describe(c)} · usado {c.redemptions}×{c.max_redemptions ? ` de ${c.max_redemptions}` : ""}{c.ends_at ? ` · até ${new Date(c.ends_at).toLocaleDateString("pt-BR")}` : ""}</p>
                </div>
                <button onClick={() => save({ ...c, active: !c.active }, c.active ? "Cupom pausado." : "Cupom reativado.")} className={`h-8 px-3 rounded-full text-xs font-semibold border ${c.active ? "border-border" : "bg-secondary"}`}>{c.active ? "Pausar" : "Reativar"}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
