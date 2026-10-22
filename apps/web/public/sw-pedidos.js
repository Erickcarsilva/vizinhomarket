// Service worker do Painel do Comerciante: mostra o aviso de pedido novo mesmo com o painel fechado.
// O servidor (função novo-pedido) manda {title, body, url, tag}.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Novo pedido!";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Abra o painel para aceitar.",
    tag: data.tag || "novo-pedido",
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300, 150, 600],
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find((c) => c.url.startsWith(self.location.origin));
    if (open) { await open.focus(); if ("navigate" in open) await open.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
