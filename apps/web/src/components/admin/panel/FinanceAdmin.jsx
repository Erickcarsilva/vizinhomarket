import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";
import { Card, Chip, Btn, Empty, ErrorLine, Seg, useAction, fmtDate } from "./ui";

const SEV = { critica: "bad", alta: "bad", media: "warn" };
const ISSUE = {
  pago_sem_extrato: "Pago sem liquidação no extrato", extrato_sem_pagamento: "Extrato com pagamento desconhecido", valor_divergente: "Valor do extrato diferente",
  pagamento_em_revisao: "Pagamento em revisão (valor pago ≠ cobrado)", cancelado_sem_estorno: "Cancelado e pago, sem estorno concluído", estorno_falhou: "Estorno falhou",
  offline_sem_confirmacao: "Pagamento na entrega sem confirmação da loja", entregue_sem_lancamento: "Entregue sem lançamento financeiro",
  razao_desbalanceado: "Razão desbalanceado", webhook_nao_processado: "Aviso do gateway não processado",
};
const ACC = { store_payable: "A pagar à loja", store_receivable: "A receber da loja", courier_payable: "A pagar ao entregador", gateway_clearing: "Saldo no gateway/banco",
  customer_prepaid: "Pago por clientes (a entregar)", platform_revenue: "Receita da plataforma", platform_discount_expense: "Descontos bancados", platform_refund_expense: "Estornos bancados",
  platform_gateway_fees: "Tarifas do gateway", platform_cash: "Faturas recebidas", adjustment: "Ajustes" };
const PST = { paid: "ok", pending: "warn", created: "warn", failed: "bad", review: "bad", refunded: "info", partially_refunded: "info", expired: "default", cancelled: "default" };

// CSV do extrato: provider_payment_id;bruto;tarifa;data (AAAA-MM-DD). Cabeçalho opcional.
const parseCsv = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[;,\t]/).map((x) => x.trim()))
  .filter((c) => c.length >= 4 && !/id/i.test(c[0]))
  .map(([id, gross, fee, date]) => ({ provider_payment_id: id, gross: Number(gross.replace(",", ".")), fee: Number((fee || "0").replace(",", ".")), settled_on: date }));

