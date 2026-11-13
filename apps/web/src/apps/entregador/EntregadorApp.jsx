import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Wallet, History, User, MapPin, Navigation, Phone, Store, PackageCheck, AlertTriangle, Loader2, CheckCircle2, X, ChevronRight, Radio, LogOut, ShieldCheck } from "lucide-react";
import AppShell from "@/apps/shared/AppShell";
import { RequireLogin } from "@/apps/shared/Guards";
import PageNotFound from "@/lib/PageNotFound";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { APP_VERSION } from "@/lib/version";
import { useCourierLocation } from "./useCourierLocation";
import PushToggle from "@/components/PushToggle";

const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const time = (d) => (d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const mapsLink = (place) => {
  if (!place) return null;
  const dest = place.lat != null && place.lng != null ? `${place.lat},${place.lng}` : place.address;
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null;
};
const PAY = { pix: "Pix", card_on_delivery: "Cartão na entrega", cash: "Dinheiro", card_online: "Cartão (pago no app)" };
const STEP = { ACCEPTED: "Loja preparando", PREPARING: "Loja preparando", READY: "Pronto para retirar", IN_TRANSIT: "Em rota até o cliente" };

const Btn = ({ tone = "primary", busy, className = "", children, ...p }) => {
  const tones = {
    primary: "bg-primary text-primary-foreground",
    accent: "bg-accent text-accent-foreground",
    ghost: "border border-border bg-card",
    danger: "border border-destructive/40 text-destructive bg-card",
  };
  return (
    <button type="button" disabled={busy || p.disabled} className={`min-h-[52px] px-5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50 ${tones[tone]} ${className}`} {...p}>
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}{children}
    </button>
  );
};
const Card = ({ className = "", children }) => <div className={`rounded-3xl border border-border bg-card p-5 ${className}`}>{children}</div>;
const ErrorText = ({ error }) => (error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null);
const Spinner = () => <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

// ---------------------------------------------------------------- Situação do cadastro
function useCourierProfile() {
  return useQuery({ queryKey: ["courier-me"], queryFn: () => base44.courier.me(), staleTime: 30000 });
}

function CourierGate() {
  const ctx = useOutletContext();
  const { data: me, isLoading, error } = useCourierProfile();
  if (isLoading) return <Spinner />;
  if (error) return <div className="p-6"><ErrorText error={error.message} /></div>;
  if (!me) return <Navigate to="/cadastro" replace />;
  if (me.status === "pending") {
    return (
      <Centered title="Cadastro em análise" icon={ShieldCheck}>
        Recebemos seus dados. A equipe confere documento e veículo e libera seu acesso. Você será avisado por aqui.
      </Centered>
    );
  }
  if (me.status === "suspended") {
    return <Centered title="Acesso suspenso" icon={AlertTriangle}>Seu acesso às corridas está suspenso. Fale com o suporte para entender o motivo.</Centered>;
  }
  return <Outlet context={ctx} />;
}

function Centered({ title, icon: Icon, children }) {
  const { logout } = useAuth();
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto"><Icon className="w-7 h-7" /></div>
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="text-muted-foreground">{children}</p>
        <button onClick={() => logout(true)} className="text-sm text-muted-foreground underline">Sair</button>
      </div>
    </div>
  );
}

