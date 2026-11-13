// Envio dos avisos da fila (cliente: andamento do pedido; entregador: corrida nova). Sem dependências: testado em Node.
// deps: { rpc(fn, args), send(subscription, payloadString) → Promise }
export async function sendQueued({ rpc, send, limit = 50 }) {
  const rows = (await rpc('svc_take_notifications', { p_limit: limit })) || [];
  let sent = 0, removed = 0, failed = 0, noDevice = 0;
  for (const n of rows) {
    const tokens = Array.isArray(n.tokens) ? n.tokens : [];
    if (!tokens.length) { noDevice++; continue; }
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag || undefined });
    for (const t of tokens) {
      let sub;
      try { sub = JSON.parse(t.token); } catch { await rpc('svc_drop_push_token', { p_id: t.id }); removed++; continue; }
      try { await send(sub, payload); sent++; }
      catch (e) {
        // 404/410: o aparelho cancelou a inscrição. Remove para não tentar de novo.
        if (e && (e.statusCode === 404 || e.statusCode === 410)) { await rpc('svc_drop_push_token', { p_id: t.id }); removed++; } else failed++;
      }
    }
  }
  return { notifications: rows.length, sent, removed, failed, noDevice };
}