export default function FinanceAdmin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("conc");
  const recon = useQuery({ queryKey: ["admin-recon"], queryFn: () => base44.admin.reconciliation(new Date(Date.now() - 90 * 864e5).toISOString(), new Date().toISOString()), enabled: tab === "conc" });
  const pays = useQuery({ queryKey: ["admin-payments"], queryFn: () => base44.admin.payments(), enabled: tab === "pag" });
  const bal = useQuery({ queryKey: ["admin-balances"], queryFn: () => base44.admin.balances(), enabled: tab === "saldo" });
  const { busy, error, run } = useAction(() => Promise.all(["admin-recon", "admin-balances", "admin-payments"].map((k) => qc.invalidateQueries({ queryKey: [k] }))));
  const [csv, setCsv] = useState({ provider: "mercadopago", batch: "", text: "" });
  const [msg, setMsg] = useState("");
  const [payout, setPayout] = useState(null);

  return (
    <div className="space-y-5">
      <Seg options={[["conc", "Conciliação"], ["pag", "Pagamentos online"], ["saldo", "Saldos e repasses"]]} value={tab} onChange={setTab} />
      <ErrorLine error={error} />
      {msg && <p className="text-sm text-primary">{msg}</p>}

      {tab === "conc" && (
        <>
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">Importar extrato do gateway</h3>
            <p className="text-xs text-muted-foreground">Cole as linhas do relatório de liquidação: id do pagamento; valor bruto; tarifa; data (AAAA-MM-DD). Linhas repetidas são ignoradas; a tarifa entra no razão.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={csv.provider} onChange={(e) => setCsv({ ...csv, provider: e.target.value })} className="h-10 rounded-xl border border-border bg-card px-3 text-sm">
                {["mercadopago", "asaas", "pagarme", "sandbox"].map((p) => <option key={p}>{p}</option>)}
              </select>
              <input value={csv.batch} onChange={(e) => setCsv({ ...csv, batch: e.target.value })} placeholder="Nome do lote (ex.: extrato-2026-11)" className="h-10 rounded-xl border border-border bg-card px-3 text-sm" />
            </div>
            <textarea value={csv.text} onChange={(e) => setCsv({ ...csv, text: e.target.value })} rows={4} className="w-full rounded-xl border border-border bg-card p-3 text-sm font-mono" placeholder="123456789;45,90;0,46;2026-11-13" />
            <Btn variant="primary" busy={busy === "imp"} disabled={!csv.text.trim() || !csv.batch.trim()} onClick={() => run("imp", async () => {
              const lines = parseCsv(csv.text);
              if (!lines.length) throw new Error("Nenhuma linha válida no extrato.");
              const r = await base44.admin.importSettlement(csv.provider, csv.batch, lines);
              setMsg(`${r.imported} linha(s) importada(s), ${r.duplicates} repetida(s).`); setCsv({ ...csv, text: "" });
            })}>Importar</Btn>
          </Card>
          <Card className="p-5 space-y-2">
            <h3 className="font-semibold">Pendências (últimos 90 dias)</h3>
            {recon.isLoading ? <p className="text-sm text-muted-foreground">Conferindo…</p> : (recon.data || []).length === 0 ? (
              <p className="text-sm text-primary font-semibold">Tudo conciliado: nenhuma divergência encontrada.</p>
            ) : (
              <div className="divide-y divide-border">
                {recon.data.map((i, n) => (
                  <div key={n} className="py-2.5 flex items-start gap-3 text-sm">
                    <Chip tone={SEV[i.severity] || "default"}>{i.severity}</Chip>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{ISSUE[i.issue] || i.issue}{i.order_code ? ` · ${i.order_code}` : ""}</p>
                      <p className="text-xs text-muted-foreground break-all">{[i.reference, i.detail, fmtDate(i.occurred_at)].filter(Boolean).join(" · ")}</p>
                    </div>
                    {i.amount != null && <span className="font-semibold">{brl(i.amount)}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "pag" && (
        pays.isLoading ? null : (pays.data || []).length === 0 ? <Empty>Nenhum pagamento online ainda.</Empty> : (
          <Card className="divide-y divide-border">
            {pays.data.map((p) => (
              <div key={p.id} className="p-3 flex items-center gap-3 text-sm">
                <Chip tone={PST[p.status]}>{p.status}</Chip>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.order?.code} · {p.order?.store?.name}</p>
                  <p className="text-xs text-muted-foreground">{p.provider} · {p.method === "pix" ? "Pix" : "Cartão"} · {fmtDate(p.created_at)}{p.failure_reason ? ` · ${p.failure_reason}` : ""}</p>
                </div>
                <span className="font-semibold">{brl(p.amount)}</span>
              </div>
            ))}
          </Card>
        )
      )}

      {tab === "saldo" && (
        <Card className="divide-y divide-border">
          {(bal.data || []).length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Sem movimentação financeira ainda.</p>}
          {(bal.data || []).map((b, n) => {
            const payable = ["store_payable", "courier_payable"].includes(b.account) && Number(b.balance) < 0;
            return (
              <div key={n} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-medium">{ACC[b.account] || b.account}{b.party_name ? ` · ${b.party_name}` : ""}</p>
                </div>
                <span className="font-semibold">{brl(Math.abs(b.balance))}</span>
                {payable && <Btn onClick={() => setPayout({ kind: b.account === "store_payable" ? "store" : "courier", id: b.party_id, name: b.party_name, max: Math.abs(b.balance), amount: String(Math.abs(b.balance)), reference: "", method: "pix" })}>Registrar repasse</Btn>}
              </div>
            );
          })}
        </Card>
      )}
      {payout && (
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold">Repasse para {payout.name}</h3>
          <p className="text-xs text-muted-foreground">Faça a transferência no banco/gateway e registre aqui com o identificador (ex.: ID do Pix). O registro é definitivo.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} inputMode="decimal" className="h-10 rounded-xl border border-border bg-card px-3 text-sm" aria-label="Valor" />
            <select value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })} className="h-10 rounded-xl border border-border bg-card px-3 text-sm"><option value="pix">Pix</option><option value="ted">TED</option><option value="gateway_split">Split do gateway</option></select>
            <input value={payout.reference} onChange={(e) => setPayout({ ...payout, reference: e.target.value })} placeholder="Identificador da transferência" className="h-10 rounded-xl border border-border bg-card px-3 text-sm" />
          </div>
          <div className="flex gap-2">
            <Btn variant="primary" busy={busy === "pay"} disabled={payout.reference.trim().length < 3} onClick={() => run("pay", async () => {
              await base44.admin.recordPayout(payout.kind, payout.id, Number(String(payout.amount).replace(",", ".")), payout.method, payout.reference);
              setMsg("Repasse registrado."); setPayout(null);
            })}>Registrar</Btn>
            <Btn onClick={() => setPayout(null)}>Cancelar</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
