import { supabase } from "@/api/supabase";

// Aviso no celular/computador mesmo com o painel fechado (Web Push).
// Precisa da chave pública VAPID no site (VITE_VAPID_PUBLIC_KEY) e da função novo-pedido no Supabase.
const PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();
const SW_URL = "/sw-pedidos.js";

const b64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

// unsupported | ios-home (iPhone: precisa adicionar à tela inicial) | not-configured | denied | on | off
export async function pushStatus() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !isStandalone() ? "ios-home" : "unsupported";
  }
  if (!PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? "on" : "off";
}

async function saveSubscription(sub) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login para ativar o aviso");
  const token = JSON.stringify(sub.toJSON ? sub.toJSON() : sub);
  const { error } = await supabase.from("push_tokens").insert({ user_id: user.id, app: "partner", token });
  if (error && error.code !== "23505") throw new Error(error.message); // 23505 = este aparelho já estava cadastrado
}

// Pede permissão, registra o service worker e guarda a inscrição deste aparelho na conta.
export async function enablePush() {
  const status = await pushStatus();
  if (status === "on" || status === "unsupported" || status === "ios-home" || status === "not-configured") return status;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(PUBLIC_KEY) });
  await saveSubscription(sub);
  return "on";
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration(SW_URL);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return "off";
  const token = JSON.stringify(sub.toJSON ? sub.toJSON() : sub);
  await supabase.from("push_tokens").delete().eq("app", "partner").eq("token", token);
  await sub.unsubscribe().catch(() => {});
  return "off";
}
