// Testes de integração da camada de pagamentos: as regras reais das Edge Functions (core.mjs + providers.mjs)
// contra o banco real (PGlite), com o gateway simulado (sandbox) e chamadas HTTP do Mercado Pago/Asaas falsas.
// Uso: node supabase/tests/gateway.mjs
import { setupDb, baseScenario } from './lib.mjs';
import { createPayment, handleWebhook, processRefunds } from '../functions/_shared/pagamentos/core.mjs';
import { sandboxProvider, mercadoPagoProvider, asaasProvider, providerFromEnv } from '../functions/_shared/pagamentos/providers.mjs';

const t = await setupDb();
const { q, as, su, ok, fails, eq, mk } = t;
const { city, bairro, mkStore } = await baseScenario(t);
const A = await mkStore('donoA', 'Mercado A');
const cust = await mk('cliente'), other = await mk('outro');
await su();
const [{ id: pA }] = await q("insert into public.products (store_id, name, price) values ($1, 'Café', 25) returning id", [A.id]);
await q("update public.platform_settings set value = 'true' where key = 'online_payments_enabled'");
await q('update public.stores set accepts_online_payment = true where id = $1', [A.id]);

// rpc como o service_role (igual à Edge Function)
const SETOF = new Set(['svc_refunds_to_process']);
const rpc = async (fn, args) => {
  await as('service');
  const keys = Object.keys(args);
  const params = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  try {
    if (SETOF.has(fn)) return await q(`select * from ${call}`, params);
    const [row] = await q(`select ${call} as r`, params);
    return row.r;
  } catch (e) { const err = new Error(e.message); err.code = e.code; throw err; }
};
const logs = [];
const log = (event, data) => logs.push({ event, ...data });
const getPayer = async (id) => ({ id, email: 'cliente@teste.local', name: 'Cliente', document: '11144477735' });

let seq = 0;
const newOrder = async (method = 'pix', user = cust) => {
  await as(user);
  const [{ id }] = await q("select public.create_order($1, $2::jsonb, 'pickup', $3, $4, 'Cliente', '67988887777', null, null, null, null, 'online', null) id",
    [A.id, JSON.stringify([{ product_id: pA, quantity: 2 }]), method, `gw-${++seq}-${Date.now()}`]);
  return id;
};
const orderRow = async (id) => { await su(); return (await q('select * from public.orders where id = $1', [id]))[0]; };

const sandbox = sandboxProvider({ secret: 'segredo-de-teste' });
const deps = { rpc, provider: sandbox, getPayer, notificationUrl: 'https://exemplo/webhook', log };
const signed = async (body) => { const raw = JSON.stringify(body); return { raw, headers: { 'x-sandbox-signature': await sandbox.sign(raw) } }; };

// ---------- Sandbox ponta a ponta ----------
let o1, charge1;
await ok('Cobrança Pix gerada com o valor calculado no servidor', async () => {
  o1 = await newOrder();
  const res = await createPayment({ userId: cust.id, orderId: o1 }, deps);
  charge1 = res.body;
  eq(res.status, 200); eq(res.body.amount, 50); eq(res.body.sandbox, true);
  return /SIMULACAO/.test(res.body.pix_copy_paste);
});
await ok('Pedir a cobrança de novo devolve a mesma (sem gerar outro Pix)', async () => {
  const res = await createPayment({ userId: cust.id, orderId: o1 }, deps);
  return eq(res.body.payment_id, charge1.payment_id);
});
await ok('Sem login é recusado', async () => eq((await createPayment({ userId: null, orderId: o1 }, deps)).status, 401));
await ok('Outro usuário não gera cobrança do pedido alheio', async () => eq((await createPayment({ userId: other.id, orderId: o1 }, deps)).status, 400));
await ok('Webhook com assinatura inválida é recusado (401) e nada muda', async () => {
  const res = await handleWebhook({ headers: { 'x-sandbox-signature': 'abc' }, rawBody: JSON.stringify({ event_id: 'e1', provider_payment_id: 'x', status: 'paid', paid_amount: 50 }), url: 'https://x' }, deps);
  eq(res.status, 401); return eq((await orderRow(o1)).payment_status, 'awaiting_payment');
});
const ppid1 = 'sbx_' + charge1.payment_id.replace(/-/g, '').slice(0, 20);
await ok('Webhook assinado confirma o pagamento', async () => {
  const { raw, headers } = await signed({ event_id: 'ev-1', provider_payment_id: ppid1, status: 'paid', paid_amount: 50 });
  const res = await handleWebhook({ headers, rawBody: raw, url: 'https://x' }, deps);
  eq(res.body.result, 'paid'); return eq((await orderRow(o1)).payment_status, 'paid');
});
await ok('Webhook duplicado não processa de novo', async () => {
  const { raw, headers } = await signed({ event_id: 'ev-1', provider_payment_id: ppid1, status: 'paid', paid_amount: 50 });
  return eq((await handleWebhook({ headers, rawBody: raw, url: 'https://x' }, deps)).body.result, 'duplicate');
});
await ok('Pedido já pago: nova cobrança é recusada (409)', async () => eq((await createPayment({ userId: cust.id, orderId: o1 }, deps)).status, 409));
await ok('Pagamento recusado pelo banco deixa o pedido como falho (cliente pode tentar de novo)', async () => {
  const o = await newOrder();
  const c = (await createPayment({ userId: cust.id, orderId: o }, deps)).body;
  const { raw, headers } = await signed({ event_id: 'ev-rej', provider_payment_id: 'sbx_' + c.payment_id.replace(/-/g, '').slice(0, 20), status: 'failed' });
  await handleWebhook({ headers, rawBody: raw, url: 'https://x' }, deps);
  eq((await orderRow(o)).payment_status, 'failed');
  const again = await createPayment({ userId: cust.id, orderId: o }, deps);
  eq(again.status, 200); return again.body.payment_id !== c.payment_id;
});

