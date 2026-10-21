import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";
import { Card, Chip, Btn, Empty, ErrorLine, useAction, waLink } from "./ui";

const ST = { open: ["A receber", "warn"], paid: ["Paga", "ok"], void: ["Anulada", "default"] };
const pad = (n) => String(n).padStart(2, "0");
function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`];
}
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthName = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };

export default function InvoicesAdmin() {
  const qc = useQueryClient();
  const [ym, setYm] = useState(prevMonth);
  const [start, end] = monthRange(ym);
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["admin-invoices", start], queryFn: () => base44.admin.listInvoices(start, end) });
  const { data: priv = {} } = useQuery({ queryKey: ["admin-store-private"], queryFn: () => base44.admin.storePrivate() });
  const { data: settings = {} } = useQuery({ queryKey: ["admin-settings"], queryFn: () => base44.admin.getSettings() });
  const { busy, error, run } = useAction(() => Promise.all([qc.invalidateQueries({ queryKey: ["admin-invoices"] }), qc.invalidateQueries({ queryKey: ["admin-overview"] })]));
  const [generated, setGenerated] = useState(null);

  const sum = (st) => invoices.filter((i) => i.status === st).reduce((s, i) => s + i.commission_total, 0);
  const pixKey = settings.platform_pix_key ? String(settings.platform_pix_key) : "";

  const message = (inv) => {
    const p = priv[inv.store_id] || {};
    return `Olá ${p.owner_name || ""}! Segue o resumo do VizinhoMarket de ${monthName(ym)} da ${inv.store_name}:\n` +
      `• ${inv.orders_count} pedido(s) entregue(s)\n• Vendas: ${brl(inv.gross_amount)}\n• Comissão: ${brl(inv.commission_total)}\n` +
      (pixKey ? `Pix para pagamento: ${pixKey}\n` : "") + "Qualquer dúvida, é só chamar. Obrigado pela parceria!";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Mês
          <input type="month" value={ym} onChange={(e) => { setYm(e.target.value); setGenerated(null); }} className="block h-10 mt-1 rounded-xl border border-border bg-card px-3 text-sm" />
        </label>
        <Btn variant="primary" busy={busy === "gen"} onClick={() => run("gen", async () => setGenerated(await base44.admin.generateInvoices(start, end)))}>Gerar / atualizar faturas do mês</Btn>
      </div>
      <p className="text-xs text-muted-foreground">A fatura soma os pedidos <strong>entregues</strong> no mês. Gerar de novo atualiza as faturas em aberto e não mexe nas já pagas.</p>
      {generated != null && <p className="text-sm text-primary">{generated} fatura(s) gerada(s) ou atualizada(s).</p>}
      {!pixKey && <p className="text-xs text-accent">Dica: cadastre a sua chave Pix em Configurações para ela sair na mensagem de cobrança.</p>}
      <ErrorLine error={error} />
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">A receber</p><p className="font-display text-2xl mt-1">{brl(sum("open"))}</p></Card>
        <Card className="p-4"><p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Recebido</p><p className="font-display text-2xl mt-1">{brl(sum("paid"))}</p></Card>
      </div>
      {isLoading ? <Empty>Carregando…</Empty> : invoices.length === 0 ? <Empty>Nenhuma fatura de {monthName(ym)}. Toque em "Gerar" depois que o mês terminar.</Empty> : (
        <Card className="divide-y divide-border">
          {invoices.map((inv) => {
            const p = priv[inv.store_id] || {};
            const wa = waLink(p.owner_phone, message(inv));
            return (
              <div key={inv.id} className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{inv.store_name}</p>
                    <p className="text-xs text-muted-foreground">{inv.orders_count} pedido(s) · vendas {brl(inv.gross_amount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl">{brl(inv.commission_total)}</p>
                    <Chip tone={ST[inv.status][1]}>{ST[inv.status][0]}</Chip>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inv.status === "open" && <Btn variant="primary" busy={busy === `p-${inv.id}`} onClick={() => run(`p-${inv.id}`, () => base44.admin.setInvoiceStatus(inv.id, "paid"))}>Marcar como paga</Btn>}
                  {inv.status !== "open" && <Btn busy={busy === `o-${inv.id}`} onClick={() => run(`o-${inv.id}`, () => base44.admin.setInvoiceStatus(inv.id, "open"))}>Reabrir</Btn>}
                  {inv.status === "open" && <Btn variant="danger" busy={busy === `v-${inv.id}`} onClick={() => run(`v-${inv.id}`, () => base44.admin.setInvoiceStatus(inv.id, "void"), "Anular esta fatura? (ex.: cortesia ou erro)")}>Anular</Btn>}
                  {wa && inv.status === "open" && <a href={wa} target="_blank" rel="noreferrer" className="h-9 px-4 rounded-full text-xs font-semibold border border-border hover:bg-secondary flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />Enviar cobrança</a>}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
