// Função do Supabase: envia os avisos da fila (notification_outbox) por Web Push para clientes e entregadores.
// Chamada a cada minuto pelo pg_cron (via pg_net) com o header x-cron-secret. Segredos: VAPID_* e CRON_SECRET.
import webpush from "npm:web-push@3.6.7";
import { sendQueued } from "./logic.mjs";
import { env, log, reply, rpc } from "../_shared/pagamentos/deno.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "use POST" });
  if (!env.CRON_SECRET || req.headers.get("x-cron-secret") !== env.CRON_SECRET) return reply(401, { error: "não autorizado" });
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return reply(503, { skipped: "sem_chaves_vapid" });
  webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:contato@vizinhomarket.app", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const out = await sendQueued({ rpc, send: (sub: webpush.PushSubscription, p: string) => webpush.sendNotification(sub, p, { TTL: 900 }) });
  log("avisos_enviados", out);
  return reply(200, out);
});
