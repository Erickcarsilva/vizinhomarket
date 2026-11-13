// Função do Supabase: executa no gateway os estornos aprovados. Chamada a cada 5 minutos pelo pg_cron (via pg_net),
// com o header x-cron-secret igual ao segredo CRON_SECRET. Sem o segredo, recusa.
import { processRefunds } from "../_shared/pagamentos/core.mjs";
import { env, log, providerByName, reply, rpc } from "../_shared/pagamentos/deno.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "use POST" });
  const secret = req.headers.get("x-cron-secret") || "";
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) return reply(401, { error: "não autorizado" });
  const out = await processRefunds({ rpc, providers: providerByName, log });
  log("refunds_run", out);
  return reply(200, out);
});
