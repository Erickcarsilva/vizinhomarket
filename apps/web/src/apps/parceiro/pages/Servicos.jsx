import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

const UNIT = { a_combinar: "A combinar", hora: "Por hora", visita: "Por visita", servico: "Pelo serviço" };
const EMPTY = { name: "", description: "", price_from: "", price_unit: "a_combinar", duration_min: "" };

// Lista de serviços do prestador (aparece na página dele para o cliente escolher antes de pedir orçamento).
export default function Servicos() {
  const { store } = useOutletContext();
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["offerings", store?.id], queryFn: () => base44.services.offerings(store.id), enabled: !!store });
  const [f, setF] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: "" });
  if (!store) return null;
  const run = async (fn) => { setState({ busy: true, error: "" }); try { await fn(); qc.invalidateQueries({ queryKey: ["offerings", store.id] }); setState({ busy: false, error: "" }); } catch (e) { setState({ busy: false, error: e.message }); } };
  const input = "w-full h-11 rounded-xl border border-border bg-card px-3 text-sm";
  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-[13px] font-semibold text-muted-foreground">Serviços</p>
        <h1 className="font-display text-4xl mt-2">O que você faz</h1>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => { await base44.services.saveOffering(store.id, f); setF(EMPTY); }); }} className="rounded-2xl border border-border bg-card p-5 grid sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1 sm:col-span-2">Nome do serviço<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.slice(0, 120) })} placeholder="Ex.: Instalação de chuveiro" className={input} /></label>
        <label className="text-sm space-y-1 sm:col-span-2">Descrição<textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value.slice(0, 1000) })} rows={2} className={`${input} h-auto py-2`} /></label>
        <label className="text-sm space-y-1">Preço a partir de (R$, opcional)<input value={f.price_from} onChange={(e) => setF({ ...f, price_from: e.target.value })} inputMode="decimal" className={input} /></label>
        <label className="text-sm space-y-1">Cobrança<select value={f.price_unit} onChange={(e) => setF({ ...f, price_unit: e.target.value })} className={input}>{Object.entries(UNIT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="text-sm space-y-1">Duração média (min, opcional)<input value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value.replace(/\D/g, "") })} className={input} /></label>
        <div className="sm:col-span-2 flex gap-3 items-center"><button disabled={state.busy || f.name.trim().length < 2} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 disabled:opacity-40">{state.busy && <Loader2 className="w-4 h-4 animate-spin" />}Adicionar serviço</button>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}</div>
      </form>
      {isLoading ? null : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {list.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum serviço cadastrado.</p>}
          {list.map((o) => (
            <div key={o.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{o.name}</p>
                <p className="text-xs text-muted-foreground">{o.price_from != null ? `a partir de ${brl(o.price_from)} · ` : ""}{UNIT[o.price_unit]}{o.duration_min ? ` · ${o.duration_min} min` : ""}</p>
              </div>
              <button onClick={() => run(() => base44.services.saveOffering(store.id, { ...o, active: !o.active }))} className="h-8 px-3 rounded-full text-xs border border-border">{o.active ? "Ocultar" : "Mostrar"}</button>
              <button onClick={() => window.confirm("Remover este serviço?") && run(() => base44.services.removeOffering(o.id))} aria-label="Remover" className="h-8 w-8 rounded-full border border-border flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
