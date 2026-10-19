import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { brl, STATUS } from "@/lib/constants";
import { useMyOrders } from "@/lib/useMyOrders";
import { MapPin, Plus, Trash2, Star } from "lucide-react";

const ADDR_KEY = "perto_addresses";

export default function Profile() {
  const { user } = useAuth();
  const saved = JSON.parse(localStorage.getItem("perto_customer") || "{}");
  const [name, setName] = useState(saved.name || user?.full_name || "");
  const [phone, setPhone] = useState(saved.phone || "");
  const [addresses, setAddresses] = useState(() => JSON.parse(localStorage.getItem(ADDR_KEY) || "[]"));
  const [def, setDef] = useState(() => Number(localStorage.getItem("perto_addresses_default") || "-1"));
  const [newAddr, setNewAddr] = useState("");
  const [ok, setOk] = useState(false);
  const persistAddr = (list, d) => { localStorage.setItem(ADDR_KEY, JSON.stringify(list)); localStorage.setItem("perto_addresses_default", String(d)); };

  const { orders: allOrders } = useMyOrders();
  const orders = allOrders.slice(0, 3);

  const saveProfile = () => {
    localStorage.setItem("perto_customer", JSON.stringify({ ...saved, name, phone }));
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };
  const addAddr = () => {
    if (!newAddr.trim()) return;
    setAddresses((a) => { const n = [...a, newAddr.trim()]; let d = def; if (d < 0) d = n.length - 1; setDef(d); persistAddr(n, d); return n; });
    setNewAddr("");
  };
  const removeAddr = (i) => setAddresses((a) => { const n = a.filter((_, x) => x !== i); let d = def === i ? -1 : def > i ? def - 1 : def; setDef(d); persistAddr(n, d); return n; });
  const makeDefault = (i) => { setDef(i); persistAddr(addresses, i); };

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
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 h-12" />
        </label>
        <button onClick={saveProfile} className="h-11 px-7 rounded-full bg-primary text-primary-foreground font-semibold">Salvar dados</button>
        {ok && <p className="text-sm text-primary">Dados atualizados.</p>}
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-2xl">Endereços de entrega</h2>
        <div className="divide-y divide-border">
          {addresses.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhum endereço salvo.</p>}
          {addresses.map((a, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
              <p className="flex-1 text-sm">{a}{def === i && <span className="ml-2 text-xs text-accent font-semibold">Padrão</span>}</p>
              <button onClick={() => makeDefault(i)} title="Definir como padrão" className={`p-1.5 rounded-full ${def === i ? "text-accent" : "text-muted-foreground hover:bg-secondary"}`}><Star className={`w-4 h-4 ${def === i ? "fill-current" : ""}`} /></button>
              <button onClick={() => removeAddr(i)} className="p-1.5 rounded-full hover:bg-secondary text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder="Novo endereço completo" className="h-11" />
          <button onClick={addAddr} className="h-11 px-4 rounded-full bg-primary text-primary-foreground flex items-center gap-1 whitespace-nowrap"><Plus className="w-4 h-4" />Adicionar</button>
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
    </div>
  );
}