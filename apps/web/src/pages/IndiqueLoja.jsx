import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CATEGORIES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const Label = ({ children, htmlFor }) => <label htmlFor={htmlFor} className="block text-sm font-semibold mb-1.5">{children}</label>;
const campo = "h-12 rounded-lg bg-card text-[15px]";

export default function IndiqueLoja() {
  const [form, setForm] = useState({ store_name: "", category: "", owner_name: "", contact: "", address: "", city: "Sidrolândia", notes: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.store_name.trim() && form.contact.trim();

  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await base44.entities.StoreReferral.create(form);
      setDone(true);
    } catch (err) {
      setError(/login|auth|JWT/i.test(err?.message || "") ? "Entre na sua conta para enviar a indicação." : "Não foi possível enviar agora. Tente de novo em instantes.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-[#E5DDCE] text-marca flex items-center justify-center mx-auto"><Check className="w-7 h-7" aria-hidden="true" /></div>
        <h1 className="font-display text-2xl text-marca mt-5">Obrigado pela indicação!</h1>
        <p className="text-muted-foreground mt-4">Vamos entrar em contato com a loja para convidá-la a fazer parte do VizinhoMarket.</p>
        <Link to="/" className="btn-contorno mt-6">Voltar para as lojas</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-6">
      <div>
        <h1 className="font-display text-2xl text-marca">Conhece um comércio legal?</h1>
        <p className="text-[15px] text-muted-foreground mt-1">Indique para a gente. Entraremos em contato para convidar a loja a integrar o VizinhoMarket.</p>
      </div>
      <div className="space-y-4 bg-card border border-border rounded-lg p-4 sm:p-5">
        <div>
          <Label htmlFor="ind-store_name">Nome da loja *</Label>
          <Input required value={form.store_name} id="ind-store_name" onChange={set("store_name")} className={campo} placeholder="Ex.: Padaria do Bairro" />
        </div>
        <div>
          <Label htmlFor="ind-category">Categoria</Label>
          <select value={form.category} id="ind-category" onChange={set("category")} className="flex h-12 w-full rounded-lg border border-input bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Selecione...</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ind-owner_name">Responsável</Label>
            <Input value={form.owner_name} id="ind-owner_name" onChange={set("owner_name")} className={campo} placeholder="Nome de quem comandar a loja" />
          </div>
          <div>
            <Label htmlFor="ind-contact">Contato *</Label>
            <Input required value={form.contact} id="ind-contact" onChange={set("contact")} className={campo} placeholder="WhatsApp, telefone ou e-mail" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ind-address">Endereço</Label>
            <Input value={form.address} id="ind-address" onChange={set("address")} className={campo} placeholder="Rua, número, bairro" />
          </div>
          <div>
            <Label htmlFor="ind-city">Cidade</Label>
            <Input value={form.city} id="ind-city" onChange={set("city")} className={campo} />
          </div>
        </div>
        <div>
          <Label htmlFor="ind-notes">Observações</Label>
          <Textarea value={form.notes} id="ind-notes" onChange={set("notes")} className="rounded-lg bg-card text-[15px]" placeholder="Conte por que essa loja deveria estar aqui (opcional)" />
        </div>
      </div>
      <button disabled={!valid || sending} className="btn-acao w-full">
        {sending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Enviar indicação
      </button>
      {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}
    </form>
  );
}