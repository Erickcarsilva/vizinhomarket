import React, { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { brl } from "@/lib/constants";

export default function NewOrderAlert({ orders }) {
  const seen = useRef(new Set(orders.map((o) => o.id)));
  const [pending, setPending] = useState([]);

  const beep = () => {
    if (localStorage.getItem("perto_notify_sound") === "off") return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
      o.start();
      o.stop(ctx.currentTime + 0.7);
      o.onended = () => ctx.close();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const fresh = orders.filter((o) => o.status === "CREATED" && !seen.current.has(o.id));
    if (fresh.length && seen.current.size) {
      beep();
      setPending((p) => [...p, ...fresh.map((f) => f.id)]);
    }
    fresh.forEach((f) => seen.current.add(f.id));
  }, [orders]);

  const dismiss = (id) => setPending((p) => p.filter((x) => x !== id));
  const newOnes = orders.filter((o) => pending.includes(o.id));
  if (!newOnes.length || localStorage.getItem("perto_notify_visual") === "off") return null;

  return (
    <div className="fixed top-20 right-5 z-50 space-y-3 w-[20rem]">
      {newOnes.map((o) => (
        <div key={o.id} className="bg-card border border-border rounded-2xl shadow-lg p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Novo pedido recebido!</p>
            <p className="text-xs text-muted-foreground">{o.customer_name} · {brl(o.total)}</p>
          </div>
          <button onClick={() => dismiss(o.id)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}