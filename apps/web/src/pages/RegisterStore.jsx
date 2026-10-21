import React, { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, FULFILLMENT, FULFILLMENT_CHOICES } from "@/lib/constants";

export default function RegisterStore() {
  const [form, setForm] = useState({ name: "", category: "alimentacao", owner_name: "", cnpj_cpf: "", description: "", phone: "", address: "", city: "Sidrolândia", opening_hours: "", delivery_fee: "", pix_key: "", delivery_modes: ["loja", "retirada"] });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (m) => setForm((f) => ({ ...f, delivery_modes: f.delivery_modes.includes(m) ? f.delivery_modes.filter((x) => x !== m) : [...f.delivery_modes, m] }));
  const chip = (on) => `h-10 px-4 rounded-full border text-sm transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await base44.entities.Store.create({ ...form, delivery_fee: Number(form.delivery_fee) || 0, status: "pending", is_open: true });
      setDone(true);
    } catch (err) {
      setError(err?.message || "Não foi possível enviar o cadastro. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto px-5 py-32 text-center">
        <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground mx-auto flex items-center justify-center"><Check /></div>
        <h1 className="font-display text-4xl mt-6">Cadastro enviado</h1>
        <p className="text-muted-foreground mt-3">Assim que for aprovada, sua loja aparece no app. Enquanto isso, já pode montar seu catálogo.</p>
        <a href="/" className="inline-block mt-8 h-12 leading-[3rem] px-8 rounded-full bg-primary text-primary-foreground font-semibold">Ir para o painel</a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-14">
      <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Sem mensalidade</p>
      <h1 className="font-display font-light text-5xl mt-3 tracking-tight">Leve sua loja para o <em className="text-primary">VizinhoMarket</em>.</h1>
      <form onSubmit={submit} className="mt-10 space-y-5">
        <Input required placeholder="Nome da loja" value={form.name} onChange={set("name")} className="h-12 rounded-xl" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input required placeholder="Responsável (nome completo)" value={form.owner_name} onChange={set("owner_name")} className="h-12 rounded-xl" />
          <Input required placeholder="CNPJ ou CPF" value={form.cnpj_cpf} onChange={set("cnpj_cpf")} className="h-12 rounded-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => <button type="button" key={c.id} onClick={() => setForm((f) => ({ ...f, category: c.id }))} className={chip(form.category === c.id)}>{c.label}</button>)}
        </div>
        <Textarea placeholder="Descreva sua loja em uma frase" value={form.description} onChange={set("description")} className="rounded-xl" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input required placeholder="Telefone / WhatsApp" value={form.phone} onChange={set("phone")} className="h-12 rounded-xl" />
          <Input placeholder="Horário (ex: Seg–Sáb, 8h–18h)" value={form.opening_hours} onChange={set("opening_hours")} className="h-12 rounded-xl" />
        </div>
        <Input required placeholder="Endereço" value={form.address} onChange={set("address")} className="h-12 rounded-xl" />
        <Input required placeholder="Cidade" value={form.city} onChange={set("city")} className="h-12 rounded-xl max-w-xs" />
        <Input type="number" step="0.01" placeholder="Taxa de entrega (R$)" value={form.delivery_fee} onChange={set("delivery_fee")} className="h-12 rounded-xl max-w-xs" />
        <Input placeholder="Chave Pix da loja (opcional)" value={form.pix_key} onChange={set("pix_key")} className="h-12 rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {Object.entries(FULFILLMENT).filter(([k]) => FULFILLMENT_CHOICES.includes(k) || form.delivery_modes.includes(k)).map(([k, l]) => <button type="button" key={k} onClick={() => toggle(k)} className={chip(form.delivery_modes.includes(k))}>{l}</button>)}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy || !form.delivery_modes.length} className="h-12 px-8 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enviar cadastro
        </button>
      </form>
    </div>
  );
}