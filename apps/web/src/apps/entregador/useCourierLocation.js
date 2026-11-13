import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

// Envia a posição só enquanto o entregador está online (e o app aberto). Ao ficar offline, o GPS é desligado.
// O servidor ignora envios a menos de 10 s; aqui enviamos no máximo a cada 15 s.
export function useCourierLocation(online) {
  const [state, setState] = useState({ status: "off", error: "" }); // off | waiting | ok | denied | unavailable
  const last = useRef(0);

  useEffect(() => {
    if (!online) { setState({ status: "off", error: "" }); return undefined; }
    if (!("geolocation" in navigator)) { setState({ status: "unavailable", error: "Este aparelho não informa a localização." }); return undefined; }
    setState({ status: "waiting", error: "" });
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        setState({ status: "ok", error: "" });
        const now = Date.now();
        if (now - last.current < 15000) return;
        last.current = now;
        try { await base44.courier.sendLocation(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy)); }
        catch { /* rede instável: tenta no próximo envio */ }
      },
      (err) => setState({
        status: err.code === 1 ? "denied" : "unavailable",
        error: err.code === 1 ? "Permita a localização para o cliente acompanhar a entrega." : "Não foi possível obter a localização agora.",
      }),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  return state;
}
