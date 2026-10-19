import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CATEGORIES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const Label = ({ children }) => <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-2">{children}</p>;

export default function IndiqueLoja() {
  const [form, setForm] = useState({ store_name: "", category: "", owner_name: "", contact: "", address: "", city: "Sidrolândia", notes: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.store_name.trim() && form.contact.trim();

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    await base44.entities.StoreReferral.create(form);
    setSending(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto"><Check className="w-7 h-7" /></div>
        <h1 className="font-display text-4xl mt-6">Obrigado pela indicação!</h1>
        <p className="text-muted-foreground mt-4">Vamos entrar em contato com a loja para convidá-la a fazer parte do VizinhoMarket.</p>
        <Link to="/vitrine" className="inline-flex items-center mt-8 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold">Voltar para a vitrine</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto px-5 py-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Indique uma loja</p>
        <h1 className="font-display text-4xl mt-2">Conhece um comércio legal?</h1>
        <p className="text-muted-foreground mt-3">Indique para a gente. Entraremos em contato para convidar a loja a integrar o VizinhoMarket.</p>
      </div>
      <div className="space-y-5">
        <div>
          <Label>Nome da loja *</Label>
          <Input required value={form.store_name} onChange={set("store_name")} className="h-12 rounded-xl" placeholder="Ex.: Padaria do Bairro" />
        </div>
        <div>
          <Label>Categoria</Label>
          <select value={form.category} onChange={set("category")} className="flex h-12 w-full rounded-xl border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="">Selecione...</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Responsável</Label>
            <Input value={form.owner_name} onChange={set("owner_name")} className="h-12 rounded-xl" placeholder="Nome de quem comandar a loja" />
          </div>
          <div>
            <Label>Contato *</Label>
            <Input required value={form.contact} onChange={set("contact")} className="h-12 rounded-xl" placeholder="WhatsApp, telefone ou e-mail" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Endereço</Label>
            <Input value={form.address} onChange={set("address")} className="h-12 rounded-xl" placeholder="Rua, número, bairro" />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city} onChange={set("city")} className="h-12 rounded-xl" />
          </div>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea value={form.notes} onChange={set("notes")} className="rounded-xl" placeholder="Conte por que essa loja deveria estar aqui (opcional)" />
        </div>
      </div>
      <button disabled={!valid || sending} className="w-full h-12 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition">
        {sending && <Loader2 className="w-4 h-4 animate-spin" />} Enviar indicação
      </button>
    </form>
  );
}