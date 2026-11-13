// Função do Supabase: recebe os avisos (webhooks) do gateway. Publicada sem login (--no-verify-jwt):
// a autenticidade é conferida pela assinatura do provedor, e o status é consultado na API do provedor.
// URL: <SUPABASE_URL>/functions/v1/pagamentos-webhook?provider=mercadopago|asaas|sandbox
import { handleWebhook } from "../_shared/pagamentos/core.mjs";
import { log, providerByName, reply, rpc } from "../_shared/pagamentos/deno.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "use POST" });
  const url = new URL(req.url);
  let provider;
  try { provider = providerByName(url.searchParams.get("provider") || ""); }
  catch (e) { log("webhook_provider_invalid", { message: (e as Error).message }); return reply(400, { error: "provedor inválido" }); }
  const rawBody = await req.text();
  if (rawBody.length > 64_000) return reply(413, { error: "corpo grande demais" });
  const res = await handleWebhook({ headers: req.headers, rawBody, url: req.url }, { rpc, provider, log });
  return reply(res.status, res.body);
});
