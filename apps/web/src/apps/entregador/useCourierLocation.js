import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

// Envia a posição só enquanto o entregador está online (e o app aberto). Ao ficar offline, o GPS é desligado.
// O servidor ignora envios a menos de 10 s; aqui enviamos no máximo a cada 15 s.
export function useCourierLocation(online) {
  const [state, setState] = useState({ status: "off", error: "" }); // off | waiting | ok | denied | unavailable
  const last = useRef(0);
  const pos = useRef(null);

  useEffect(() => {
    if (!online) { setState({ status: "off", error: "" }); return undefined; }
    if (!("geolocation" in navigator)) { setState({ status: "unavailable", error: "Este aparelho não informa a localização." }); return undefined; }
    setState({ status: "waiting", error: "" });
    const send = async () => {
      const p = pos.current;
      if (!p || Date.now() - last.current < 15000) return;
      last.current = Date.now();
      try { await base44.courier.sendLocation(p.coords.latitude, p.coords.longitude, Math.round(p.coords.accuracy)); }
      catch { /* rede instável: tenta no próximo envio */ }
    };
    // Parado (esperando na loja) o GPS não manda posição nova: reenviamos a última a cada 20 s enquanto online.
    const timer = setInterval(send, 20000);
    const id = navigator.geolocation.watchPosition(
      (p) => { pos.current = p; setState({ status: "ok", error: "" }); send(); },
      (err) => setState({
        status: err.code === 1 ? "denied" : "unavailable",
        error: err.code === 1 ? "Permita a localização para o cliente acompanhar a entrega." : "Não foi possível obter a localização agora.",
      }),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => { navigator.geolocation.clearWatch(id); clearInterval(timer); pos.current = null; };
  }, [online]);

  return state;
}
