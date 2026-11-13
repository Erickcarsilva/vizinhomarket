// Service worker do App do Cliente e do App do Entregador (PWA).
// Regras: só guarda arquivos do próprio site (telas e imagens do app). NUNCA guarda chamadas à API, login,
// pagamentos ou qualquer coisa que não seja GET: pedido e pagamento só valem com resposta do servidor.
const VERSION = "vm-v1";
const SHELL = ["/", "/offline.html", "/favicon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// O app pede para ativar a versão nova (botão "Atualizar").
self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // API (Supabase), gateways e mapas: sempre rede
  if (req.mode === "navigate") {
    // Telas: rede primeiro (sempre a versão mais nova); sem internet, a última tela guardada ou o aviso offline.
    event.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); return res; })
      .catch(() => caches.match("/").then((r) => r || caches.match("/offline.html"))));
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|woff2?|webp|jpg)$/.test(url.pathname)) {
    // Arquivos com nome versionado: guarda e reaproveita.
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});

// Notificações (status do pedido, corrida nova) quando a função de push estiver configurada.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "VizinhoMarket", {
    body: data.body || "", tag: data.tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: data.url || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/"));
});
