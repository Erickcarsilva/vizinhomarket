import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, Chip, Btn, ErrorLine, useAction } from "./ui";

// Expansão: cidades atendidas. Cidade nova nasce inativa; bairros, lojas e entregadores são cadastrados antes de ativar.
export default function CitiesAdmin() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-cities"], queryFn: () => base44.admin.listCities() });
  const { busy, error, run } = useAction(() => qc.invalidateQueries({ queryKey: ["admin-cities"] }));
  const [f, setF] = useState({ name: "", state: "MS", timezone: "America/Campo_Grande" });
  const i = "h-10 rounded-xl border border-border bg-card px-3 text-sm";
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Nova cidade</h3>
        <div className="flex flex-wrap gap-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nome (ex.: Maracaju)" aria-label="Nome da cidade" className={`${i} flex-1 min-w-[12rem]`} />
          <input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase().slice(0, 2) })} aria-label="UF" className={`${i} w-16`} />
          <select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} aria-label="Fuso horário" className={i}>
            {["America/Campo_Grande", "America/Cuiaba", "America/Sao_Paulo", "America/Manaus", "America/Porto_Velho", "America/Rio_Branco", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia"].map((z) => <option key={z}>{z}</option>)}
          </select>
          <Btn variant="primary" busy={busy === "new"} disabled={f.name.trim().length < 2} onClick={() => run("new", async () => { await base44.admin.saveCity(null, f.name, f.state, f.timezone, false); setF({ ...f, name: "" }); })}>Cadastrar (inativa)</Btn>
        </div>
        <ErrorLine error={error} />
      </Card>
      <Card className="divide-y divide-border">
        {data.map((c) => (
          <div key={c.id} className="p-4 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-[12rem]">
              <p className="font-semibold">{c.name} / {c.state}</p>
              <p className="text-xs text-muted-foreground">{c.timezone} · {c.neighborhoods} bairro(s) · {c.stores} loja(s) · {c.couriers} entregador(es)</p>
            </div>
            <Chip tone={c.active ? "ok" : "default"}>{c.active ? "Atendida" : "Em preparação"}</Chip>
            <Btn busy={busy === c.id} onClick={() => run(c.id, () => base44.admin.saveCity(c.id, c.name, c.state, c.timezone, !c.active), c.active ? `Desativar ${c.name}? Lojas e clientes de lá deixam de pedir.` : `Ativar ${c.name}?`)}>{c.active ? "Desativar" : "Ativar"}</Btn>
          </div>
        ))}
      </Card>
      <p className="text-xs text-muted-foreground">Os bairros de cada cidade são cadastrados em Configurações → Bairros (hoje para a cidade principal).</p>
    </div>
  );
}
