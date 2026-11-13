import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";
import { Card, Chip, Btn, Empty, ErrorLine, useAction } from "./ui";

const EMPTY = { code: "", description: "", kind: "fixed", value: "5", max_discount: "", min_subtotal: "", max_redemptions: "", per_user_limit: "1", ends_at: "", first_order_only: true };

// Campanhas da plataforma (bancadas pela plataforma) e visão dos cupons das lojas.
export default function CouponsAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-coupons"], queryFn: () => base44.admin.coupons() });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-coupons"] }));
  const [f, setF] = useState(EMPTY);
  const num = (v) => (v === "" ? null : Number(String(v).replace(",", ".")));
  const i = "h-10 rounded-xl border border-border bg-card px-3 text-sm w-full";
  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Nova campanha da plataforma</h3>
        <p className="text-xs text-muted-foreground">O desconto é pago pela plataforma: a loja recebe o valor cheio e a comissão não muda. Fica registrado no razão como despesa de desconto.</p>
        <div className="grid sm:grid-cols-4 gap-2">
          <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="CÓDIGO" className={i} aria-label="Código" />
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={i} aria-label="Tipo"><option value="fixed">R$ fixo</option><option value="percent">%</option><option value="free_delivery">Entrega grátis</option></select>
          {f.kind !== "free_delivery" && <input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Valor" inputMode="decimal" className={i} aria-label="Valor" />}
          <input value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} placeholder="Desconto máx. (R$)" inputMode="decimal" className={i} aria-label="Desconto máximo" />
          <input value={f.min_subtotal} onChange={(e) => setF({ ...f, min_subtotal: e.target.value })} placeholder="Pedido mínimo (R$)" inputMode="decimal" className={i} aria-label="Pedido mínimo" />
          <input value={f.max_redemptions} onChange={(e) => setF({ ...f, max_redemptions: e.target.value })} placeholder="Limite total de usos" inputMode="numeric" className={i} aria-label="Limite de usos" />
          <input type="date" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} className={i} aria-label="Válido até" />
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={f.first_order_only} onChange={(e) => setF({ ...f, first_order_only: e.target.checked })} />Só primeiro pedido</label>
        </div>
        <Btn variant="primary" busy={busy === "new"} disabled={f.code.length < 3} onClick={() => run("new", async () => {
          await base44.admin.saveCoupon({ code: f.code, description: f.description || null, kind: f.kind, value: f.kind === "free_delivery" ? 0 : num(f.value), max_discount: num(f.max_discount),
            min_subtotal: num(f.min_subtotal) || 0, max_redemptions: num(f.max_redemptions), per_user_limit: Number(f.per_user_limit) || 1, funded_by: "platform",
            ends_at: f.ends_at ? new Date(`${f.ends_at}T23:59:59`).toISOString() : null, first_order_only: f.first_order_only });
          setF(EMPTY);
        })}>Criar campanha</Btn>
        <ErrorLine error={error} />
      </Card>
      {isLoading ? null : data.length === 0 ? <Empty>Nenhum cupom ainda.</Empty> : (
        <Card className="divide-y divide-border">
          {data.map((c) => (
            <div key={c.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono font-semibold">{c.code}</span>
              <Chip tone={c.funded_by === "platform" ? "info" : "default"}>{c.funded_by === "platform" ? "Plataforma" : c.store?.name || "Loja"}</Chip>
              <span className="flex-1 text-muted-foreground">{c.kind === "percent" ? `${Number(c.value)}%` : c.kind === "fixed" ? brl(c.value) : "Entrega grátis"} · usado {c.redemptions}×{c.max_redemptions ? `/${c.max_redemptions}` : ""}</span>
              <Btn busy={busy === c.id} onClick={() => run(c.id, () => base44.admin.saveCoupon({ ...c, store: undefined, active: !c.active }))}>{c.active ? "Pausar" : "Reativar"}</Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
