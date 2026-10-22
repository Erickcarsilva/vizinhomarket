// Função do Supabase: avisa a equipe da loja quando chega pedido novo (Web Push).
// Chamada pelo gatilho do banco (06_aviso_pedido_novo.sql) com {"order_id": "..."}.
// Segredos (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem em toda função do Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";
import { handleNewOrder } from "./logic.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// As chaves são lidas a cada chamada: assim a função sobe mesmo antes de os segredos serem cadastrados.
function vapidReady() {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:contato@vizinhomarket.app", pub, priv);
  return true;
}

const store = {
  async getOrder(id: string) {
    const { data } = await db.from("orders").select("id, code, store_id, status, created_at, customer_name, total").eq("id", id).maybeSingle();
    return data;
  },
  async getPartnerTokens(storeId: string) {
    const { data: members } = await db.from("store_members").select("user_id").eq("store_id", storeId);
    const ids = (members || []).map((m) => m.user_id);
    if (!ids.length) return [];
    const { data } = await db.from("push_tokens").select("id, token").eq("app", "partner").in("user_id", ids);
    return data || [];
  },
  async deleteToken(id: string) { await db.from("push_tokens").delete().eq("id", id); },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  if (!vapidReady()) return new Response(JSON.stringify({ skipped: "sem_chaves_vapid" }), { status: 503, headers: { "Content-Type": "application/json" } });
  let body: { order_id?: string; record?: { id?: string } } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const orderId = body.order_id || body.record?.id;
  const result = await handleNewOrder(orderId, {
    db: store,
    send: (sub: webpush.PushSubscription, payload: string) => webpush.sendNotification(sub, payload, { TTL: 600, urgency: "high" }),
  });
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
