import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useOutletContext } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Image } from "@/components/ui/image";

const F = ({ label, children }) => (
  <label className="block">
    <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">{label}</span>
    <div className="mt-2">{children}</div>
  </label>
);

function ProfileForm({ store, onSaved }) {
  const [form, setForm] = useState(store);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const set = (k) => (e) => { setMsg(null); setForm((f) => ({ ...f, [k]: e.target.value })); };

  const upload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, [field]: file_url }));
      setMsg({ ok: true, text: "Imagem enviada. Clique em Salvar para aplicar." });
    } catch (err) {
      setMsg({ ok: false, text: err?.message || "Não foi possível enviar a imagem." });
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await base44.entities.Store.update(store.id, {
        name: form.name,
        description: form.description,
        opening_hours: form.opening_hours,
        logo_url: form.logo_url,
        cover_url: form.cover_url,
      });
      setMsg({ ok: true, text: "Alterações salvas." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err?.message || "Não foi possível salvar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <F label="Logomarca">
        <input type="file" accept="image/*" onChange={(e) => upload(e, "logo_url")} className="text-sm" />
        {form.logo_url && <div className="mt-3 w-28 h-28 rounded-2xl overflow-hidden border border-border bg-secondary"><Image src={form.logo_url} fittingType="fit" /></div>}
      </F>
      <F label="Capa">
        <input type="file" accept="image/*" onChange={(e) => upload(e, "cover_url")} className="text-sm" />
        {form.cover_url && <div className="mt-3 h-44 rounded-2xl overflow-hidden border border-border bg-secondary"><Image src={form.cover_url} fittingType="fill" /></div>}
      </F>
      <F label="Nome da loja"><Input value={form.name || ""} onChange={set("name")} className="h-12" /></F>
      <F label="Descrição"><Textarea value={form.description || ""} onChange={set("description")} placeholder="Descreva sua loja para os clientes" /></F>
      <F label="Horário de funcionamento"><Input value={form.opening_hours || ""} onChange={set("opening_hours")} placeholder="Seg–Sáb, 8h–18h" className="h-12" /></F>
      <button disabled={busy} className="h-12 px-8 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
    </form>
  );
}

export default function EditStoreProfile() {
  // A loja vem do menu lateral do painel (um seletor só).
  const { store } = useOutletContext();
  const qc = useQueryClient();
  if (!store) return null;
  return (
    <div className="max-w-3xl mx-auto px-5 py-12 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Perfil da loja</p>
          <h1 className="font-display text-4xl mt-2">Como os clientes te veem</h1>
        </div>
      </div>
      {store && <ProfileForm key={store.id} store={store} onSaved={() => qc.invalidateQueries({ queryKey: ["stores"] })} />}
    </div>
  );
}