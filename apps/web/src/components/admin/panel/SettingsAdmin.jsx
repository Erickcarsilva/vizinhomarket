import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Card, Btn, ErrorLine, useAction, pct } from "./ui";
import NeighborhoodsAdmin from "./NeighborhoodsAdmin";

const toPct = (r) => (r == null ? "" : String(Math.round(r * 10000) / 100).replace(".", ","));
const fromPct = (s) => { const v = String(s).replace(",", ".").trim(); return v === "" ? null : Number(v) / 100; };

export default function SettingsAdmin() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin-settings"], queryFn: () => base44.admin.getSettings() });
  const { data: cats = [] } = useQuery({ queryKey: ["admin-categories"], queryFn: () => base44.admin.listCategories() });
  const [form, setForm] = useState({ commission: "", timeout: "", pix: "" });
  const [catRates, setCatRates] = useState({});
  const [saved, setSaved] = useState("");
  const { busy, error, run, setError } = useAction(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-settings"] }), qc.invalidateQueries({ queryKey: ["admin-categories"] }), qc.invalidateQueries({ queryKey: ["admin-store-rates"] })]);
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      commission: toPct(settings.default_commission_rate != null ? Number(settings.default_commission_rate) : null),
      timeout: settings.order_accept_timeout_min != null ? String(settings.order_accept_timeout_min) : "15",
      pix: settings.platform_pix_key ? String(settings.platform_pix_key) : "",
    });
  }, [settings]);

  const saveGeneral = () => run("gen", async () => {
    const c = fromPct(form.commission); const t = Number(form.timeout);
    if (c == null || Number.isNaN(c) || c < 0 || c > 0.5) throw new Error("Comissão padrão deve ficar entre 0 e 50%.");
    if (!Number.isInteger(t) || t < 5 || t > 120) throw new Error("Tempo limite deve ficar entre 5 e 120 minutos.");
    await base44.admin.setSetting("default_commission_rate", c);
    await base44.admin.setSetting("order_accept_timeout_min", t);
    await base44.admin.setSetting("platform_pix_key", form.pix.trim());
    setSaved("Configurações salvas.");
  });
  const saveCat = (c) => run(`c-${c.id}`, async () => {
    const r = fromPct(catRates[c.id] ?? toPct(c.rate));
    if (r == null) throw new Error("Informe a comissão da categoria (para usar o padrão, coloque o mesmo valor do padrão).");
    if (Number.isNaN(r) || r < 0 || r > 0.5) throw new Error("Comissão deve ficar entre 0 e 50%.");
    await base44.admin.setCategoryRate(c.id, r);
  });

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Geral</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="text-xs text-muted-foreground">Comissão padrão (%)
            <Input value={form.commission} onChange={(e) => { setForm((f) => ({ ...f, commission: e.target.value })); setSaved(""); setError(""); }} inputMode="decimal" className="h-10 mt-1" />
          </label>
          <label className="text-xs text-muted-foreground">Tempo para a loja aceitar (min)
            <Input value={form.timeout} onChange={(e) => { setForm((f) => ({ ...f, timeout: e.target.value })); setSaved(""); }} inputMode="numeric" className="h-10 mt-1" />
          </label>
          <label className="text-xs text-muted-foreground">Sua chave Pix (cobrança das lojas)
            <Input value={form.pix} onChange={(e) => { setForm((f) => ({ ...f, pix: e.target.value })); setSaved(""); }} className="h-10 mt-1" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Btn variant="primary" busy={busy === "gen"} onClick={saveGeneral}>Salvar</Btn>
          {saved && <span className="text-sm text-primary">{saved}</span>}
        </div>
        <p className="text-xs text-muted-foreground">A comissão vale para os pedidos novos. Ordem: comissão negociada da loja → comissão da categoria → padrão.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Comissão por categoria</h3>
        <ErrorLine error={error} />
        <div className="divide-y divide-border">
          {cats.map((c) => (
            <div key={c.id} className="py-2 flex items-center gap-3">
              <span className="flex-1 text-sm">{c.name} <span className="text-xs text-muted-foreground">(atual: {c.rate == null ? `padrão ${pct(settings?.default_commission_rate != null ? Number(settings.default_commission_rate) : null)}` : pct(c.rate)})</span></span>
              <Input value={catRates[c.id] ?? toPct(c.rate)} onChange={(e) => setCatRates((x) => ({ ...x, [c.id]: e.target.value }))} placeholder="%" inputMode="decimal" className="h-9 w-20" />
              <Btn busy={busy === `c-${c.id}`} onClick={() => saveCat(c)}>Salvar</Btn>
            </div>
          ))}
        </div>
      </Card>
      <NeighborhoodsAdmin />
    </div>
  );
}
