import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { brl, STATUS } from "@/lib/constants";
import { useMyOrders } from "@/lib/useMyOrders";
import { MapPin, Plus, Trash2, Star, Loader2 } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => base44.account.getProfile() });
  const { data: addresses = [], isLoading: loadingAddr } = useQuery({ queryKey: ["my-addresses"], queryFn: () => base44.account.listAddresses() });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newAddr, setNewAddr] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) { setName(profile.full_name || user?.full_name || ""); setPhone(profile.phone || ""); }
  }, [profile, user]);

  const { orders: allOrders } = useMyOrders();
  const orders = allOrders.slice(0, 3);

  const run = async (fn, ok) => {
    setErr(""); setMsg(""); setBusy(true);
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setErr(e.message || "Não foi possível salvar."); } finally { setBusy(false); }
  };
  const refreshAddr = () => qc.invalidateQueries({ queryKey: ["my-addresses"] });

  const saveProfile = () => run(async () => {
    await base44.account.updateProfile({ full_name: name, phone });
    qc.invalidateQueries({ queryKey: ["my-profile"] });
  }, "Dados atualizados.");
  const addAddr = () => newAddr.trim().length >= 3 && run(async () => { await base44.account.addAddress(newAddr); setNewAddr(""); refreshAddr(); });
  const removeAddr = (id) => run(async () => { await base44.account.removeAddress(id); refreshAddr(); });
  const makeDefault = (id) => run(async () => { await base44.account.setDefaultAddress(id); refreshAddr(); });

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 space-y-10">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Conta</p>
        <h1 className="font-display text-4xl mt-2">Meu perfil</h1>
      </div>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-2xl">Dados pessoais</h2>
        <label className="block text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Nome
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-12" />
        </label>
        <label className="block text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">E-mail
          <Input value={user?.email || ""} disabled className="mt-2 h-12" />
        </label>
        <label className="block text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Telefone / WhatsApp
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-2 h-12" />
        </label>
        <button onClick={saveProfile} disabled={busy} className="h-11 px-7 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Salvar dados
        </button>
        {msg && <p className="text-sm text-primary">{msg}</p>}
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-2xl">Endereços de entrega</h2>
        <div className="divide-y divide-border">
          {loadingAddr && <p className="text-sm text-muted-foreground py-2">Carregando…</p>}
          {!loadingAddr && addresses.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhum endereço salvo. Os endereços usados nos pedidos aparecem aqui.</p>}
          {addresses.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-3">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
              <p className="flex-1 text-sm">{a.line}{a.is_default && <span className="ml-2 text-xs text-accent font-semibold">Padrão</span>}</p>
              <button onClick={() => makeDefault(a.id)} aria-label="Definir como padrão" className={`p-2 rounded-full ${a.is_default ? "text-accent" : "text-muted-foreground hover:bg-secondary"}`}><Star className={`w-4 h-4 ${a.is_default ? "fill-current" : ""}`} /></button>
              <button onClick={() => removeAddr(a.id)} aria-label="Remover endereço" className="p-2 rounded-full hover:bg-secondary text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder="Rua, número, bairro" className="h-11" />
          <button onClick={addAddr} disabled={busy} className="h-11 px-4 rounded-full bg-primary text-primary-foreground flex items-center gap-1 whitespace-nowrap disabled:opacity-50"><Plus className="w-4 h-4" />Adicionar</button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Pedidos recentes</h2>
          <Link to="/meus-pedidos" className="text-sm underline underline-offset-4">Ver todos</Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((o) => (
              <Link key={o.id} to={`/pedido/${o.id}`} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{o.store_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_date).toLocaleDateString("pt-BR")} · {brl(o.total)}</p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="border border-destructive/30 rounded-2xl p-6 space-y-2">
        <h2 className="font-semibold">Excluir minha conta</h2>
        <p className="text-sm text-muted-foreground">Apaga seus dados pessoais e endereços. Os pedidos ficam guardados sem o seu nome, porque a loja precisa deles para a contabilidade.</p>
        <Link to="/excluir-conta" className="inline-block text-sm text-destructive underline underline-offset-4">Quero excluir minha conta</Link>
      </section>
    </div>
  );
}
