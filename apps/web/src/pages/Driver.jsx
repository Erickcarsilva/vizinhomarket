import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigation, Check, Phone, MapPin, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { brl, STATUS, FULFILLMENT, PAYMENT } from "@/lib/constants";
import DeliveryMap from "@/components/driver/DeliveryMap";

const CITY = [-20.9106, -54.6361];
const geocode = async (address) => {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${address}, Sidrolândia, MS, Brasil`)}`);
  const d = await r.json();
  return d[0] ? [Number(d[0].lat), Number(d[0].lon)] : null;
};
const route = async (from, to) => {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
  const d = await r.json();
  return d.routes?.[0]?.geometry?.coordinates || null;
};

export default function Driver() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState(localStorage.getItem("perto_driver_active") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: orders = [] } = useQuery({ queryKey: ["orders", "all"], queryFn: () => base44.entities.Order.list("-created_date", 1000) });
  useEffect(() => base44.entities.Order.subscribe(() => qc.invalidateQueries({ queryKey: ["orders", "all"] })), [qc]);

  const active = orders.find((o) => o.id === activeId && o.status !== "DELIVERED" && o.status !== "CANCELLED");
  const available = orders.filter((o) => o.status === "READY" && ["loja", "plataforma"].includes(o.fulfillment) && o.id !== activeId);

  const { data: store } = useQuery({
    queryKey: ["store", active?.store_id],
    queryFn: () => base44.entities.Store.get(active.store_id),
    enabled: !!active,
  });

  const [coords, setCoords] = useState({ from: null, to: null, route: null });
  const [loadingMap, setLoadingMap] = useState(false);
  useEffect(() => {
    let on = true;
    setCoords({ from: null, to: null, route: null });
    if (!active || !store) return;
    setLoadingMap(true);
    (async () => {
      const to = await geocode(active.address).catch(() => null);
      const from = await geocode(store.address).catch(() => null);
      if (!on) return;
      if (from && to) {
        const rt = await route(from, to).catch(() => null);
        if (!on) return;
        setCoords({ from, to, route: rt });
      } else {
        setCoords({ from: from || CITY, to: to || CITY, route: null });
      }
      setLoadingMap(false);
    })();
    return () => { on = false; };
  }, [active?.id, store?.address]);

  const assume = async (o) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await base44.entities.Order.update(o.id, {
        status: "IN_TRANSIT",
        status_history: [...(o.status_history || []), { status: "IN_TRANSIT", at: new Date().toISOString() }],
      });
      setActiveId(o.id);
      localStorage.setItem("perto_driver_active", o.id);
      qc.invalidateQueries({ queryKey: ["orders", "all"] });
    } catch (e) {
      setError("Não foi possível assumir esta entrega. Talvez ela já tenha sido assumida por outro entregador.");
    } finally {
      setBusy(false);
    }
  };
  const deliver = async () => {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    try {
      await base44.entities.Order.update(active.id, {
        status: "DELIVERED",
        status_history: [...(active.status_history || []), { status: "DELIVERED", at: new Date().toISOString() }],
      });
      setActiveId("");
      localStorage.removeItem("perto_driver_active");
      qc.invalidateQueries({ queryKey: ["orders", "all"] });
    } catch (e) {
      setError("Não foi possível confirmar a entrega. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const navUrl = coords.to ? `https://www.google.com/maps/dir/?api=1&destination=${coords.to[0]},${coords.to[1]}` : null;

  return (
    <div className="max-w-5xl mx-auto px-5 py-12 space-y-10">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-semibold">Área do entregador</p>
        <h1 className="font-display text-4xl mt-2">Entregas em Sidrolândia</h1>
      </div>

      {error && <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3">{error}</div>}

      {active && (
        <section className="space-y-5">
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="font-display text-2xl">{active.customer_name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><MapPin className="w-4 h-4" />{active.address || "Retirada no local"}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="w-4 h-4" />{active.customer_phone}</p>
              <p className="text-xs text-muted-foreground mt-2">{active.store_name} · {FULFILLMENT[active.fulfillment]} · {PAYMENT[active.payment_method]} · {brl(active.total)}</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full w-fit ${STATUS[active.status].tone}`}>{STATUS[active.status].label}</span>
          </div>

          {active.address ? (
            <>
              <div className="relative">
                <DeliveryMap from={coords.from} to={coords.to} route={coords.route} />
                {loadingMap && <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-2xl text-sm text-muted-foreground">Calculando rota…</div>}
              </div>
              <div className="flex flex-wrap gap-3">
                {navUrl && (
                  <a href={navUrl} target="_blank" rel="noreferrer" className="h-12 px-6 rounded-full bg-accent text-accent-foreground font-semibold flex items-center gap-2 hover:opacity-90">
                    <Navigation className="w-4 h-4" /> Navegar no Google Maps
                  </a>
                )}
                <button onClick={deliver} disabled={busy} className="h-12 px-6 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Check className="w-4 h-4" /> {busy ? "Confirmando..." : "Confirmar entrega"}
                </button>
              </div>
            </>
          ) : (
            <button onClick={deliver} disabled={busy} className="h-12 px-6 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Check className="w-4 h-4" /> {busy ? "Confirmando..." : "Confirmar retirada"}
            </button>
          )}
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl mb-4 flex items-center gap-2"><Package className="w-5 h-5" /> Prontos para entrega</h2>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-2xl p-8 text-center">Nenhuma entrega disponível no momento.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {available.map((o) => (
              <div key={o.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <p className="font-semibold">{o.customer_name} <span className="text-xs text-muted-foreground">· {o.store_name}</span></p>
                <p className="text-sm text-muted-foreground flex items-start gap-1.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0" />{o.address}</p>
                <p className="text-xs text-muted-foreground">{o.items.length} itens · {brl(o.total)}</p>
                <button onClick={() => assume(o)} disabled={busy} className="w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">{busy ? "Assumindo..." : "Assumir entrega"}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}