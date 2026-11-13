// Função do Supabase: cria (ou reaproveita) a cobrança online de um pedido. Chamada pelo app do cliente com o login dele.
// POST { "order_id": "..." } → { pix_copy_paste, pix_qr_base64, checkout_url, expires_at, amount, sandbox }
// Segredos: veja docs/PAGAMENTOS.md (provedor escolhido em platform_settings.payment_provider).
import { createPayment } from "../_shared/pagamentos/core.mjs";
import { admin, corsFor, currentProviderName, env, log, providerByName, reply, rpc } from "../_shared/pagamentos/deno.ts";

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "use POST" }, cors);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const userId = auth?.user?.id;
  let body: { order_id?: string } = {};
  try { body = await req.json(); } catch { /* vazio */ }

  let provider;
  try { provider = providerByName(await currentProviderName()); }
  catch (e) { log("provider_not_configured", { message: (e as Error).message }); return reply(503, { error: "Pagamento online indisponível no momento." }, cors); }

  const res = await createPayment({ userId, orderId: body.order_id }, {
    rpc, provider, log,
    notificationUrl: `${env.SUPABASE_URL}/functions/v1/pagamentos-webhook?provider=${provider.name}`,
    // Nome, e-mail e CPF (se a pessoa informou) vêm do banco, pela função do serviço.
    getPayer: async (id: string) => { const p = await rpc("svc_payer", { p_user_id: id }); return { ...p, name: p?.name || undefined }; },
  });
  return reply(res.status, res.body, cors);
});
