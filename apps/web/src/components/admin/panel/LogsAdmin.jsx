import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, Empty, fmtDate } from "./ui";

const ACTIONS = {
  ban_user: "Bloqueou usuário", unban_user: "Desbloqueou usuário", grant_admin: "Deu acesso de admin", revoke_admin: "Removeu acesso de admin",
  set_store_status: "Mudou situação da loja", set_store_commission: "Mudou comissão da loja", set_commission_rule: "Mudou comissão da categoria",
  set_setting: "Mudou configuração", generate_invoices: "Gerou faturas", set_invoice_status: "Mudou situação da fatura",
  set_courier_status: "Mudou situação do entregador", register_store: "Loja nova cadastrada", apply_as_courier: "Entregador se cadastrou", account_deleted: "Conta excluída pelo próprio usuário",
};

export default function LogsAdmin() {
  const { data: errors = [] } = useQuery({ queryKey: ["client-errors"], queryFn: () => base44.admin.listErrors(50), refetchInterval: 60000 });
  const { data: audit = [] } = useQuery({ queryKey: ["admin-audit"], queryFn: () => base44.admin.listAudit(50) });
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-semibold">Erros no app (últimos 50)</h3>
        {errors.length === 0 ? <Empty>Nenhum erro registrado.</Empty> : (
          <Card className="divide-y divide-border text-sm">
            {errors.map((e) => (
              <div key={e.id} className="p-4">
                <p className="font-medium break-words">{e.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtDate(e.created_at)} · {e.url || "?"} · {(e.user_agent || "").slice(0, 70)}</p>
              </div>
            ))}
          </Card>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Histórico de ações administrativas</h3>
        {audit.length === 0 ? <Empty>Nada registrado ainda.</Empty> : (
          <Card className="divide-y divide-border text-sm">
            {audit.map((a) => (
              <div key={a.id} className="p-3 flex justify-between gap-3">
                <span>{ACTIONS[a.action] || a.action}{a.data?.status ? ` → ${a.data.status}` : ""}{a.data?.rate != null ? ` → ${(Number(a.data.rate) * 100).toLocaleString("pt-BR")}%` : ""}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(a.created_at)}</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