// ---------- Gateway fora do ar ----------
await ok('Gateway indisponível: 502 com mensagem clara e tentativa marcada como falha', async () => {
  const o = await newOrder();
  const down = { ...sandbox, createCharge: async () => { throw new Error('ECONNREFUSED'); } };
  const res = await createPayment({ userId: cust.id, orderId: o }, { ...deps, provider: down });
  eq(res.status, 502);
  await su();
  eq((await q("select status from public.payments where order_id = $1", [o]))[0].status, 'failed');
  return /tente de novo/i.test(res.body.error);
});
await ok('Falha temporária no webhook devolve 500 (o provedor reenvia)', async () => {
  const brokenRpc = async () => { throw new Error('banco fora do ar'); };
  const { raw, headers } = await signed({ event_id: 'ev-x', provider_payment_id: 'x', status: 'paid', paid_amount: 1 });
  return eq((await handleWebhook({ headers, rawBody: raw, url: 'https://x' }, { ...deps, rpc: brokenRpc })).status, 500);
});

// ---------- Estornos ----------
await ok('Cancelar pedido pago e rodar o processador estorna no gateway', async () => {
  await as(A.owner);
  await q("select public.cancel_order($1, 'sem estoque')", [o1]);
  const out = await processRefunds({ rpc, providers: () => sandbox, log });
  eq(out.processed, 1);
  return eq((await orderRow(o1)).payment_status, 'refunded');
});
await ok('Estorno com gateway falhando fica para nova tentativa', async () => {
  const o = await newOrder();
  const c = (await createPayment({ userId: cust.id, orderId: o }, deps)).body;
  const { raw, headers } = await signed({ event_id: 'ev-r2', provider_payment_id: 'sbx_' + c.payment_id.replace(/-/g, '').slice(0, 20), status: 'paid', paid_amount: 50 });
  await handleWebhook({ headers, rawBody: raw, url: 'https://x' }, deps);
  await as(cust); await q("select public.cancel_order($1, '')", [o]);
  const failing = { ...sandbox, refund: async () => { throw new Error('timeout'); } };
  const out = await processRefunds({ rpc, providers: () => failing, log });
  eq(out.failed, 1);
  await su();
  eq((await q('select status from public.refunds where order_id = $1', [o]))[0].status, 'approved');
  const out2 = await processRefunds({ rpc, providers: () => sandbox, log });
  return eq(out2.processed, 1);
});

// ---------- Sandbox bloqueado em produção ----------
await fails('Sandbox não sobe sem PAYMENTS_ALLOW_SANDBOX=1', async () => providerFromEnv('sandbox', { SANDBOX_WEBHOOK_SECRET: 'x' }), 'bloqueado');
await fails('Provedor desconhecido é recusado', async () => providerFromEnv('paypal', {}), 'desconhecido');

