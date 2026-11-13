import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, Chip, Btn, ErrorLine, useAction } from "./ui";

const TYPES = { text: "Texto", number: "Número", boolean: "Sim/não", select: "Lista" };

function Category({ c, onSaved }) {
  const [open, setOpen] = useState(false);
  const [attrs, setAttrs] = useState(c.attributes_schema || []);
  const { busy, error, run } = useAction(onSaved);
  const upd = (n, patch) => setAttrs((a) => a.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const i = "h-9 rounded-lg border border-border bg-card px-2 text-sm";
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex-1 text-left font-semibold" aria-expanded={open}>{c.name} <span className="text-xs text-muted-foreground font-normal">/{c.slug}</span></button>
        {c.kind === "services" && <Chip tone="info">Serviços</Chip>}
        {c.age_restricted && <Chip tone="warn">+18</Chip>}
        {c.needs_review && <Chip tone="warn">Regras específicas</Chip>}
        <Chip tone={c.active ? "ok" : "default"}>{c.active ? "Ativa" : "Inativa"}</Chip>
        <Btn busy={busy === "act"} onClick={() => run("act", () => base44.admin.saveCategory({ id: c.id, active: !c.active }))}>{c.active ? "Desativar" : "Ativar"}</Btn>
      </div>
      {open && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Detalhes que a loja preenche em cada produto desta categoria. O servidor confere tipo, opções e obrigatórios.</p>
          {attrs.map((a, n) => (
            <div key={n} className="flex flex-wrap gap-2 items-center">
              <input value={a.key} onChange={(e) => upd(n, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="chave" className={`${i} w-32`} aria-label="Chave" />
              <input value={a.label} onChange={(e) => upd(n, { label: e.target.value })} placeholder="Nome mostrado" className={`${i} flex-1 min-w-[8rem]`} aria-label="Nome" />
              <select value={a.type} onChange={(e) => upd(n, { type: e.target.value })} className={i} aria-label="Tipo">{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {a.type === "select" && <input value={(a.options || []).join(", ")} onChange={(e) => upd(n, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="opções, separadas, por vírgula" className={`${i} flex-1 min-w-[10rem]`} aria-label="Opções" />}
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!a.required} onChange={(e) => upd(n, { required: e.target.checked })} />obrigatório</label>
              <button type="button" onClick={() => setAttrs((x) => x.filter((_, k) => k !== n))} className="text-xs text-destructive underline">remover</button>
            </div>
          ))}
          <div className="flex gap-2">
            <Btn onClick={() => setAttrs((x) => [...x, { key: "", label: "", type: "text" }])}>Adicionar atributo</Btn>
            <Btn variant="primary" busy={busy === "save"} onClick={() => run("save", () => base44.admin.saveCategory({ id: c.id, attributes_schema: attrs }))}>Salvar atributos</Btn>
          </div>
          <ErrorLine error={error} />
        </div>
      )}
    </Card>
  );
}

export default function CategoriesAdmin() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-categories-full"], queryFn: () => base44.admin.categoriesFull() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-categories-full"] });
  const { busy, error, run } = useAction(refresh);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("goods");
  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap gap-2 items-center">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria (ex.: Ótica)" className="h-10 flex-1 min-w-[12rem] rounded-xl border border-border bg-card px-3 text-sm" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm"><option value="goods">Produtos</option><option value="services">Serviços</option></select>
        <Btn variant="primary" busy={busy === "new"} disabled={name.trim().length < 2} onClick={() => run("new", async () => { await base44.admin.saveCategory({ name, kind, active: false }); setName(""); })}>Criar (inativa)</Btn>
        <ErrorLine error={error} />
      </Card>
      <p className="text-xs text-muted-foreground">Categorias com regras sanitárias, fiscais ou de idade (farmácia, bebidas, agrotóxicos, armas, etc.) só devem ser ativadas depois da validação jurídica.</p>
      {data.map((c) => <Category key={c.id} c={c} onSaved={refresh} />)}
    </div>
  );
}
