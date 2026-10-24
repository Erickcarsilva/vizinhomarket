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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-5">
      <div>
        <h1 className="font-display text-2xl text-marca">Meu perfil</h1>
        {user?.email && <p className="text-[15px] text-muted-foreground break-words">{user.email}</p>}
      </div>

      <section className="bg-card border border-border rounded-lg p-4 sm:p-5 space-y-4">
        <h2 className="font-display text-xl text-marca">Dados pessoais</h2>
        <label className="block text-sm font-medium">Nome
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-12 rounded-lg text-[15px]" />
        </label>
        <label className="block text-sm font-medium">E-mail
          <Input value={user?.email || ""} disabled className="mt-1.5 h-12 rounded-lg text-[15px]" />
        </label>
        <label className="block text-sm font-medium">Telefone / WhatsApp
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-1.5 h-12 rounded-lg text-[15px]" />
        </label>
        <button type="button" onClick={saveProfile} disabled={busy} className="btn-acao h-11">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Salvar dados
        </button>
        {msg && <p role="status" className="text-sm font-semibold text-marca">{msg}</p>}
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      </section>

      <section className="bg-card border border-border rounded-lg p-4 sm:p-5 space-y-4">
        <h2 className="font-display text-xl text-marca">Endereços de entrega</h2>
        <div className="divide-y divide-[#EDE6D8]">
          {loadingAddr && <p className="text-sm text-muted-foreground py-2">Carregando…</p>}
          {!loadingAddr && addresses.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhum endereço salvo. Os endereços usados nos pedidos aparecem aqui.</p>}
          {addresses.map((a) => (
            <div key={a.id} className="flex items-start gap-2 py-1 min-w-0">
              <MapPin className="w-4 h-4 text-marca mt-3 shrink-0" aria-hidden="true" />
              <p className="flex-1 min-w-0 text-[15px] py-2.5 break-words">{a.line}{a.is_default && <span className="ml-2 text-[13px] text-marca font-semibold">Padrão</span>}</p>
              <button type="button" onClick={() => makeDefault(a.id)} aria-label="Definir como padrão" aria-pressed={a.is_default} className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full ${a.is_default ? "text-marca" : "text-muted-foreground hover:bg-secondary"}`}><Star className={`w-4 h-4 ${a.is_default ? "fill-current" : ""}`} aria-hidden="true" /></button>
              <button type="button" onClick={() => removeAddr(a.id)} aria-label="Remover endereço" className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full hover:bg-secondary text-destructive"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 min-w-0">
          <Input value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder="Rua, número, bairro" aria-label="Novo endereço" className="h-11 rounded-lg text-[15px] min-w-0" />
          <button type="button" onClick={addAddr} disabled={busy} className="btn-contorno h-11 px-3.5 shrink-0"><Plus className="w-4 h-4" aria-hidden="true" />Adicionar</button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-marca">Pedidos recentes</h2>
          <Link to="/meus-pedidos" className="text-sm font-semibold text-marca underline underline-offset-4">Ver todos</Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p>
        ) : (
          <div className="divide-y divide-[#EDE6D8]">
            {orders.map((o) => (
              <Link key={o.id} to={`/pedido/${o.id}`} className="flex items-center justify-between gap-3 py-3 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{o.store_name}</p>
                  <p className="text-[13px] text-muted-foreground">{new Date(o.created_date).toLocaleDateString("pt-BR")} · {brl(o.total)}</p>
                </div>
                <span className={`text-[13px] font-semibold shrink-0 ${o.status === "CANCELLED" ? "text-[#7A3A1F]" : o.status === "DELIVERED" ? "text-muted-foreground" : "text-marca"}`}>{STATUS[o.status].label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="px-1 pt-2 space-y-1.5">
        <h2 className="font-semibold text-[15px]">Excluir minha conta</h2>
        <p className="text-sm text-muted-foreground">Apaga seus dados pessoais e endereços. Os pedidos ficam guardados sem o seu nome, porque a loja precisa deles para a contabilidade.</p>
        <Link to="/excluir-conta" className="inline-block text-sm text-destructive underline underline-offset-4">Quero excluir minha conta</Link>
      </section>
    </div>
  );
}
