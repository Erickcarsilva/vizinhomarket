import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FULFILLMENT } from "@/lib/constants";

const F = ({ label, children }) => <label className="block"><span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">{label}</span><div className="mt-2">{children}</div></label>;

export default function StoreSettings({ store, onSaved }) {
  const [form, setForm] = useState(store);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const modes = form.delivery_modes || [];
  const toggleMode = (m) => setForm((f) => ({ ...f, delivery_modes: modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m] }));

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    setForm((f) => ({ ...f, cover_url: file_url }));
    setBusy(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    await base44.entities.Store.update(store.id, {
      name: form.name, description: form.description, phone: form.phone, address: form.address,
      opening_hours: form.opening_hours, is_open: form.is_open, cover_url: form.cover_url, delivery_modes: modes,
      delivery_fee: Number(form.delivery_fee) || 0, min_order: Number(form.min_order) || 0, delivery_time_min: Number(form.delivery_time_min) || 40,
    });
    setBusy(false);
    onSaved();
  };

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between bg-card border border-border rounded-2xl p-5">
        <div><p className="font-semibold">Loja aberta</p><p className="text-sm text-muted-foreground">Desative para pausar novos pedidos</p></div>
        <Switch checked={!!form.is_open} onCheckedChange={(v) => setForm((f) => ({ ...f, is_open: v }))} />
      </div>
      <F label="Nome"><Input value={form.name} onChange={set("name")} /></F>
      <F label="Descrição"><Textarea value={form.description || ""} onChange={set("description")} /></F>
      <div className="grid sm:grid-cols-2 gap-4">
        <F label="Telefone"><Input value={form.phone || ""} onChange={set("phone")} /></F>
        <F label="Horário"><Input value={form.opening_hours || ""} onChange={set("opening_hours")} placeholder="Seg–Sáb, 18h–23h" /></F>
      </div>
      <F label="Endereço"><Input value={form.address || ""} onChange={set("address")} /></F>
      <div className="grid grid-cols-3 gap-4">
        <F label="Taxa (R$)"><Input type="number" step="0.01" value={form.delivery_fee ?? ""} onChange={set("delivery_fee")} /></F>
        <F label="Mínimo (R$)"><Input type="number" step="0.01" value={form.min_order ?? ""} onChange={set("min_order")} /></F>
        <F label="Tempo (min)"><Input type="number" value={form.delivery_time_min ?? ""} onChange={set("delivery_time_min")} /></F>
      </div>
      <F label="Modos de entrega">
        <div className="flex flex-wrap gap-2">
          {Object.entries(FULFILLMENT).map(([k, l]) => (
            <button type="button" key={k} onClick={() => toggleMode(k)} className={`h-10 px-4 rounded-full border text-sm transition ${modes.includes(k) ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
          ))}
        </div>
      </F>
      <F label="Foto de capa"><input type="file" accept="image/*" onChange={upload} className="text-sm" /></F>
      <button disabled={busy || !modes.length} className="h-12 px-8 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar alterações
      </button>
    </form>
  );
}