function Cadastro() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ vehicle: "moto", plate: "", document: "", agree: false });
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => base44.courier.apply(f),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["courier-me"] }); navigate("/", { replace: true }); },
    onError: (e) => setError(e.message),
  });
  const { data: me } = useCourierProfile();
  if (me) return <Navigate to="/" replace />;
  const needsPlate = f.vehicle === "moto" || f.vehicle === "carro";
  const valid = f.document.replace(/\D/g, "").length === 11 && (!needsPlate || f.plate.trim().length >= 7) && f.agree;
  return (
    <div className="max-w-md mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold">Seja entregador</p>
        <h1 className="font-display text-3xl mt-1">Cadastro de entregador</h1>
        <p className="text-muted-foreground mt-2 text-sm">Seus dados são conferidos pela equipe antes da liberação. O CPF nunca aparece para lojas nem clientes.</p>
      </div>
      <Card className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Veículo</span>
          <div className="grid grid-cols-4 gap-2">
            {[["moto", "Moto"], ["bike", "Bicicleta"], ["carro", "Carro"], ["a_pe", "A pé"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setF({ ...f, vehicle: k })} aria-pressed={f.vehicle === k}
                className={`min-h-[48px] rounded-xl text-sm border ${f.vehicle === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
            ))}
          </div>
        </label>
        {needsPlate && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Placa</span>
            <input value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase().slice(0, 8) })} placeholder="ABC1D23" autoCapitalize="characters"
              className="w-full h-12 rounded-xl border border-input bg-background px-4" />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">CPF</span>
          <input value={f.document} onChange={(e) => setF({ ...f, document: e.target.value.replace(/[^\d.-]/g, "").slice(0, 14) })} inputMode="numeric" placeholder="000.000.000-00"
            className="w-full h-12 rounded-xl border border-input bg-background px-4" />
        </label>
        <label className="flex gap-3 items-start text-sm">
          <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} className="mt-1 w-5 h-5" />
          <span>Concordo com os <a className="underline" href="/termos-entregador" target="_blank" rel="noreferrer">termos do entregador</a> e com o uso da minha localização <strong>somente enquanto estiver online</strong>.</span>
        </label>
        <ErrorText error={error} />
        <Btn className="w-full" disabled={!valid} busy={m.isPending} onClick={() => m.mutate()}>Enviar cadastro</Btn>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Corridas
function Corridas() {
  const qc = useQueryClient();
  const { data: me } = useCourierProfile();
  const online = Boolean(me?.is_online);
  const { loc } = useOutletContext() || {};
  const [error, setError] = useState("");

  const toggle = useMutation({
    mutationFn: (next) => base44.courier.setOnline(next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courier-me"] }),
    onError: (e) => setError(e.message),
  });
  const active = useQuery({ queryKey: ["courier-active"], queryFn: () => base44.courier.myDeliveries({ active: true }), refetchInterval: 15000 });
  const offers = useQuery({ queryKey: ["courier-offers"], queryFn: () => base44.courier.offers(), enabled: online, refetchInterval: online ? 10000 : false });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["courier-offers"] }), qc.invalidateQueries({ queryKey: ["courier-active"] })]);
  const claim = useMutation({ mutationFn: (id) => base44.courier.claim(id), onSuccess: refresh, onError: (e) => { setError(e.message); refresh(); } });
  const decline = useMutation({ mutationFn: (id) => base44.courier.decline(id), onSuccess: refresh });

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      <Card className={online ? "bg-primary text-primary-foreground border-primary" : ""}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${online ? "bg-white/15" : "bg-secondary"}`}><Radio className="w-6 h-6" /></div>
          <div className="flex-1">
            <p className="font-semibold text-lg">{online ? "Você está online" : "Você está offline"}</p>
            <p className={`text-sm ${online ? "text-primary-foreground" : "text-muted-foreground"}`}>{online ? "Recebendo corridas da sua cidade." : "Fique online para ver e aceitar corridas."}</p>
          </div>
        </div>
        <Btn tone={online ? "ghost" : "accent"} className={`w-full mt-4 ${online ? "!bg-white/10 !border-white/30 !text-primary-foreground" : ""}`} busy={toggle.isPending}
          onClick={() => { setError(""); toggle.mutate(!online); }}>{online ? "Ficar offline" : "Ficar online"}</Btn>
        {online && loc?.error && <p className="text-sm mt-3 bg-white/10 rounded-xl px-3 py-2">{loc.error}</p>}
      </Card>
      <ErrorText error={error} />
      {online && <PushToggle title="Aviso de corrida nova" description="Receba um aviso quando surgir corrida na sua cidade, mesmo com o app fechado." compact />}

      {(active.data || []).length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Em andamento</h2>
          {active.data.map((o) => (
            <Link key={o.id} to={`/corrida/${o.id}`} className="block">
              <Card className="flex items-center gap-4 active:scale-[0.99] transition">
                <div className="w-11 h-11 rounded-2xl bg-accent/15 text-accent flex items-center justify-center"><Bike className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{o.store?.name} · {o.code}</p>
                  <p className="text-sm text-muted-foreground">{STEP[o.status]}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </section>
      )}

      {online && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-lg">Corridas disponíveis</h2>
            <span className="text-xs text-muted-foreground">atualiza sozinho</span>
          </div>
          {offers.isLoading ? <Spinner /> : (offers.data || []).length === 0 ? (
            <Card className="text-center text-muted-foreground py-10">Nenhuma corrida agora. Fique por perto: avisamos aqui.</Card>
          ) : offers.data.map((o) => (
            <Card key={o.order_id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-lg">{o.store_name}</p>
                  <p className="text-sm text-muted-foreground">{o.store_neighborhood || o.store_address || "Endereço da loja no detalhe"}</p>
                </div>
                <p className="font-display text-2xl text-primary">{brl(o.courier_fee)}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-secondary">Entrega em: {o.customer_neighborhood || "bairro não informado"}</span>
                <span className="px-2.5 py-1 rounded-full bg-secondary">{o.items_count} item(ns)</span>
                {o.distance_to_store_km != null && <span className="px-2.5 py-1 rounded-full bg-secondary">{String(o.distance_to_store_km).replace(".", ",")} km até a loja (linha reta)</span>}
                <span className={`px-2.5 py-1 rounded-full ${o.status === "READY" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{o.status === "READY" ? "Pronto" : "Em preparo"}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Btn busy={claim.isPending && claim.variables === o.order_id} onClick={() => { setError(""); claim.mutate(o.order_id); }}>Aceitar corrida</Btn>
                <Btn tone="ghost" aria-label="Recusar" onClick={() => decline.mutate(o.order_id)}><X className="w-5 h-5" /></Btn>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function Corrida() {
  const { id } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: list, isLoading } = useQuery({ queryKey: ["courier-active"], queryFn: () => base44.courier.myDeliveries({ active: true }), refetchInterval: 10000 });
  const o = useMemo(() => (list || []).find((x) => x.id === id), [list, id]);
  const [code, setCode] = useState("");
  const [ageOk, setAgeOk] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState(null); // null | "release" | "problem"
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["courier-active"] });

  const pickup = useMutation({ mutationFn: () => base44.courier.pickup(id), onSuccess: refresh, onError: (e) => setError(e.message) });
  const confirm = useMutation({
    mutationFn: () => base44.courier.confirm(id, code, ageOk),
    onSuccess: (r) => {
      if (r?.ok) { setDone(true); refresh(); qc.invalidateQueries({ queryKey: ["courier-earnings"] }); }
      else setError(`Código não confere. Restam ${r?.attempts_left ?? 0} tentativa(s). Peça ao cliente o código que aparece no app dele.`);
    },
    onError: (e) => setError(e.message),
  });
  const report = useMutation({
    mutationFn: () => (problem === "release" ? base44.courier.release(id, reason) : base44.courier.problem(id, reason)),
    onSuccess: () => { setProblem(null); setReason(""); refresh(); if (problem === "release") navigate("/"); },
    onError: (e) => setError(e.message),
  });

  if (done) {
    return (
      <div className="px-6 py-20 text-center space-y-4 max-w-sm mx-auto">
        <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto" />
        <h1 className="font-display text-3xl">Entrega concluída</h1>
        <p className="text-muted-foreground">O ganho desta corrida já aparece em Ganhos.</p>
        <Btn className="w-full" onClick={() => navigate("/")}>Voltar às corridas</Btn>
      </div>
    );
  }
  if (isLoading) return <Spinner />;
  if (!o) return <div className="p-6 text-center space-y-3"><p className="text-muted-foreground">Esta corrida não está mais com você.</p><Link to="/" className="underline">Voltar</Link></div>;

  const inTransit = o.status === "IN_TRANSIT";
  const storePlace = { lat: o.store?.lat, lng: o.store?.lng, address: o.store?.address_line };
  const customerPlace = { address: [o.address_line, o.neighborhood?.name, "Sidrolândia - MS"].filter(Boolean).join(", ") };
  const phoneDigits = String(o.customer_phone || "").replace(/\D/g, "");

  return (
    <div className="px-4 py-5 space-y-4 max-w-lg mx-auto pb-28">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold">{o.code}</p>
          <h1 className="font-display text-2xl">{STEP[o.status]}</h1>
        </div>
        <p className="font-display text-2xl text-primary">{brl(o.courier_fee)}</p>
      </div>

      <ol className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-center">
        {["Ir à loja", "Retirar", "Entregar"].map((s, i) => {
          const idx = inTransit ? 2 : o.status === "READY" ? 1 : 0;
          return <li key={s} className={`py-2 rounded-xl ${i <= idx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{s}</li>;
        })}
      </ol>

      <Card className={`space-y-3 ${inTransit ? "opacity-60" : ""}`}>
        <div className="flex gap-3"><Store className="w-5 h-5 mt-0.5 shrink-0" /><div><p className="font-semibold">{o.store?.name}</p><p className="text-sm text-muted-foreground">{o.store?.address_line || "Endereço não cadastrado"}</p></div></div>
        {!inTransit && (
          <div className="grid grid-cols-2 gap-2">
            {mapsLink(storePlace) && <a href={mapsLink(storePlace)} target="_blank" rel="noreferrer"><Btn tone="ghost" className="w-full"><Navigation className="w-4 h-4" />Rota</Btn></a>}
            {o.store?.phone_public && <a href={`tel:${o.store.phone_public}`}><Btn tone="ghost" className="w-full"><Phone className="w-4 h-4" />Ligar</Btn></a>}
          </div>
        )}
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Itens do pedido ({o.items?.length || 0})</summary>
          <ul className="mt-2 space-y-1">{(o.items || []).map((it, i) => <li key={i}>{Number(it.quantity)}{it.unit === "kg" ? " kg" : "×"} {it.name}{it.variant_name ? ` (${it.variant_name})` : ""}</li>)}</ul>
        </details>
      </Card>

      <Card className="space-y-3">
        <div className="flex gap-3"><MapPin className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{o.customer_name}</p>
            <p className="text-sm">{o.address_line}{o.neighborhood?.name ? ` · ${o.neighborhood.name}` : ""}</p>
            {o.address_reference && <p className="text-sm text-muted-foreground">Referência: {o.address_reference}</p>}
            {o.notes && <p className="text-sm text-muted-foreground">Obs.: {o.notes}</p>}
          </div>
        </div>
        <div className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          {o.payment_mode === "online" ? <p><strong>Já pago pelo app.</strong> Não cobre nada do cliente.</p> : (
            <p>Receber na entrega: <strong>{brl(o.total)}</strong> · {PAY[o.payment_method]}{o.change_for ? ` · troco para ${brl(o.change_for)}` : ""}</p>
          )}
        </div>
        {inTransit && (
          <div className="grid grid-cols-3 gap-2">
            {mapsLink(customerPlace) && <a href={mapsLink(customerPlace)} target="_blank" rel="noreferrer"><Btn tone="ghost" className="w-full !px-2"><Navigation className="w-4 h-4" />Rota</Btn></a>}
            {phoneDigits && <a href={`tel:${phoneDigits}`}><Btn tone="ghost" className="w-full !px-2"><Phone className="w-4 h-4" />Ligar</Btn></a>}
            {phoneDigits && <a href={`https://wa.me/${phoneDigits.startsWith("55") ? phoneDigits : "55" + phoneDigits}`} target="_blank" rel="noreferrer"><Btn tone="ghost" className="w-full !px-2">WhatsApp</Btn></a>}
          </div>
        )}
      </Card>

      <ErrorText error={error} />

      {!inTransit && (
        <Btn className="w-full" disabled={o.status !== "READY"} busy={pickup.isPending} onClick={() => { setError(""); pickup.mutate(); }}>
          <PackageCheck className="w-5 h-5" />{o.status === "READY" ? "Confirmar retirada" : "Aguardando a loja marcar pronto"}
        </Btn>
      )}

      {inTransit && (
        <Card className="space-y-3">
          <p className="font-semibold">Código de entrega</p>
          <p className="text-sm text-muted-foreground">Peça ao cliente os 4 números que aparecem no app dele.</p>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" aria-label="Código de entrega"
            className="w-full h-16 text-center text-3xl tracking-[0.5em] font-semibold rounded-2xl border border-input bg-background" placeholder="••••" />
          {o.age_check_required && (
            <label className="flex gap-3 items-start text-sm bg-amber-50 text-amber-900 rounded-xl p-3">
              <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="mt-0.5 w-5 h-5" />
              Conferi o documento: quem recebe tem 18 anos ou mais.
            </label>
          )}
          <Btn className="w-full" disabled={code.length !== 4 || (o.age_check_required && !ageOk)} busy={confirm.isPending} onClick={() => { setError(""); confirm.mutate(); }}>Concluir entrega</Btn>
        </Card>
      )}

      <div className="flex justify-center gap-6 pt-2">
        {!inTransit && <button className="text-sm text-muted-foreground underline" onClick={() => setProblem("release")}>Não vou conseguir buscar</button>}
        {inTransit && <button className="text-sm text-destructive underline" onClick={() => setProblem("problem")}>Problema na entrega</button>}
      </div>

      {problem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" role="dialog" aria-modal="true" aria-label="Informar problema">
          <div className="w-full bg-background rounded-t-3xl p-5 space-y-3 max-w-lg mx-auto">
            <p className="font-semibold text-lg">{problem === "release" ? "Devolver a corrida" : "O que aconteceu?"}</p>
            <p className="text-sm text-muted-foreground">{problem === "release" ? "A corrida volta para outros entregadores." : "A equipe recebe na hora e orienta o próximo passo. Não deixe o pedido sem combinar."}</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={3} className="w-full rounded-xl border border-input bg-card p-3"
              placeholder={problem === "release" ? "Ex.: pneu furou" : "Ex.: cliente não atende, endereço não encontrado"} />
            <div className="grid grid-cols-2 gap-2">
              <Btn tone="ghost" onClick={() => setProblem(null)}>Voltar</Btn>
              <Btn tone={problem === "release" ? "primary" : "accent"} disabled={reason.trim().length < 5} busy={report.isPending} onClick={() => report.mutate()}>Enviar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Ganhos e histórico
function Ganhos() {
  const [period, setPeriod] = useState("mes");
  const range = useMemo(() => {
    const now = new Date();
    const from = period === "hoje" ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : period === "semana" ? new Date(now.getTime() - 7 * 864e5) : new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }, [period]);
  const { data, isLoading, error } = useQuery({ queryKey: ["courier-earnings", range.from], queryFn: () => base44.courier.earnings(range.from, range.to) });
  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      <h1 className="font-display text-3xl">Ganhos</h1>
      <div className="flex gap-2">
        {[["hoje", "Hoje"], ["semana", "7 dias"], ["mes", "Este mês"]].map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)} className={`h-10 px-4 rounded-full text-sm border ${period === k ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}>{l}</button>
        ))}
      </div>
      {isLoading ? <Spinner /> : error ? <ErrorText error={error.message} /> : (
        <>
          <Card className="bg-primary text-primary-foreground border-primary">
            <p className="text-sm">Ganho no período</p>
            <p className="font-display text-5xl mt-1">{brl(data.earned)}</p>
            <p className="text-sm mt-2">{data.deliveries} entrega(s) concluída(s)</p>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card><p className="text-sm text-muted-foreground">Saldo a receber</p><p className="font-display text-2xl mt-1">{brl(data.balance)}</p></Card>
            <Card><p className="text-sm text-muted-foreground">Repasses no período</p><p className="font-display text-2xl mt-1">{brl(data.paid_out)}</p></Card>
          </div>
          <p className="text-xs text-muted-foreground">O saldo vem do registro financeiro da plataforma e é pago por Pix nos repasses combinados.</p>
        </>
      )}
    </div>
  );
}

function Historico() {
  const { data, isLoading, error } = useQuery({ queryKey: ["courier-history"], queryFn: () => base44.courier.myDeliveries({ active: false, limit: 100 }) });
  return (
    <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">
      <h1 className="font-display text-3xl">Histórico</h1>
      {isLoading ? <Spinner /> : error ? <ErrorText error={error.message} /> : (data || []).length === 0 ? (
        <Card className="text-center text-muted-foreground py-10">Suas entregas concluídas aparecem aqui.</Card>
      ) : (
        <Card className="!p-0 divide-y divide-border">
          {data.map((o) => (
            <div key={o.id} className="px-5 py-4 flex items-center gap-3">
              <div className="flex-1">
                <p className="font-medium">{o.store?.name} · {o.code}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.delivered_at || o.created_at).toLocaleDateString("pt-BR")} {time(o.delivered_at)} · {o.status === "DELIVERED" ? "Entregue" : "Cancelado"}</p>
              </div>
              <p className={`font-semibold ${o.status === "DELIVERED" ? "" : "text-muted-foreground line-through"}`}>{brl(o.courier_fee)}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Conta() {
  const { user, logout } = useAuth();
  const { data: me } = useCourierProfile();
  const VEH = { moto: "Moto", bike: "Bicicleta", carro: "Carro", a_pe: "A pé" };
  return (
    <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">
      <h1 className="font-display text-3xl">Conta</h1>
      <Card className="space-y-2">
        <p className="font-semibold">{user?.full_name || user?.email}</p>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
        {me && <p className="text-sm">Veículo: {VEH[me.vehicle]}{me.plate ? ` · ${me.plate}` : ""}</p>}
      </Card>
      <Card className="space-y-2 text-sm">
        <p className="font-semibold">Sua localização</p>
        <p className="text-muted-foreground">Usamos o GPS só enquanto você está online, para mostrar corridas próximas e para o cliente acompanhar a entrega. Offline, nada é coletado e a última posição é apagada.</p>
      </Card>
      <Btn tone="ghost" className="w-full" onClick={() => logout(true)}><LogOut className="w-4 h-4" />Sair</Btn>
      <p className="text-center text-[11px] text-muted-foreground">Versão {APP_VERSION}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Estrutura
function CourierLayout() {
  // GPS fica aqui (sempre montado): segue enviando a posição na tela da corrida; para quando fica offline.
  const { data: me } = useCourierProfile();
  const loc = useCourierLocation(me?.status === "approved" && Boolean(me?.is_online));
  const NAV = [["/", "Corridas", Bike], ["/ganhos", "Ganhos", Wallet], ["/historico", "Histórico", History], ["/conta", "Conta", User]];
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#14231C"); }, []);
  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 bg-[#14231C] text-white h-14 px-4 flex items-center justify-between">
        <span className="font-display text-lg tracking-tight text-white">Vizinho<span className="text-[#F2B79B]">Market</span></span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-white">Entregador</span>
      </header>
      <main><Outlet context={{ loc }} /></main>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border grid grid-cols-4 pb-[env(safe-area-inset-bottom)]" aria-label="Menu">
        {NAV.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `h-16 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold ${isActive ? "text-primary" : "text-foreground/75"}`}>
            <Icon className="w-5 h-5" />{label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function TermosEntregador() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-4 text-sm leading-relaxed">
      <h1 className="font-display text-3xl">Termos do entregador (rascunho para revisão jurídica)</h1>
      <p>O entregador é parceiro independente, escolhe quando ficar online e quais corridas aceitar. Não há exclusividade nem jornada mínima.</p>
      <p>O valor de cada corrida aparece antes do aceite. O pagamento dos ganhos é feito por Pix nos repasses informados pela plataforma.</p>
      <p>Localização: coletada somente com o app online, para ofertas próximas e acompanhamento da entrega pelo cliente. As posições de cada entrega ficam guardadas por até 30 dias e depois são apagadas.</p>
      <p>A entrega só é concluída com o código do cliente. Em pedidos com bebida alcoólica, é obrigatório conferir o documento de quem recebe.</p>
      <p className="text-muted-foreground">Este texto precisa de validação jurídica (relação de trabalho, seguro e responsabilidade) antes do piloto.</p>
    </div>
  );
}

// App do Entregador (PWA): corridas, entrega com código, ganhos e histórico.
export default function EntregadorApp() {
  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/termos-entregador" element={<TermosEntregador />} />
        <Route element={<RequireLogin />}>
          <Route path="/cadastro" element={<Cadastro />} />
          <Route element={<CourierLayout />}>
            <Route element={<CourierGate />}>
              <Route path="/" element={<Corridas />} />
              <Route path="/corrida/:id" element={<Corrida />} />
              <Route path="/ganhos" element={<Ganhos />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/conta" element={<Conta />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AppShell>
  );
}
