import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useCart } from "@/lib/CartContext";
import { brl, FULFILLMENT, PAYMENT } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CartItems from "@/components/checkout/CartItems";
import ChoiceGroup from "@/components/checkout/ChoiceGroup";
import SavedAddresses from "@/components/checkout/SavedAddresses";

const Label = ({ children }) => <p className="text-base font-bold mb-3">{children}</p>;

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, subtotal, clear, reprice } = useCart();
  const qc = useQueryClient();
  const modes = cart.store?.delivery_modes?.length ? cart.store.delivery_modes : ["loja"];
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => base44.account.getProfile() });
  const { data: addresses = [] } = useQuery({ queryKey: ["my-addresses"], queryFn: () => base44.account.listAddresses() });
  // Bairros atendidos pela loja (se ela cadastrou taxa por bairro).
  const { data: zones = [] } = useQuery({ queryKey: ["zones", cart.store?.id], queryFn: () => base44.geo.storeZones(cart.store.id), enabled: !!cart.store?.id });
  const [form, setForm] = useState({ name: "", phone: "", address: "", neighborhood_id: "", fulfillment: modes[0], payment: "pix", change_for: "", notes: "" });
  // Preenche com o que está salvo na conta, sem apagar o que a pessoa já digitou.
  useEffect(() => {
    const def = addresses.find((a) => a.is_default) || addresses[0];
    setForm((f) => ({ ...f, name: f.name || profile?.full_name || "", phone: f.phone || profile?.phone || "", address: f.address || def?.line || "", neighborhood_id: f.neighborhood_id || (!f.address && def?.neighborhood_id) || "" }));
  }, [profile, addresses]);
  const [sending, setSending] = useState(false);
  // Uma chave por tentativa de compra: se o clique repetir ou a conexão cair, o servidor devolve o mesmo pedido.
  const [idempotencyKey] = useState(() => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [error, setError] = useState("");
  // Itens +18: o servidor pede a confirmação de maioridade (VMAGE) e o pedido segue depois dela.
  const [age, setAge] = useState({ needed: false, birth: "", declared: false, busy: false });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  if (!cart.items.length) {
    return (
      <div className="max-w-md mx-auto px-5 py-32 text-center">
        <h1 className="font-display text-4xl">Seu carrinho está vazio</h1>
        <Link to="/" className="inline-block mt-8 h-12 leading-[3rem] px-8 rounded-full bg-primary text-primary-foreground font-semibold">Explorar lojas</Link>
      </div>
    );
  }

  const pickup = form.fulfillment === "retirada";
  const byZone = !pickup && zones.length > 0;
  const zone = zones.find((z) => z.neighborhood_id === form.neighborhood_id);
  const fee = pickup ? 0 : byZone ? (zone?.fee ?? 0) : cart.store.delivery_fee;
  const total = subtotal + fee;
  const belowMin = subtotal < (cart.store.min_order || 0);
  const valid = form.name && form.phone && (pickup || form.address) && (!byZone || zone) && !belowMin;

  const placeOrder = async () => {
    setSending(true);
    setError("");
    try {
      const order = await base44.entities.Order.create({
        store_id: cart.store.id, idempotency_key: idempotencyKey,
        customer_name: form.name, customer_phone: form.phone, address: pickup ? "" : form.address,
        neighborhood_id: byZone ? form.neighborhood_id : null,
        fulfillment: form.fulfillment, payment_method: form.payment,
        change_for: form.payment === "dinheiro" && form.change_for ? Number(form.change_for) : undefined,
        notes: form.notes,
        expected_total: total,
        items: cart.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, addon_ids: i.addon_ids || [], quantity: i.quantity })),
      });
      // Guarda nome e telefone na conta para o próximo pedido (falha aqui não atrapalha o pedido).
      if (profile && (profile.full_name !== form.name || profile.phone !== form.phone)) {
        base44.account.updateProfile({ full_name: form.name, phone: form.phone }).catch(() => {});
      }
      clear();
      navigate(`/pedido/${order.id}`);
    } catch (err) {
      setSending(false);
      if (err?.code === "VMAGE") { setAge((a) => ({ ...a, needed: true })); return; }
      if (err?.code === "VMPRC") {
        // O preço ou a taxa mudaram: atualiza o carrinho com os valores do servidor e pede nova confirmação.
        let d = null;
        try { d = JSON.parse(err.details || "null"); } catch { d = null; }
        if (d) reprice(d.items, pickup || byZone ? undefined : d.fee);
        if (byZone) qc.invalidateQueries({ queryKey: ["zones", cart.store.id] });
        setError(`${err.message}${d ? ` Novo total: ${brl(Number(d.total))}.` : ""}`);
        return;
      }
      setError(err?.message || "Não foi possível registrar seu pedido. Tente novamente.");
    }
  };
  const submit = (e) => { e.preventDefault(); placeOrder(); };
  const confirmAge = async () => {
    setAge((a) => ({ ...a, busy: true }));
    setError("");
    try {
      await base44.account.confirmAge(age.birth);
      setAge({ needed: false, birth: "", declared: false, busy: false });
      await placeOrder();
    } catch (err) {
      setAge((a) => ({ ...a, busy: false }));
      setError(err?.message || "Não foi possível confirmar a idade.");
    }
  };

  return (
    <form onSubmit={submit} className="max-w-5xl mx-auto px-3 sm:px-5 py-4 sm:py-8 grid lg:grid-cols-[1fr_360px] gap-8">
      <div className="space-y-7">
        <div>
          <h1 className="font-display text-4xl mt-2">{cart.store.name}</h1>
          <Link to={`/loja/${cart.store.id}`} className="inline-block mt-3 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">Continuar comprando</Link>
          <div className="mt-4"><CartItems /></div>
        </div>
        <div>
          <Label>Como receber</Label>
          <ChoiceGroup options={modes.map((m) => [m, FULFILLMENT[m]])} value={form.fulfillment} onChange={set("fulfillment")} />
        </div>
        <div className="space-y-3">
          <Label>Seus dados</Label>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input placeholder="Nome" value={form.name} onChange={set("name")} className="h-12 rounded-xl" />
            <Input placeholder="WhatsApp / telefone" value={form.phone} onChange={set("phone")} className="h-12 rounded-xl" />
          </div>
          {!pickup && (
            <div className="space-y-3">
              <SavedAddresses list={addresses} value={form.address} onPick={(line) => {
                const a = addresses.find((x) => x.line === line);
                setForm((f) => ({ ...f, address: line, neighborhood_id: a?.neighborhood_id || f.neighborhood_id }));
              }} />
              <Input placeholder="Endereço completo (rua, número, bairro)" value={form.address} onChange={set("address")} className="h-12 rounded-xl" />
              {byZone && (
                <select value={form.neighborhood_id} onChange={set("neighborhood_id")} aria-label="Bairro" className="w-full h-12 rounded-xl border border-input bg-card px-3 text-base">
                  <option value="">Escolha o bairro</option>
                  {zones.map((z) => <option key={z.neighborhood_id} value={z.neighborhood_id}>{z.name} · entrega {z.fee ? brl(z.fee) : "grátis"}</option>)}
                </select>
              )}
              {byZone && <p className="text-xs text-muted-foreground">A loja entrega só nos bairros da lista.</p>}
            </div>
          )}
          <Textarea placeholder="Observações (opcional)" value={form.notes} onChange={set("notes")} className="rounded-xl" />
        </div>
        <div className="space-y-3">
          <Label>Pagamento na {pickup ? "retirada" : "entrega"}</Label>
          <ChoiceGroup options={Object.entries(PAYMENT)} value={form.payment} onChange={set("payment")} />
          {form.payment === "dinheiro" && <Input type="number" placeholder="Troco para quanto? (opcional)" value={form.change_for} onChange={set("change_for")} className="h-12 rounded-xl max-w-xs" />}
        </div>
      </div>
      <aside className="lg:sticky lg:top-24 h-fit bg-card border border-border rounded-2xl p-6 space-y-3">
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Entrega</span><span>{byZone && !zone ? "escolha o bairro" : fee ? brl(fee) : "Grátis"}</span></div>
        <div className="flex justify-between pt-3 border-t border-border"><span className="font-semibold">Total</span><span className="font-display text-2xl">{brl(total)}</span></div>
        {belowMin && <p className="text-sm text-accent">Pedido mínimo: {brl(cart.store.min_order)}</p>}
        {age.needed && (
          <div data-idade className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 p-4 space-y-3 text-sm">
            <p className="font-semibold">Este pedido tem item para maiores de 18 anos</p>
            <label className="block">Sua data de nascimento
              <Input type="date" value={age.birth} onChange={(e) => setAge((a) => ({ ...a, birth: e.target.value }))} className="h-11 mt-1 bg-white" />
            </label>
            <label className="flex gap-2 items-start">
              <input type="checkbox" checked={age.declared} onChange={(e) => setAge((a) => ({ ...a, declared: e.target.checked }))} className="mt-1" />
              <span>Declaro que tenho 18 anos ou mais e vou mostrar um documento com foto ao receber o pedido.</span>
            </label>
            <button type="button" disabled={!age.birth || !age.declared || age.busy || sending} onClick={confirmAge}
              className="w-full h-11 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-40">
              Confirmar idade e fazer pedido
            </button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={!valid || sending || age.needed} className="w-full h-13 py-4 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition">
          {sending && <Loader2 className="w-4 h-4 animate-spin" />} Fazer pedido
        </button>
      </aside>
    </form>
  );
}