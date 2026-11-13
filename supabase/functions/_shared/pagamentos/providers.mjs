// Adaptadores de gateway de pagamento. Todos expõem a mesma interface, para trocar de provedor sem mexer no negócio:
//   createCharge({ paymentId, amount, method, description, payer, expiresAt, notificationUrl, split })
//       → { providerPaymentId, pixCopyPaste?, pixQrBase64?, checkoutUrl?, expiresAt? }
//   getPayment(providerPaymentId) → { status: 'pending'|'paid'|'failed'|'expired'|'cancelled'|'refunded', paidAmount, externalReference }
//   refund(providerPaymentId, amount, idempotencyKey) → { providerRefundId }
//   parseWebhook({ headers, rawBody, url }) → { ok, eventId, providerPaymentId, trustedStatus? }   (assinatura conferida aqui)
// Sem dependências: usa fetch e Web Crypto (Node 18+ e Deno).
//
// Regra de segurança: o corpo do webhook NUNCA é a fonte do status (exceto no sandbox, que é assinado e não movimenta dinheiro).
// Depois de validar a assinatura, o status é consultado na API do provedor.

const enc = new TextEncoder();
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const header = (headers, name) => (typeof headers.get === 'function' ? headers.get(name) : headers[name.toLowerCase()]) ?? null;
const round2 = (v) => Math.round(Number(v) * 100) / 100;

export class ProviderError extends Error {
  constructor(message, { status, retryable = true, body } = {}) { super(message); this.status = status; this.retryable = retryable; this.body = body; }
}

async function call(fetchImpl, url, init, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try { res = await fetchImpl(url, { ...init, signal: ctrl.signal }); }
  catch (e) { throw new ProviderError(`Gateway indisponível: ${e.message}`, { retryable: true }); }
  finally { clearTimeout(timer); }
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new ProviderError(`Gateway respondeu ${res.status}`, { status: res.status, retryable: res.status >= 500 || res.status === 429, body });
  }
  return body;
}

