import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { brl } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const UNIT = { hora: "por hora", visita: "por visita", servico: "pelo serviço", a_combinar: "" };

// Página de prestador de serviço: lista o que ele faz e o pedido de orçamento (sem carrinho, sem entrega).
export default function ServiceStore({ store }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: offerings = [], isLoading } = useQuery({ queryKey: ["offerings", store.id], queryFn: () => base44.services.offerings(store.id) });
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => base44.account.getProfile(), enabled: isAuthenticated });
  const { data: addresses = [] } = useQuery({ queryKey: ["my-addresses"], queryFn: () => base44.account.listAddresses(), enabled: isAuthenticated });
  const [pick, setPick] = useState(null);
  const [f, setF] = useState({ description: "", window: "", phone: "", address_id: "" });
  const [state, setState] = useState({ busy: false, error: "" });

  const submit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) { navigate(`/login?returnTo=${encodeURIComponent(`/loja/${store.id}`)}`); return; }
    setState({ busy: true, error: "" });
    try {
      const id = await base44.services.request({
        storeId: store.id, offeringId: pick, description: f.description, window: f.window,
        name: profile?.full_name || "Cliente", phone: f.phone || profile?.phone || "", addressId: f.address_id || (addresses.find((a) => a.is_default) || addresses[0])?.id,
      });
      navigate(`/orcamento/${id}`);
    } catch (err) { setState({ busy: false, error: err.message }); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-6 grid md:grid-cols-[minmax(0,1fr)_340px] gap-8">
      <section aria-label="Serviços oferecidos" className="space-y-3 min-w-0">
        <h2 className="font-display text-[22px]">Serviços</h2>
        {isLoading ? <div className="h-24 rounded-lg bg-secondary animate-pulse" /> : offerings.length === 0 ? (
          <p className="text-muted-foreground">O prestador ainda não listou os serviços. Descreva o que precisa e peça um orçamento.</p>
        ) : offerings.map((o) => (
          <button key={o.id} type="button" onClick={() => setPick(pick === o.id ? null : o.id)} aria-pressed={pick === o.id}
            className={`w-full text-left rounded-lg border bg-card p-4 transition ${pick === o.id ? "border-marca ring-1 ring-marca" : "border-border hover:border-marca/40"}`}>
            <div className="flex justify-between gap-3">
              <p className="text-[16px] font-semibold">{o.name}</p>
              {o.price_from != null && <p className="text-sm font-semibold whitespace-nowrap">a partir de {brl(o.price_from)} <span className="font-normal text-muted-foreground">{UNIT[o.price_unit]}</span></p>}
            </div>
            {o.description && <p className="text-sm text-muted-foreground mt-1">{o.description}</p>}
            {o.duration_min && <p className="text-[13px] text-muted-foreground mt-2 flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" />cerca de {o.duration_min} min</p>}
          </button>
        ))}
      </section>
      <form onSubmit={submit} className="h-fit md:sticky md:top-24 rounded-lg border border-border bg-card p-5 space-y-3" aria-label="Pedir orçamento">
        <h2 className="font-display text-[20px]">Pedir orçamento</h2>
        <p className="text-[13px] text-muted-foreground">Grátis e sem compromisso. O prestador responde com o valor; você decide se aceita. Seu telefone e endereço só são liberados depois do aceite.</p>
        <Textarea required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value.slice(0, 2000) })} placeholder="Descreva o que precisa (o que é, onde, tamanho, urgência)" aria-label="Descrição do serviço" rows={4} className="rounded-lg text-[15px]" />
        <Input value={f.window} onChange={(e) => setF({ ...f, window: e.target.value.slice(0, 200) })} placeholder="Melhor dia e horário (opcional)" aria-label="Melhor dia e horário" className="h-11 rounded-lg" />
        {isAuthenticated && !profile?.phone && <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} type="tel" placeholder="WhatsApp com DDD" aria-label="WhatsApp com DDD" className="h-11 rounded-lg" />}
        {addresses.length > 1 && (
          <select value={f.address_id} onChange={(e) => setF({ ...f, address_id: e.target.value })} aria-label="Endereço do serviço" className="w-full h-11 rounded-lg border border-input bg-card px-3 text-[15px]">
            <option value="">Endereço principal</option>
            {addresses.map((a) => <option key={a.id} value={a.id}>{a.line}</option>)}
          </select>
        )}
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        <button className="btn-acao w-full h-12" disabled={state.busy || f.description.trim().length < 10}>
          {state.busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{isAuthenticated ? "Enviar pedido de orçamento" : "Entrar para pedir orçamento"}
        </button>
      </form>
    </div>
  );
}
