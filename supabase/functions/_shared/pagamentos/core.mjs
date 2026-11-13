// Regras das funções de pagamento, sem dependência de Deno (testadas em Node: supabase/tests/gateway.mjs).
// deps: { rpc(fn, args) → data | throws, provider, getPayer(userId) → { id, name, email, document? }, notificationUrl, log }
// Valores nunca vêm de quem chama: o banco (svc_payment_begin) devolve o valor do pedido.

const json = (status, body) => ({ status, body });

// POST /pagamentos  { order_id }  — usuário logado (o id do usuário vem do token, conferido antes).
export async function createPayment({ userId, orderId }, deps) {
  if (!userId) return json(401, { error: 'Faça login para continuar' });
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return json(400, { error: 'Pedido inválido' });
  const { rpc, provider, getPayer, notificationUrl, log = () => {} } = deps;

  let begin;
  try { begin = await rpc('svc_payment_begin', { p_order_id: orderId, p_user_id: userId, p_provider: provider.name }); }
  catch (e) { return json(e.code === 'VM409' ? 409 : 400, { error: e.message }); }

  if (begin.reuse) return json(200, publicView(begin, provider));

  try {
    const payer = await getPayer(userId);
    const charge = await provider.createCharge({
      paymentId: begin.payment_id, amount: Number(begin.amount), method: begin.method,
      description: `Pedido ${begin.order_code} - ${begin.store_name ?? 'VizinhoMarket'}`,
      payer: { ...payer, name: payer?.name || begin.customer_name }, expiresAt: begin.expires_at, notificationUrl,
      split: begin.split ? { walletId: begin.split.recipient_id, amount: Number(begin.split.store_amount) } : null,
    });
    await rpc('svc_payment_attach', {
      p_payment_id: begin.payment_id, p_provider_payment_id: charge.providerPaymentId, p_pix_copy_paste: charge.pixCopyPaste ?? null,
      p_pix_qr_base64: charge.pixQrBase64 ?? null, p_checkout_url: charge.checkoutUrl ?? null, p_expires_at: charge.expiresAt ?? null,
    });
    return json(200, publicView({ ...begin, pix_copy_paste: charge.pixCopyPaste, pix_qr_base64: charge.pixQrBase64,
      checkout_url: charge.checkoutUrl, expires_at: charge.expiresAt ?? begin.expires_at }, provider));
  } catch (e) {
    log('payment_create_failed', { payment_id: begin.payment_id, provider: provider.name, message: e.message, status: e.status });
    await rpc('svc_payment_fail', { p_payment_id: begin.payment_id, p_reason: e.message }).catch(() => {});
    return json(502, { error: 'Não foi possível gerar o pagamento agora. Tente de novo em instantes ou escolha pagar na entrega.' });
  }
}

function publicView(b, provider) {
  return {
    payment_id: b.payment_id, amount: Number(b.amount), method: b.method, expires_at: b.expires_at ?? null,
    pix_copy_paste: b.pix_copy_paste ?? null, pix_qr_base64: b.pix_qr_base64 ?? null, checkout_url: b.checkout_url ?? null,
    sandbox: Boolean(provider.isSandbox),
  };
}

// POST /pagamentos-webhook — chamado pelo provedor. 200 = processado (ou ignorado); 401 = assinatura inválida;
// 500 = falha temporária (o provedor tenta de novo; o processamento é idempotente pelo id do evento).
export async function handleWebhook({ headers, rawBody, url }, deps) {
  const { rpc, provider, log = () => {} } = deps;
  const parsed = await provider.parseWebhook({ headers, rawBody, url });
  if (!parsed.ok) { log('webhook_bad_signature', { provider: provider.name }); return json(401, { error: 'assinatura inválida' }); }
  if (parsed.ignore) return json(200, { result: 'ignored' });

  let status = parsed.trustedStatus;
  let providerPaymentId = parsed.providerPaymentId;
  try {
    if (!status) {
      const p = await provider.getPayment(providerPaymentId);
      status = { status: p.status, paidAmount: p.paidAmount };
      // Cartão via checkout: o id do pagamento só existe depois; liga ao nosso registro pela referência externa.
      if (p.externalReference && p.providerPaymentId) {
        await rpc('svc_payment_attach', { p_payment_id: p.externalReference, p_provider_payment_id: p.providerPaymentId,
          p_pix_copy_paste: null, p_pix_qr_base64: null, p_checkout_url: null, p_expires_at: null }).catch(() => {});
        providerPaymentId = p.providerPaymentId;
      }
    }
    const statusForDb = status.status === 'refunded' ? 'paid' : status.status; // estorno é tratado pelo fluxo de estornos
    const result = await rpc('svc_payment_apply', {
      p_provider: provider.name, p_provider_payment_id: providerPaymentId, p_status: statusForDb,
      p_paid_amount: status.paidAmount ?? null, p_event_id: parsed.eventId, p_payload: { status: status.status },
    });
    log('webhook_processed', { provider: provider.name, event: parsed.eventId, result });
    return json(200, { result });
  } catch (e) {
    log('webhook_failed', { provider: provider.name, event: parsed.eventId, message: e.message });
    return json(500, { error: 'falha temporária' });
  }
}

// Processa estornos aprovados (agendado). Cada estorno tem chave de idempotência = id do estorno.
export async function processRefunds(deps) {
  const { rpc, providers, log = () => {} } = deps;
  const rows = (await rpc('svc_refunds_to_process', { p_limit: 20 })) ?? [];
  const out = { processed: 0, failed: 0 };
  for (const r of rows) {
    try {
      const provider = providers(r.provider);
      const res = await provider.refund(r.provider_payment_id, Number(r.amount), r.refund_id);
      await rpc('svc_refund_result', { p_refund_id: r.refund_id, p_ok: true, p_provider_refund_id: res.providerRefundId, p_error: null });
      out.processed++;
    } catch (e) {
      log('refund_failed', { refund_id: r.refund_id, message: e.message });
      await rpc('svc_refund_result', { p_refund_id: r.refund_id, p_ok: false, p_provider_refund_id: null, p_error: e.message }).catch(() => {});
      out.failed++;
    }
  }
  return out;
}