// ---------------------------------------------------------------------------------------------------------------
// SANDBOX — ambiente de SIMULAÇÃO. Não movimenta dinheiro. Gera um "Pix" fictício e aceita webhooks assinados com
// SANDBOX_WEBHOOK_SECRET. Bloqueado em produção (só funciona com PAYMENTS_ALLOW_SANDBOX=1).
// ---------------------------------------------------------------------------------------------------------------
export function sandboxProvider({ secret }) {
  if (!secret) throw new Error('SANDBOX_WEBHOOK_SECRET não configurado');
  return {
    name: 'sandbox',
    isSandbox: true,
    async createCharge({ paymentId, amount, method, expiresAt }) {
      const id = 'sbx_' + paymentId.replace(/-/g, '').slice(0, 20);
      return {
        providerPaymentId: id,
        pixCopyPaste: method === 'pix' ? `SIMULACAO-VIZINHOMARKET|${id}|${round2(amount).toFixed(2)}` : null,
        checkoutUrl: method === 'card_online' ? `sandbox://checkout/${id}` : null,
        expiresAt: expiresAt ?? null,
      };
    },
    async getPayment() { throw new ProviderError('O sandbox informa o status pelo webhook assinado', { retryable: false }); },
    async refund(providerPaymentId, amount, idempotencyKey) { return { providerRefundId: `sbx_ref_${idempotencyKey.slice(0, 12)}` }; },
    async sign(rawBody) { return hmacHex(secret, rawBody); },
    async parseWebhook({ headers, rawBody }) {
      const sig = header(headers, 'x-sandbox-signature');
      if (!sig || !safeEqual(sig, await hmacHex(secret, rawBody))) return { ok: false };
      const b = JSON.parse(rawBody);
      return { ok: true, eventId: String(b.event_id), providerPaymentId: String(b.provider_payment_id),
               trustedStatus: { status: b.status, paidAmount: b.paid_amount } };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// MERCADO PAGO — API v1/payments (Pix) e Checkout Pro (cartão). Webhook assinado: header x-signature "ts=..,v1=.."
// sobre o manifesto "id:{data.id};request-id:{x-request-id};ts:{ts};" com a chave secreta do webhook.
// Docs: https://www.mercadopago.com.br/developers/pt/docs (Pix: /checkout-api/integration-configuration/integrate-pix)
// Split nativo exige o modelo "Marketplace" (OAuth de cada loja); aqui a plataforma recebe e repassa (ver razão).
// ---------------------------------------------------------------------------------------------------------------
export function mercadoPagoProvider({ accessToken, webhookSecret, fetchImpl = fetch, baseUrl = 'https://api.mercadopago.com' }) {
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
  const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const mapStatus = (s) => ({ approved: 'paid', authorized: 'pending', pending: 'pending', in_process: 'pending', in_mediation: 'pending',
    rejected: 'failed', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'refunded' }[s] ?? 'pending');
  return {
    name: 'mercadopago',
    async createCharge({ paymentId, amount, method, description, payer, expiresAt, notificationUrl }) {
      if (method === 'pix') {
        const body = await call(fetchImpl, `${baseUrl}/v1/payments`, {
          method: 'POST',
          headers: { ...auth, 'X-Idempotency-Key': paymentId },
          body: JSON.stringify({
            transaction_amount: round2(amount), payment_method_id: 'pix', description,
            external_reference: paymentId, notification_url: notificationUrl,
            date_of_expiration: expiresAt ? new Date(expiresAt).toISOString().replace('Z', '-00:00') : undefined,
            payer: { email: payer.email, first_name: payer.name },
          }),
        });
        const td = body?.point_of_interaction?.transaction_data ?? {};
        return { providerPaymentId: String(body.id), pixCopyPaste: td.qr_code ?? null, pixQrBase64: td.qr_code_base64 ?? null,
                 expiresAt: body.date_of_expiration ?? expiresAt ?? null };
      }
      // Cartão: Checkout Pro (o cartão é digitado no ambiente do Mercado Pago; nunca passa pelo nosso servidor).
      const pref = await call(fetchImpl, `${baseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: { ...auth, 'X-Idempotency-Key': paymentId },
        body: JSON.stringify({
          items: [{ title: description, quantity: 1, unit_price: round2(amount), currency_id: 'BRL' }],
          external_reference: paymentId, notification_url: notificationUrl,
          payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 1 },
          expires: Boolean(expiresAt), expiration_date_to: expiresAt ?? undefined,
        }),
      });
      return { providerPaymentId: `pref_${pref.id}`, checkoutUrl: pref.init_point, expiresAt: expiresAt ?? null };
    },
    async getPayment(id) {
      const b = await call(fetchImpl, `${baseUrl}/v1/payments/${encodeURIComponent(id)}`, { headers: auth });
      return { status: mapStatus(b.status), paidAmount: b.status === 'approved' ? round2(b.transaction_amount) : null,
               externalReference: b.external_reference ?? null, providerPaymentId: String(b.id) };
    },
    async refund(id, amount, idempotencyKey) {
      const b = await call(fetchImpl, `${baseUrl}/v1/payments/${encodeURIComponent(id)}/refunds`, {
        method: 'POST', headers: { ...auth, 'X-Idempotency-Key': idempotencyKey }, body: JSON.stringify({ amount: round2(amount) }),
      });
      return { providerRefundId: String(b.id) };
    },
    async parseWebhook({ headers, rawBody, url }) {
      const sigHeader = header(headers, 'x-signature');
      const requestId = header(headers, 'x-request-id');
      let body = {}; try { body = JSON.parse(rawBody || '{}'); } catch { return { ok: false }; }
      const u = new URL(url);
      const dataId = u.searchParams.get('data.id') ?? body?.data?.id;
      if (!webhookSecret || !sigHeader || !dataId) return { ok: false };
      const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.trim().split('=')));
      const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId ?? ''};ts:${parts.ts};`;
      if (!parts.v1 || !safeEqual(parts.v1, await hmacHex(webhookSecret, manifest))) return { ok: false };
      if (body.type && body.type !== 'payment') return { ok: true, ignore: true };
      return { ok: true, eventId: `${dataId}:${parts.ts}`, providerPaymentId: String(dataId) };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// ASAAS — cobranças Pix/cartão com split nativo por walletId (conta da loja no Asaas).
// Webhook autenticado pelo header "asaas-access-token" (token definido no painel do Asaas).
// O Asaas exige cliente com CPF/CNPJ: o app precisa pedir o CPF do pagador antes do pagamento online (pendência de produto).
// Docs: https://docs.asaas.com
// ---------------------------------------------------------------------------------------------------------------
export function asaasProvider({ apiKey, webhookToken, fetchImpl = fetch, baseUrl = 'https://api-sandbox.asaas.com/v3' }) {
  if (!apiKey) throw new Error('ASAAS_API_KEY não configurada');
  const auth = { access_token: apiKey, 'Content-Type': 'application/json', 'User-Agent': 'vizinhomarket' };
  const mapStatus = (s) => ({ RECEIVED: 'paid', CONFIRMED: 'paid', RECEIVED_IN_CASH: 'paid', PENDING: 'pending', AWAITING_RISK_ANALYSIS: 'pending',
    OVERDUE: 'expired', REFUNDED: 'refunded', REFUND_REQUESTED: 'paid', CHARGEBACK_REQUESTED: 'paid', DELETED: 'cancelled' }[s] ?? 'pending');
  return {
    name: 'asaas',
    async createCharge({ paymentId, amount, method, description, payer, expiresAt, notificationUrl, split }) {
      if (!payer.document) throw new ProviderError('O Asaas exige CPF do pagador', { retryable: false });
      const customer = await call(fetchImpl, `${baseUrl}/customers`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ name: payer.name, cpfCnpj: payer.document, email: payer.email, externalReference: payer.id, notificationDisabled: true }),
      });
      const due = (expiresAt ? new Date(expiresAt) : new Date()).toISOString().slice(0, 10);
      const charge = await call(fetchImpl, `${baseUrl}/payments`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({
          customer: customer.id, billingType: method === 'pix' ? 'PIX' : 'CREDIT_CARD', value: round2(amount), dueDate: due,
          description, externalReference: paymentId,
          split: split?.walletId ? [{ walletId: split.walletId, fixedValue: round2(split.amount) }] : undefined,
        }),
      });
      if (method === 'pix') {
        const qr = await call(fetchImpl, `${baseUrl}/payments/${charge.id}/pixQrCode`, { headers: auth });
        return { providerPaymentId: charge.id, pixCopyPaste: qr.payload, pixQrBase64: qr.encodedImage, expiresAt: qr.expirationDate ?? expiresAt ?? null };
      }
      return { providerPaymentId: charge.id, checkoutUrl: charge.invoiceUrl, expiresAt: expiresAt ?? null };
    },
    async getPayment(id) {
      const b = await call(fetchImpl, `${baseUrl}/payments/${encodeURIComponent(id)}`, { headers: auth });
      const status = mapStatus(b.status);
      return { status, paidAmount: status === 'paid' ? round2(b.value) : null, externalReference: b.externalReference ?? null, providerPaymentId: b.id };
    },
    async refund(id, amount) {
      const b = await call(fetchImpl, `${baseUrl}/payments/${encodeURIComponent(id)}/refund`, {
        method: 'POST', headers: auth, body: JSON.stringify({ value: round2(amount) }),
      });
      return { providerRefundId: b.id ?? id };
    },
    async parseWebhook({ headers, rawBody }) {
      const token = header(headers, 'asaas-access-token');
      if (!webhookToken || !token || !safeEqual(token, webhookToken)) return { ok: false };
      let b; try { b = JSON.parse(rawBody); } catch { return { ok: false }; }
      if (!b?.payment?.id) return { ok: true, ignore: true };
      return { ok: true, eventId: String(b.id ?? `${b.event}:${b.payment.id}:${b.payment.status}`), providerPaymentId: b.payment.id };
    },
  };
}

export function providerFromEnv(name, env, fetchImpl = fetch) {
  switch (name) {
    case 'sandbox':
      if (env.PAYMENTS_ALLOW_SANDBOX !== '1') throw new Error('Sandbox de pagamentos bloqueado neste ambiente (PAYMENTS_ALLOW_SANDBOX≠1)');
      return sandboxProvider({ secret: env.SANDBOX_WEBHOOK_SECRET });
    case 'mercadopago':
      return mercadoPagoProvider({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN, webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET, fetchImpl });
    case 'asaas':
      return asaasProvider({ apiKey: env.ASAAS_API_KEY, webhookToken: env.ASAAS_WEBHOOK_TOKEN, fetchImpl,
                             baseUrl: env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3' });
    default:
      throw new Error(`Provedor de pagamento desconhecido: ${name}`);
  }
}
