import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShoppingBag, ChevronLeft, Tag, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useCart } from "@/lib/CartContext";
import { brl, FULFILLMENT, PAYMENT, PAYMENT_ONLINE } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CartItems from "@/components/checkout/CartItems";
import ChoiceGroup from "@/components/checkout/ChoiceGroup";
import SavedAddresses from "@/components/checkout/SavedAddresses";

const Label = ({ children }) => <h2 className="font-display text-[20px] leading-tight text-marca mb-3">{children}</h2>;
const campo = "h-12 rounded-lg bg-card text-[15px]";

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, subtotal, clear, reprice } = useCart();
  const qc = useQueryClient();
  const modes = cart.store?.delivery_modes?.length ? cart.store.delivery_modes : ["loja"];
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => base44.account.getProfile() });
  const { data: addresses = [] } = useQuery({ queryKey: ["my-addresses"], queryFn: () => base44.account.listAddresses() });
  // Bairros atendidos pela loja (se ela cadastrou taxa por bairro).
  const { data: zones = [] } = useQuery({ queryKey: ["zones", cart.store?.id], queryFn: () => base44.geo.storeZones(cart.store.id), enabled: !!cart.store?.id });
  const [form, setForm] = useState({ name: "", phone: "", address: "", neighborhood_id: "", fulfillment: modes[0], payment: "pix", change_for: "", notes: "", pay_mode: "offline", online_method: "pix" });
  const { data: config } = useQuery({ queryKey: ["public-config"], queryFn: () => base44.support.config(), staleTime: 300000 });
  const onlineAvailable = Boolean(config?.online_payments_enabled && cart.store?.accepts_online_payment);
  // Cupom: o desconto vem do servidor (simulação do pedido), nunca de conta feita aqui.
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(null); // { code, discount }
  const [couponState, setCouponState] = useState({ busy: false, error: "" });
  const [cpf, setCpf] = useState("");
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
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <span className="mx-auto w-16 h-16 rounded-full bg-[#EAF6EF] text-marca flex items-center justify-center"><ShoppingBag className="w-7 h-7" aria-hidden="true" /></span>
        <h1 className="font-display text-2xl text-marca mt-5">Sua sacola está vazia</h1>
        <p className="text-muted-foreground mt-2">Escolha uma loja e adicione o que quiser pedir.</p>
        <Link to="/" className="btn-acao mt-6">Ver as lojas</Link>
      </div>
    );
  }

  const pickup = form.fulfillment === "retirada";
  const byZone = !pickup && zones.length > 0;
  const zone = zones.find((z) => z.neighborhood_id === form.neighborhood_id);
  const fee = pickup ? 0 : byZone ? (zone?.fee ?? 0) : cart.store.delivery_fee;
  const discount = coupon?.discount || 0;
  const total = Math.max(subtotal + fee - discount, 0);
  const online = onlineAvailable && form.pay_mode === "online";
  // Alguns gateways exigem o CPF de quem paga online: pedimos só nesse caso e só se ainda não estiver na conta.
  const needsCpf = online && config?.payment_requires_document && !profile?.has_document;
  const belowMin = subtotal < (cart.store.min_order || 0);
  const valid = form.name && form.phone && (pickup || form.address) && (!byZone || zone) && !belowMin && (!needsCpf || cpf.replace(/\D/g, "").length === 11);

  const placeOrder = async () => {
    setSending(true);
    setError("");
    try {
      if (needsCpf) {
        await base44.account.setDocument(cpf);
        qc.invalidateQueries({ queryKey: ["my-profile"] });
      }
      const order = await base44.entities.Order.create({
        store_id: cart.store.id, idempotency_key: idempotencyKey,
        customer_name: form.name, customer_phone: form.phone, address: pickup ? "" : form.address,
        neighborhood_id: byZone ? form.neighborhood_id : null,
        fulfillment: form.fulfillment, payment_method: online ? form.online_method : form.payment,
        payment_mode: online ? "online" : "offline", coupon_code: coupon?.code || null,
        change_for: !online && form.payment === "dinheiro" && form.change_for ? Number(form.change_for) : undefined,
        notes: form.notes,
        expected_total: total,
        items: cart.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, addon_ids: i.addon_ids || [], quantity: i.quantity })),
      });
      // Guarda nome e telefone na conta para o próximo pedido (falha aqui não atrapalha o pedido).
      if (profile && (profile.full_name !== form.name || profile.phone !== form.phone)) {
        base44.account.updateProfile({ full_name: form.name, phone: form.phone }).catch(() => {});
      }
      clear();
      navigate(`/pedido/${order.id}${online ? "?pagar=1" : ""}`);
    } catch (err) {
      setSending(false);
      if (err?.code === "VMAGE") { setAge((a) => ({ ...a, needed: true })); return; }
      if (err?.code === "VMPRC") {
        // O preço ou a taxa mudaram: atualiza o carrinho com os valores do servidor e pede nova confirmação.
        let d = null;
        try { d = JSON.parse(err.details || "null"); } catch { d = null; }
        if (d) reprice(d.items, pickup || byZone ? undefined : d.fee);
        if (d && coupon) setCoupon((c) => c && { ...c, discount: Number(d.discount) || 0 });
        if (byZone) qc.invalidateQueries({ queryKey: ["zones", cart.store.id] });
        setError(`${err.message}${d ? ` Novo total: ${brl(Number(d.total))}.` : ""}`);
        return;
      }
      if (err?.code === "VMCPN") { setCoupon(null); setCouponState({ busy: false, error: err.message }); return; }
      setError(err?.message || "Não foi possível registrar seu pedido. Tente novamente.");
    }
  };
  const quoteArgs = () => ({
    store_id: cart.store.id, fulfillment: form.fulfillment, address: pickup ? "" : form.address, neighborhood_id: byZone ? form.neighborhood_id : null,
    payment_mode: online ? "online" : "offline", payment_method: online ? form.online_method : form.payment,
    items: cart.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, addon_ids: i.addon_ids || [], quantity: i.quantity })),
  });
  const applyCoupon = async (code = couponInput) => {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) return;
    setCouponState({ busy: true, error: "" });
    try {
      const q = await base44.entities.Order.quote({ ...quoteArgs(), coupon_code: clean });
      if (!q.discount) { setCoupon(null); setCouponState({ busy: false, error: "Este cupom não dá desconto neste pedido." }); return; }
      setCoupon({ code: clean, discount: q.discount });
      setCouponState({ busy: false, error: "" });
    } catch (err) {
      setCoupon(null);
      setCouponState({ busy: false, error: err?.message || "Não foi possível aplicar o cupom." });
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
    <form onSubmit={submit} className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
      <div className="space-y-7 min-w-0">
        <div>
          <h1 className="font-display text-2xl text-marca">Sua sacola</h1>
          <p className="text-[15px] mt-1 break-words">de <strong className="font-semibold">{cart.store.name}</strong></p>
          <Link to={`/loja/${cart.store.id}`} className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-marca underline underline-offset-4"><ChevronLeft className="w-4 h-4" aria-hidden="true" />Continuar comprando</Link>
          <div className="mt-3"><CartItems /></div>
        </div>
        <div>
          <Label>Como receber</Label>
          <ChoiceGroup label="Como receber" options={modes.map((m) => [m, FULFILLMENT[m]])} value={form.fulfillment} onChange={set("fulfillment")} />
        </div>
        <div className="space-y-3">
          <Label>Seus dados</Label>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input placeholder="Nome" aria-label="Nome" autoComplete="name" value={form.name} onChange={set("name")} className={campo} />
            <Input placeholder="WhatsApp / telefone" aria-label="WhatsApp ou telefone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} className={campo} />
          </div>
          {!pickup && (
            <div className="space-y-3">
              <SavedAddresses list={addresses} value={form.address} onPick={(line) => {
                const a = addresses.find((x) => x.line === line);
                setForm((f) => ({ ...f, address: line, neighborhood_id: a?.neighborhood_id || f.neighborhood_id }));
              }} />
              <Input placeholder="Endereço completo (rua, número, bairro)" aria-label="Endereço completo" autoComplete="street-address" value={form.address} onChange={set("address")} className={campo} />
              {byZone && (
                <select value={form.neighborhood_id} onChange={set("neighborhood_id")} aria-label="Bairro" className="w-full h-12 rounded-lg border border-input bg-card px-3 text-[15px]">
                  <option value="">Escolha o bairro</option>
                  {zones.map((z) => <option key={z.neighborhood_id} value={z.neighborhood_id}>{z.name} · entrega {z.fee ? brl(z.fee) : "grátis"}</option>)}
                </select>
              )}
              {byZone && <p className="text-[13px] text-muted-foreground">A loja entrega só nos bairros da lista.</p>}
            </div>
          )}
          <Textarea placeholder="Observações (opcional)" aria-label="Observações (opcional)" value={form.notes} onChange={set("notes")} className="rounded-lg bg-card text-[15px]" />
        </div>
        <div className="space-y-3">
          <Label>Pagamento</Label>
          {onlineAvailable && (
            <ChoiceGroup label="Quando pagar" options={[["online", "Pagar agora pelo app"], ["offline", `Pagar na ${pickup ? "retirada" : "entrega"}`]]}
              value={form.pay_mode} onChange={(v) => { set("pay_mode")(v); if (coupon) setTimeout(() => applyCoupon(coupon.code), 0); }} />
          )}
          {online ? (
            <>
              <p className="text-[15px] font-semibold pt-1">Forma de pagamento</p>
              <ChoiceGroup label="Forma de pagamento pelo app" options={Object.entries(PAYMENT_ONLINE)} value={form.online_method} onChange={set("online_method")} />
              <p className="text-[13px] text-muted-foreground">O pagamento é confirmado pelo banco. A loja só começa a preparar depois da confirmação. Se o pedido for cancelado, o valor volta automaticamente.</p>
              {config?.payment_sandbox && <p className="text-[13px] font-semibold text-[#C2331A]">Ambiente de teste: nenhum valor real é cobrado.</p>}
              {needsCpf && (
                <label className="block text-sm">CPF de quem paga (exigido pelo banco para o pagamento online)
                  <Input value={cpf} onChange={(e) => setCpf(e.target.value.replace(/[^\d.-]/g, "").slice(0, 14))} inputMode="numeric" placeholder="000.000.000-00" className={`${campo} mt-1 max-w-xs`} />
                  <span className="block text-[12px] text-muted-foreground mt-1">Fica guardado só na sua conta e é enviado só ao banco que processa o pagamento.</span>
                </label>
              )}
            </>
          ) : (
            <>
              {!onlineAvailable && <p className="text-[13px] text-muted-foreground -mt-1">Pagamento na {pickup ? "retirada" : "entrega"}{form.payment === "pix" ? ", por Pix direto para a loja" : ""}.</p>}
              {onlineAvailable && <p className="text-[15px] font-semibold pt-1">Forma de pagamento</p>}
              <ChoiceGroup label="Forma de pagamento" options={Object.entries(PAYMENT)} value={form.payment} onChange={set("payment")} />
              {form.payment === "dinheiro" && <Input type="number" inputMode="decimal" placeholder="Troco para quanto? (opcional)" aria-label="Troco para quanto? (opcional)" value={form.change_for} onChange={set("change_for")} className={`${campo} max-w-xs`} />}
            </>
          )}
        </div>
      </div>
      <aside className="lg:sticky lg:top-24 h-fit bg-card border border-border rounded-lg p-5 space-y-3 min-w-0" aria-label="Resumo do pedido">
        <h2 className="font-display text-[20px] text-marca">Resumo</h2>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Entrega</span><span>{byZone && !zone ? "escolha o bairro" : fee ? brl(fee) : "Grátis"}</span></div>
        {coupon && (
          <div className="flex justify-between text-sm text-[#077243]"><span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" aria-hidden="true" />Cupom {coupon.code}</span><span>− {brl(discount)}</span></div>
        )}
        <div className="flex justify-between pt-3 border-t border-border"><span className="font-semibold">Total</span><span className="text-[22px] font-bold">{brl(total)}</span></div>
        {coupon ? (
          <button type="button" onClick={() => { setCoupon(null); setCouponInput(""); }} className="text-[13px] text-muted-foreground flex items-center gap-1 underline underline-offset-2"><X className="w-3.5 h-3.5" aria-hidden="true" />Remover cupom</button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase().slice(0, 30))} placeholder="Cupom de desconto" aria-label="Cupom de desconto" className="h-11 rounded-lg bg-background text-[15px] uppercase" />
              <button type="button" disabled={!couponInput.trim() || couponState.busy || (!pickup && !form.address)} onClick={() => applyCoupon()} className="btn-contorno h-11 px-4 shrink-0 disabled:opacity-50">
                {couponState.busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Aplicar
              </button>
            </div>
            {couponState.error && <p role="alert" className="text-[13px] text-destructive">{couponState.error}</p>}
          </div>
        )}
        {belowMin && <p className="text-sm font-semibold text-[#C2331A]">Pedido mínimo desta loja: {brl(cart.store.min_order)}. Faltam {brl((cart.store.min_order || 0) - subtotal)}.</p>}
        {age.needed && (
          <div data-idade className="rounded-lg border border-[#F5DFA0] bg-[#FFF6DB] text-[#5C4300] p-4 space-y-3 text-sm">
            <p className="font-semibold">Este pedido tem item para maiores de 18 anos</p>
            <label className="block">Sua data de nascimento
              <Input type="date" value={age.birth} onChange={(e) => setAge((a) => ({ ...a, birth: e.target.value }))} className="h-11 mt-1 bg-white rounded-lg" />
            </label>
            <label className="flex gap-2 items-start">
              <input type="checkbox" checked={age.declared} onChange={(e) => setAge((a) => ({ ...a, declared: e.target.checked }))} className="mt-1 w-4 h-4 accent-[#077243]" />
              <span>Declaro que tenho 18 anos ou mais e vou mostrar um documento com foto ao receber o pedido.</span>
            </label>
            <button type="button" disabled={!age.birth || !age.declared || age.busy || sending} onClick={confirmAge}
              className="btn-acao w-full h-11">
              Confirmar idade e fazer pedido
            </button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={!valid || sending || age.needed} className="btn-acao w-full h-[52px] text-base">
          {sending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} {online ? "Ir para o pagamento" : "Fazer pedido"} · {brl(total)}
        </button>
        {!valid && !sending && !age.needed && (
          <p className="text-[13px] text-muted-foreground text-center">
            {belowMin ? "Adicione mais itens para chegar ao pedido mínimo." : !form.name || !form.phone ? "Preencha seu nome e telefone." : !pickup && !form.address ? "Preencha o endereço de entrega." : "Escolha o bairro da entrega."}
          </p>
        )}
      </aside>
    </form>
  );
}