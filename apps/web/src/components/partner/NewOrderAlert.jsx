import React, { useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import { brl } from "@/lib/constants";
import { enablePush } from "@/lib/push";

// Alerta de pedido novo para o balcão:
// - bipe que repete a cada 5 s enquanto houver pedido esperando aceite;
// - aviso do sistema (notificação) quando o app está em segundo plano;
// - mantém a tela acesa enquanto o painel está aberto;
// - pisca o título da aba.
// O navegador só libera som depois de um toque na tela, por isso o botão "Ativar alertas".
const SOUND_KEY = "perto_notify_sound";
const VISUAL_KEY = "perto_notify_visual";
const pref = (k) => { try { return localStorage.getItem(k) !== "off"; } catch { return true; } };

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((d, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = "square";
      o.frequency.value = i === 1 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
      o.start(t + d); o.stop(t + d + 0.22);
    });
  } catch { /* sem áudio */ }
}

export default function NewOrderAlert({ orders, ready = true }) {
  // Pedidos que já existiam quando o painel abriu não disparam alarme.
  const seen = useRef(new Set());
  const initialized = useRef(false);
  const [pending, setPending] = useState([]);
  const [armed, setArmed] = useState(false);
  const wakeLock = useRef(null);
  const waiting = orders.filter((o) => o.status === "CREATED");
  const waitingIds = waiting.map((o) => o.id).join();

  // Pedido novo chegou
  useEffect(() => {
    if (!ready) return;
    if (!initialized.current) { orders.forEach((o) => seen.current.add(o.id)); initialized.current = true; return; }
    const fresh = orders.filter((o) => o.status === "CREATED" && !seen.current.has(o.id));
    if (fresh.length) {
      if (pref(SOUND_KEY)) beep();
      setPending((p) => [...new Set([...p, ...fresh.map((f) => f.id)])]);
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        fresh.forEach((o) => { try { new Notification("Novo pedido!", { body: `${o.customer_name} · ${brl(o.total)}`, tag: o.id, requireInteraction: true }); } catch { /* ignora */ } });
      }
    }
    fresh.forEach((f) => seen.current.add(f.id));
  }, [orders, ready]);

  // Enquanto houver pedido esperando: bipe a cada 5 s e título piscando
  useEffect(() => {
    if (!waiting.length) { document.title = "VizinhoMarket"; return undefined; }
    let on = false;
    const id = setInterval(() => {
      if (pref(SOUND_KEY)) beep();
      on = !on;
      document.title = on ? `(${waiting.length}) NOVO PEDIDO` : "VizinhoMarket";
    }, 5000);
    return () => { clearInterval(id); document.title = "VizinhoMarket"; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingIds]);

  // Pedido aceito/cancelado sai da lista de avisos
  useEffect(() => { setPending((p) => p.filter((id) => waiting.some((o) => o.id === id))); }, [waitingIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tela acesa enquanto o painel estiver aberto (quando o aparelho permite)
  useEffect(() => {
    if (!armed || !("wakeLock" in navigator)) return undefined;
    const lock = async () => { try { wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* sem permissão */ } };
    lock();
    const again = () => document.visibilityState === "visible" && lock();
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); wakeLock.current?.release?.().catch(() => {}); };
  }, [armed]);

  const arm = async () => {
    beep(); // o toque libera o som no navegador
    setArmed(true);
    // Também liga o aviso com o painel fechado, quando o aparelho e o site permitem (senão fica só o aviso comum).
    try {
      const st = await enablePush();
      if (st !== "on" && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    } catch { /* sem aviso no aparelho: o alarme da tela continua */ }
  };

  const dismiss = (id) => setPending((p) => p.filter((x) => x !== id));
  const newOnes = orders.filter((o) => pending.includes(o.id));

  return (
    <>
      {!armed && (
        <button type="button" onClick={arm} className="w-full rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left flex items-center gap-3">
          <BellRing className="w-5 h-5 text-accent shrink-0" />
          <span className="text-sm"><strong>Toque aqui para ativar os alertas de pedido.</strong> Som, aviso na tela e tela sempre acesa enquanto o painel estiver aberto.</span>
        </button>
      )}
      {newOnes.length > 0 && pref(VISUAL_KEY) && (
        <div className="fixed top-20 right-5 left-5 sm:left-auto z-50 space-y-3 sm:w-[20rem]">
          {newOnes.map((o) => (
            <div key={o.id} className="bg-card border-2 border-accent rounded-2xl shadow-lg p-4 flex items-start gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Novo pedido! Aceite para parar o alarme.</p>
                <p className="text-xs text-muted-foreground">{o.customer_name} · {brl(o.total)}</p>
              </div>
              <button onClick={() => dismiss(o.id)} aria-label="Fechar aviso" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