// ---------- Mercado Pago (HTTP simulado) ----------
const calls = [];
const mpFetch = async (url, init = {}) => {
  calls.push({ url, init });
  const ok = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
  if (url.endsWith('/v1/payments') && init.method === 'POST') {
    return ok({ id: 123456, status: 'pending', point_of_interaction: { transaction_data: { qr_code: '00020126MP', qr_code_base64: 'iVBOR' } } });
  }
  if (url.includes('/v1/payments/123456') && !url.endsWith('refunds')) return ok({ id: 123456, status: 'approved', transaction_amount: 50, external_reference: null });
  if (url.endsWith('/refunds')) return ok({ id: 999 });
  return { ok: false, status: 404, text: async () => '{}' };
};
const mp = mercadoPagoProvider({ accessToken: 'TEST-token', webhookSecret: 'mp-secret', fetchImpl: mpFetch });
await ok('Mercado Pago: cria Pix com chave de idempotência e valor do pedido', async () => {
  const r = await mp.createCharge({ paymentId: 'pay-uuid-1', amount: 50, method: 'pix', description: 'Pedido VM-1', payer: { email: 'a@b.c', name: 'A' } });
  const c = calls[0]; const body = JSON.parse(c.init.body);
  eq(c.init.headers['X-Idempotency-Key'], 'pay-uuid-1'); eq(body.transaction_amount, 50); eq(body.payment_method_id, 'pix');
  eq(body.external_reference, 'pay-uuid-1'); eq(r.providerPaymentId, '123456'); return eq(r.pixCopyPaste, '00020126MP');
});
const mpSign = async (dataId, requestId, ts, secret = 'mp-secret') => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${dataId};request-id:${requestId};ts:${ts};`));
  return `ts=${ts},v1=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};
await ok('Mercado Pago: webhook com assinatura válida é aceito', async () => {
  const r = await mp.parseWebhook({ headers: { 'x-signature': await mpSign('123456', 'req-1', '1700000000'), 'x-request-id': 'req-1' },
    rawBody: JSON.stringify({ type: 'payment', data: { id: '123456' } }), url: 'https://x/webhook?data.id=123456&type=payment' });
  eq(r.ok, true); return eq(r.providerPaymentId, '123456');
});
await ok('Mercado Pago: assinatura com segredo errado é recusada', async () => {
  const r = await mp.parseWebhook({ headers: { 'x-signature': await mpSign('123456', 'req-1', '1700000000', 'outro'), 'x-request-id': 'req-1' },
    rawBody: JSON.stringify({ type: 'payment', data: { id: '123456' } }), url: 'https://x/webhook?data.id=123456' });
  return eq(r.ok, false);
});
await ok('Mercado Pago: status vem da API (aprovado → pago), não do corpo do webhook', async () => {
  const p = await mp.getPayment('123456'); eq(p.status, 'paid'); return eq(p.paidAmount, 50);
});
await ok('Mercado Pago: erro 500 do gateway vira erro com nova tentativa', async () => {
  const bad = mercadoPagoProvider({ accessToken: 't', fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'erro' }) });
  try { await bad.getPayment('1'); return false; } catch (e) { eq(e.retryable, true); return eq(e.status, 500); }
});

// ---------- Asaas (HTTP simulado) ----------
const asCalls = [];
const asFetch = async (url, init = {}) => {
  asCalls.push({ url, init });
  const ok = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
  if (url.endsWith('/customers')) return ok({ id: 'cus_1' });
  if (url.endsWith('/payments') && init.method === 'POST') return ok({ id: 'pay_1', invoiceUrl: 'https://asaas/i/1' });
  if (url.endsWith('/pixQrCode')) return ok({ payload: '00020126AS', encodedImage: 'iVBOR', expirationDate: '2026-11-14 23:59:59' });
  return ok({});
};
const asaas = asaasProvider({ apiKey: 'k', webhookToken: 'tok', fetchImpl: asFetch });
await ok('Asaas: cobrança Pix com split para a carteira da loja', async () => {
  const r = await asaas.createCharge({ paymentId: 'p1', amount: 50, method: 'pix', description: 'Pedido', payer: { id: 'u', name: 'A', email: 'a@b.c', document: '11144477735' },
    split: { walletId: 'wal_loja', amount: 45 } });
  const body = JSON.parse(asCalls[1].init.body);
  eq(body.split[0].walletId, 'wal_loja'); eq(body.split[0].fixedValue, 45); eq(body.billingType, 'PIX');
  return eq(r.pixCopyPaste, '00020126AS');
});
await fails('Asaas: sem CPF do pagador não cria cobrança', () => asaas.createCharge({ paymentId: 'p2', amount: 10, method: 'pix', payer: { name: 'A' } }), 'CPF');
await ok('Asaas: webhook com token errado é recusado', async () => eq((await asaas.parseWebhook({ headers: { 'asaas-access-token': 'x' }, rawBody: '{}' })).ok, false));
await ok('Logs não levam dados pessoais', async () => !JSON.stringify(logs).match(/cliente@teste|11144477735|67988887777/));

process.exit(t.report() ? 0 : 1);
