import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl } from "@/lib/constants";

// Taxa de entrega por bairro. Nenhum bairro marcado = a loja entrega na cidade toda com a taxa única.
// Com bairros marcados, o cliente só consegue pedir para esses bairros, e paga a taxa de cada um.
export default function DeliveryZones({ store }) {
  const qc = useQueryClient();
  const { data: all = [], isLoading: l1 } = useQuery({ queryKey: ["neighborhoods"], queryFn: () => base44.geo.neighborhoods(store.city_id) });
  const { data: zones = [], isLoading: l2 } = useQuery({ queryKey: ["zones", store.id], queryFn: () => base44.partner.zones(store.id) });
  const [fees, setFees] = useState({}); // neighborhood_id -> texto da taxa ("" = não entrega)
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setFees(Object.fromEntries(zones.map((z) => [z.neighborhood_id, z.fee.toFixed(2).replace(".", ",")]))); }, [zones]);

  const marked = Object.entries(fees).filter(([, v]) => v !== "" && v != null);
  const shown = useMemo(() => all.filter((n) => n.name.toLowerCase().includes(filter.trim().toLowerCase())), [all, filter]);
  const toggle = (id) => setFees((f) => { const n = { ...f }; if (id in n && n[id] !== "") delete n[id]; else n[id] = String(store.delivery_fee || 0); return n; });
  const setFee = (id, v) => setFees((f) => ({ ...f, [id]: v }));
  const markAll = () => setFees(Object.fromEntries(all.map((n) => [n.id, fees[n.id] || String(store.delivery_fee || 0)])));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const list = marked.map(([id, v]) => ({ neighborhood_id: id, fee: Number(String(v).replace(",", ".")) }));
      if (list.some((z) => Number.isNaN(z.fee))) throw new Error("Confira as taxas: use só números, por exemplo 5 ou 7,50.");
      await base44.partner.setZones(store.id, list);
      await qc.invalidateQueries({ queryKey: ["zones", store.id] });
      await qc.invalidateQueries({ queryKey: ["stores"] });
      setMsg({ ok: true, text: list.length ? `Taxas salvas para ${list.length} bairro(s).` : "Pronto: a loja volta a usar a taxa única para a cidade toda." });
    } catch (err) {
      setMsg({ ok: false, text: err?.message || "Não foi possível salvar." });
    } finally { setBusy(false); }
  };

  if (l1 || l2) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando bairros…</div>;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 space-y-4" data-zones>
      <div>
        <h2 className="font-display text-2xl">Taxa por bairro</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {marked.length
            ? `Você entrega em ${marked.length} bairro(s). Pedidos de outros bairros não são aceitos.`
            : `Nenhum bairro marcado: você entrega na cidade toda pela taxa única (${brl(store.delivery_fee || 0)}).`}
        </p>
      </div>
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">Os bairros da cidade ainda não foram cadastrados pela plataforma.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar bairro" className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm" />
            </div>
            <button type="button" onClick={markAll} className="h-10 px-4 rounded-full border border-border text-sm hover:bg-secondary">Marcar todos</button>
            <button type="button" onClick={() => setFees({})} className="h-10 px-4 rounded-full border border-border text-sm hover:bg-secondary">Desmarcar todos</button>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border rounded-xl border border-border">
            {shown.map((n) => {
              const on = n.id in fees && fees[n.id] !== "";
              return (
                <div key={n.id} className="flex items-center gap-3 px-4 py-2.5" data-zone={n.name}>
                  <input type="checkbox" checked={on} onChange={() => toggle(n.id)} aria-label={`Entrego no ${n.name}`} className="w-5 h-5 accent-[hsl(var(--primary))]" />
                  <span className="flex-1 text-sm">{n.name}</span>
                  {on && (
                    <label className="flex items-center gap-1 text-sm">
                      R$
                      <input inputMode="decimal" value={fees[n.id]} onChange={(e) => setFee(n.id, e.target.value)} aria-label={`Taxa ${n.name}`} className="w-20 h-9 px-2 rounded-lg border border-border bg-background text-right" />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar taxas por bairro
          </button>
        </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
    </section>
  );
}
