import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { categoryLabel, brl } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Card, Chip, Btn, Seg, Empty, ErrorLine, useAction, pct, waLink, fmtDate } from "./ui";

const ST = { pending: ["Aguardando", "warn"], approved: ["Aprovada", "ok"], suspended: ["Suspensa", "bad"] };

export default function StoresAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [rateInput, setRateInput] = useState({});
  const { data: stores = [], isLoading } = useQuery({ queryKey: ["admin-stores"], queryFn: () => base44.entities.Store.list("-created_date", 1000) });
  const { data: priv = {} } = useQuery({ queryKey: ["admin-store-private"], queryFn: () => base44.admin.storePrivate() });
  const { data: rates = {} } = useQuery({ queryKey: ["admin-store-rates"], queryFn: () => base44.admin.storeRates() });
  const refresh = () => Promise.all(["admin-stores", "admin-store-rates", "admin-overview"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const { busy, error, run } = useAction(refresh);

  const list = useMemo(() => stores
    .filter((s) => filter === "todas" || s.status === filter)
    .filter((s) => !search.trim() || `${s.name} ${priv[s.id]?.owner_name || ""}`.toLowerCase().includes(search.trim().toLowerCase())),
  [stores, filter, search, priv]);
  const count = (st) => stores.filter((s) => s.status === st).length;

  const saveRate = (s) => {
    const raw = String(rateInput[s.id] ?? "").replace(",", ".").trim();
    const rate = raw === "" ? null : Number(raw) / 100;
    if (rate != null && (Number.isNaN(rate) || rate < 0 || rate > 0.5)) return run("x", async () => { throw new Error("Comissão deve ficar entre 0 e 50%"); });
    return run(`rate-${s.id}`, () => base44.admin.setStoreCommission(s.id, rate));
  };

  return (
    <div className="space-y-4">
      <Seg value={filter} onChange={setFilter} options={[["todas", `Todas (${stores.length})`], ["pending", `Aguardando (${count("pending")})`], ["approved", `Aprovadas (${count("approved")})`], ["suspended", `Suspensas (${count("suspended")})`]]} />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar loja ou responsável" className="h-11 rounded-xl" />
      <ErrorLine error={error} />
      {isLoading ? <Empty>Carregando…</Empty> : list.length === 0 ? <Empty>Nenhuma loja aqui.</Empty> : (
        <Card className="divide-y divide-border">
          {list.map((s) => {
            const p = priv[s.id] || {};
            const r = rates[s.id] || {};
            const expanded = open === s.id;
            const wa = waLink(p.owner_phone || s.phone, `Olá ${p.owner_name || ""}, aqui é do VizinhoMarket.`);
            return (
              <div key={s.id} className="p-4 space-y-3">
                <button type="button" onClick={() => setOpen(expanded ? null : s.id)} className="w-full flex items-start gap-3 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{categoryLabel(s.category)} · {p.owner_name || "sem responsável"} · comissão {pct(r.effective)}</p>
                  </div>
                  <Chip tone={ST[s.status][1]}>{ST[s.status][0]}</Chip>
                  <ChevronDown className={`w-4 h-4 mt-1 shrink-0 transition ${expanded ? "rotate-180" : ""}`} />
                </button>
                <div className="flex flex-wrap gap-2">
                  {s.status !== "approved" && <Btn variant="primary" busy={busy === `ap-${s.id}`} onClick={() => run(`ap-${s.id}`, () => base44.admin.setStoreStatus(s.id, "approved"))}>{s.status === "suspended" ? "Reativar" : "Aprovar"}</Btn>}
                  {s.status === "approved" && <Btn variant="danger" busy={busy === `su-${s.id}`} onClick={() => run(`su-${s.id}`, () => base44.admin.setStoreStatus(s.id, "suspended"), `Suspender ${s.name}? A loja some da vitrine na hora.`)}>Suspender</Btn>}
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="h-9 px-4 rounded-full text-xs font-semibold border border-border hover:bg-secondary flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>}
                  <Link to={`/loja/${s.id}`} className="h-9 px-4 rounded-full text-xs font-semibold border border-border hover:bg-secondary flex items-center">Ver loja</Link>
                </div>
                {expanded && (
                  <div className="rounded-xl bg-secondary/60 p-4 text-sm space-y-3">
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                      <p><span className="text-muted-foreground">Responsável:</span> {p.owner_name || "—"}</p>
                      <p><span className="text-muted-foreground">Telefone:</span> {p.owner_phone || s.phone || "—"}</p>
                      <p><span className="text-muted-foreground">CPF/CNPJ:</span> {p.document || "—"}</p>
                      <p><span className="text-muted-foreground">Chave Pix:</span> {p.pix_key || "—"}</p>
                      <p><span className="text-muted-foreground">Endereço:</span> {s.address || "—"}</p>
                      <p><span className="text-muted-foreground">Horário:</span> {s.opening_hours || "—"}</p>
                      <p><span className="text-muted-foreground">Taxa de entrega:</span> {brl(s.delivery_fee || 0)}</p>
                      <p><span className="text-muted-foreground">Cadastro:</span> {fmtDate(s.created_date)}</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
                      <label className="text-xs text-muted-foreground">Comissão negociada (%)
                        <Input value={rateInput[s.id] ?? (r.negotiated == null ? "" : String(r.negotiated * 100).replace(".", ","))}
                          onChange={(e) => setRateInput((x) => ({ ...x, [s.id]: e.target.value }))} placeholder={`padrão: ${pct(r.effective)}`} className="h-9 w-36 mt-1" inputMode="decimal" />
                      </label>
                      <Btn busy={busy === `rate-${s.id}`} onClick={() => saveRate(s)}>Salvar comissão</Btn>
                      <p className="text-xs text-muted-foreground w-full">Deixe vazio para usar a comissão padrão da categoria. Vale para os próximos pedidos.</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
