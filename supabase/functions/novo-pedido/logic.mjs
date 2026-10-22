// Regra do aviso de pedido novo (sem dependências, testada em e2e/push.mjs).
// Recebe o id do pedido, confere no banco e manda o aviso para os aparelhos da equipe da loja.
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function handleNewOrder(orderId, { db, send, now = Date.now(), maxAgeMin = 15 }) {
  if (!orderId) return { skipped: "sem_pedido" };
  const o = await db.getOrder(orderId);
  if (!o) return { skipped: "nao_encontrado" };
  if (o.status !== "CREATED") return { skipped: "status" };
  if (now - Date.parse(o.created_at) > maxAgeMin * 60e3) return { skipped: "antigo" };

  const tokens = await db.getPartnerTokens(o.store_id);
  const payload = JSON.stringify({
    title: "Novo pedido!",
    body: `${o.code} · ${o.customer_name || "Cliente"} · ${brl(o.total)}. Toque para aceitar.`,
    url: "/",
    tag: o.id,
  });
  let sent = 0, removed = 0, failed = 0;
  for (const t of tokens) {
    let sub;
    try { sub = JSON.parse(t.token); } catch { await db.deleteToken(t.id); removed++; continue; }
    try {
      await send(sub, payload);
      sent++;
    } catch (e) {
      // 404/410: o aparelho cancelou a inscrição (desinstalou, limpou o navegador). Remove para não tentar de novo.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { await db.deleteToken(t.id); removed++; } else failed++;
    }
  }
  return { sent, removed, failed };
}
