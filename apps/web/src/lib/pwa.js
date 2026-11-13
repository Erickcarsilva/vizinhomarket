// PWA do Cliente e do Entregador: registra o service worker e avisa quando há versão nova.
// O painel do comerciante usa outro service worker (sw-pedidos.js), só para o alarme de pedido.
export function registerPwa(onUpdate) {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", async () => {
    try {
      // Primeira visita: o service worker assume a página sem recarregar. Só recarrega quando é TROCA de versão.
      const hadController = Boolean(navigator.serviceWorker.controller);
      const reg = await navigator.serviceWorker.register("/sw.js");
      const ask = (w) => onUpdate && onUpdate(() => { w.postMessage("SKIP_WAITING"); });
      if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) ask(w); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; window.location.reload(); } });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch { /* sem service worker: o app funciona normalmente online */ }
  });
}
