import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, Chip, Btn, ErrorLine, useAction } from "./ui";

const SCOPES = { financeiro: "Financeiro (pagamentos, conciliação, repasses, reembolsos)", atendimento: "Atendimento (chamados e reembolsos)", operacao: "Operação (entregas e reatribuição)" };

// Equipe interna: acesso por área, sem dar poder total de admin. Toda mudança fica na auditoria.
export default function StaffAdmin() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-staff"], queryFn: () => base44.admin.listStaff() });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-staff"] }));
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState("atendimento");
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Dar acesso a uma área</h3>
        <p className="text-xs text-muted-foreground">A pessoa precisa ter criado conta antes. Acesso de administrador total continua em Usuários.</p>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="e-mail da pessoa" aria-label="E-mail" className="h-10 flex-1 min-w-[14rem] rounded-xl border border-border bg-card px-3 text-sm" />
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Área" className="h-10 rounded-xl border border-border bg-card px-3 text-sm">{Object.entries(SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <Btn variant="primary" busy={busy === "add"} disabled={!email.includes("@")} onClick={() => run("add", async () => { await base44.admin.setStaffScope(email, scope, true); setEmail(""); })}>Conceder</Btn>
        </div>
        <ErrorLine error={error} />
      </Card>
      <Card className="divide-y divide-border">
        {data.map((p) => (
          <div key={p.user_id} className="p-4 flex flex-wrap items-center gap-2 text-sm">
            <div className="flex-1 min-w-[12rem]"><p className="font-semibold">{p.full_name || p.email}</p><p className="text-xs text-muted-foreground">{p.email}</p></div>
            {p.is_admin && <Chip tone="info">Administrador</Chip>}
            {p.scopes.map((s) => (
              <span key={s} className="flex items-center gap-1"><Chip>{s}</Chip>
                <button type="button" className="text-xs text-destructive underline" onClick={() => run(`${p.user_id}-${s}`, () => base44.admin.setStaffScope(p.email, s, false), `Retirar o acesso de ${p.email} a ${s}?`)}>retirar</button>
              </span>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
