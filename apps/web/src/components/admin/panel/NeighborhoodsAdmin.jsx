import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Textarea } from "@/components/ui/textarea";
import { Card, Btn, ErrorLine, useAction, Chip } from "./ui";

// Bairros da cidade: usados pelo cliente no endereço e pela loja na taxa por bairro.
export default function NeighborhoodsAdmin() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ["admin-neighborhoods"], queryFn: () => base44.admin.listNeighborhoods() });
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const { busy, error, run } = useAction(() => Promise.all([
    qc.invalidateQueries({ queryKey: ["admin-neighborhoods"] }), qc.invalidateQueries({ queryKey: ["neighborhoods"] }),
  ]));
  const names = text.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const add = () => run("add", async () => {
    const n = await base44.admin.addNeighborhoods(names);
    setText("");
    setMsg(n ? `${n} bairro(s) cadastrado(s).` : "Nenhum bairro novo (todos já estavam na lista).");
  });

  return (
    <div data-neighborhoods>
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Bairros de Sidrolândia</h3>
        <p className="text-xs text-muted-foreground mt-1">O cliente escolhe o bairro no pedido e cada loja define a taxa por bairro. Desativar um bairro tira ele das listas, sem apagar pedidos antigos.</p>
      </div>
      <label className="block text-xs text-muted-foreground">Cole os nomes, um por linha
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} rows={5} placeholder={"Centro\nJardim Pindorama\nVila Nova"} className="mt-1" />
      </label>
      <div className="flex items-center gap-3">
        <Btn variant="primary" busy={busy === "add"} disabled={!names.length} onClick={add}>Cadastrar {names.length || ""} bairro(s)</Btn>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>
      <ErrorLine error={error} />
      <p className="text-sm text-muted-foreground">{list.filter((n) => n.active).length} ativo(s) de {list.length}</p>
      <div className="flex flex-wrap gap-2">
        {list.map((n) => (
          <button key={n.id} type="button" disabled={busy === n.id} onClick={() => run(n.id, () => base44.admin.setNeighborhoodActive(n.id, !n.active))}
            title={n.active ? "Clique para desativar" : "Clique para reativar"} className="disabled:opacity-50">
            <Chip tone={n.active ? "ok" : "default"}>{n.name}{n.active ? "" : " (inativo)"}</Chip>
          </button>
        ))}
      </div>
    </Card>
    </div>
  );
}
