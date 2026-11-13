// Testes do módulo financeiro: pagamento online, webhooks, razão, cupons, estornos, repasses, conciliação, suporte.
// Uso: node supabase/tests/financeiro.mjs
import { setupDb, baseScenario } from './lib.mjs';

const t = await setupDb();
const { q, as, su, ok, fails, eq, mk } = t;
const { admin, city, bairro, mkStore } = await baseScenario(t);
const A = await mkStore('donoA', 'Mercado A');
const B = await mkStore('donoB', 'Mercado B');
const cust = await mk('cliente'), cust2 = await mk('cliente2'), cour = await mk('entregador');

await su();
const [{ id: pA }] = await q("insert into public.products (store_id, name, price, stock) values ($1, 'Café 500g', 20, 100) returning id", [A.id]);
const [{ id: pB }] = await q("insert into public.products (store_id, name, price) values ($1, 'Pão', 10) returning id", [B.id]);
await as(cust);
const [{ id: addr }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua X, 1', $2, $3) returning id", [cust.id, city, bairro]);

let seq = 0;
const order = async (user, opts = {}) => {
  await as(user);
  const items = opts.items ?? [{ product_id: pA, quantity: opts.qty ?? 2 }];
  const [{ id }] = await q(
    `select public.create_order($1, $2::jsonb, $3, $4, $5, 'Cliente', '67988887777', $6, null, null, $7, $8, $9) id`,
    [opts.store ?? A.id, JSON.stringify(items), opts.fulfillment ?? 'pickup', opts.method ?? 'pix', `fin-chave-${++seq}-${Date.now()}`,
     opts.fulfillment && opts.fulfillment !== 'pickup' ? (opts.address ?? addr) : null, opts.expected ?? null, opts.mode ?? 'offline', opts.coupon ?? null]);
  return id;
};
const get = async (id) => { await su(); return (await q('select * from public.orders where id = $1', [id]))[0]; };
const deliverPickup = async (id, owner = A.owner) => {
  await as(owner);
  await q("select public.advance_order_status($1, 'ACCEPTED')", [id]);
  await q("select public.advance_order_status($1, 'READY')", [id]);
  await su();
  const [{ delivery_code }] = await q('select delivery_code from public.order_secrets where order_id = $1', [id]);
  await as(owner);
  const [{ r }] = await q('select public.confirm_delivery($1, $2) r', [id, delivery_code]);
  if (!r.ok) throw new Error('entrega não confirmada');
};
const ledgerSum = async (where = 'true', params = []) => { await su(); return Number((await q(`select coalesce(sum(amount),0) s from public.ledger_entries where ${where}`, params))[0].s); };
const payViaGateway = async (orderId, eventId, amount) => {
  await as('service');
  const [{ r }] = await q("select public.svc_payment_begin($1, $2, 'sandbox') r", [orderId, cust.id]);
  const ppid = 'sbx_' + r.payment_id.slice(0, 8);
  if (!r.reuse) await q("select public.svc_payment_attach($1, $2, '000201PIXCOPIAECOLA', null, null, null)", [r.payment_id, ppid]);
  const [{ res }] = await q("select public.svc_payment_apply('sandbox', $1, 'paid', $2, $3, null) res", [ppid, amount ?? r.amount, eventId]);
  return { res, ppid, paymentId: r.payment_id, amount: Number(r.amount) };
};

// ---------- 1. Pagamento online: liga/desliga ----------
await fails('Online recusado com pagamento online desligado', () => order(cust, { mode: 'online' }), 'ainda não está disponível');
await su();
await q("update public.platform_settings set value = 'true' where key = 'online_payments_enabled'");
await fails('Online recusado em loja não habilitada pelo admin', () => order(cust, { mode: 'online' }), 'não recebe pagamento pelo app');
await as(A.owner);
await fails('Lojista não se habilita sozinho para receber online', () => q('update public.stores set accepts_online_payment = true where id = $1', [A.id]), 'permission denied');
await su();
await q('update public.stores set accepts_online_payment = true where id = $1', [A.id]);
await fails('Cartão online não pode ser offline', () => order(cust, { method: 'card_online' }), 'só pode ser pago pelo app');
await fails('Dinheiro não pode ser online', () => order(cust, { method: 'cash', mode: 'online' }), 'online inválida');

// ---------- 2. Fluxo online completo ----------
let o1;
await ok('Pedido online nasce aguardando pagamento', async () => {
  o1 = await order(cust, { mode: 'online' });
  const o = await get(o1);
  eq(o.payment_status, 'awaiting_payment'); return eq(o.total, '40.00');
});
await as(A.owner);
await fails('Loja não aceita pedido online antes do pagamento', () => q("select public.advance_order_status($1, 'ACCEPTED')", [o1]), 'Aguardando a confirmação');
await as(cust);
await fails('Cliente não marca o próprio pedido como pago (sem permissão na coluna)', () => q("update public.orders set payment_status = 'paid' where id = $1", [o1]), 'permission denied');
await fails('Cliente não chama a função do serviço de pagamentos', () => q("select public.svc_payment_apply('sandbox', 'x', 'paid', 40, 'ev-hack', null)"), 'permission denied');
await fails('Cliente não inicia cobrança pela função interna', () => q("select public.svc_payment_begin($1, $2, 'sandbox')", [o1, cust.id]), 'permission denied');
await as('service');
await fails('Serviço recusa cobrança de pedido de outro cliente', () => q("select public.svc_payment_begin($1, $2, 'sandbox')", [o1, cust2.id]), 'não encontrado');
let pay1, ppid1;
await ok('Cobrança criada com o valor do pedido (não de quem chama)', async () => {
  const [{ r }] = await q("select public.svc_payment_begin($1, $2, 'sandbox') r", [o1, cust.id]);
  pay1 = r.payment_id; ppid1 = 'sbx_o1';
  await q("select public.svc_payment_attach($1, $2, 'PIXCOPIA', null, null, null)", [pay1, ppid1]);
  return eq(r.amount, 40);
});
await ok('Segunda chamada reaproveita a cobrança pendente (não gera dois Pix)', async () => {
  const [{ r }] = await q("select public.svc_payment_begin($1, $2, 'sandbox') r", [o1, cust.id]);
  eq(r.payment_id, pay1); return eq(r.reuse, true);
});
await ok('Webhook com valor menor que o cobrado vai para revisão e não libera o pedido', async () => {
  const [{ res }] = await q("select public.svc_payment_apply('sandbox', $1, 'paid', 0.01, 'ev-1', null) res", [ppid1]);
  eq(res, 'amount_mismatch');
  const o = await get(o1); return eq(o.payment_status, 'awaiting_payment');
});
await su();
await q("update public.payments set status = 'pending', paid_amount = null where id = $1", [pay1]);
await as('service');
await ok('Webhook de pagamento confirmado libera o pedido', async () => {
  const [{ res }] = await q("select public.svc_payment_apply('sandbox', $1, 'paid', 40, 'ev-2', null) res", [ppid1]);
  eq(res, 'paid');
  const o = await get(o1); return eq(o.payment_status, 'paid');
});
await as('service');
await ok('Webhook repetido (mesmo evento) não faz nada', async () => eq((await q("select public.svc_payment_apply('sandbox', $1, 'paid', 40, 'ev-2', null) res", [ppid1]))[0].res, 'duplicate'));
await as('service');
await ok('Outro evento do mesmo pagamento não lança de novo', async () => {
  eq((await q("select public.svc_payment_apply('sandbox', $1, 'paid', 40, 'ev-3', null) res", [ppid1]))[0].res, 'already_paid');
  return eq(await ledgerSum("kind = 'payment_received' and account = 'gateway_clearing'"), 40);
});
await as('service');
await ok('Webhook de pagamento desconhecido é registrado sem efeito', async () => eq((await q("select public.svc_payment_apply('sandbox', 'nao-existe', 'paid', 10, 'ev-x', null) res"))[0].res, 'unknown_payment'));
await ok('Pedido online pago é entregue e liquidado no razão', async () => {
  await deliverPickup(o1);
  // loja: 40 − 10% = 36 a receber; plataforma: 4 de comissão
  eq(await ledgerSum("account = 'store_payable' and party_id = $1", [A.id]), -36);
  eq(await ledgerSum("account = 'platform_revenue'"), -4);
  return eq(await ledgerSum("account = 'customer_prepaid'"), 0);
});
await ok('Razão inteiro soma zero', async () => eq(await ledgerSum(), 0));
await as(admin);
await fails('Nem o admin altera lançamento do razão', () => q('update public.ledger_entries set amount = 1'), 'permission denied|não podem ser alterados');
await su();
await fails('Nem o superusuário altera lançamento (gatilho)', () => q('update public.ledger_entries set amount = 1'), 'não podem ser alterados');
await fails('Nem o superusuário apaga lançamento (gatilho)', () => q('delete from public.ledger_entries'), 'não podem ser alterados');
await fails('Lançamento desbalanceado é recusado', () => q(`select public._ledger_post('x', '[{"account":"adjustment","amount":1}]'::jsonb)`), 'desbalanceado');
await ok('Pedido entregue não é liquidado duas vezes', async () => {
  await su();
  return eq((await q("select count(distinct txn_id) c from public.ledger_entries where order_id = $1 and kind = 'order_settlement'", [o1]))[0].c, 1);
});

// ---------- 3. Cancelamento de pedido pago online → estorno automático ----------
let o2;
await ok('Cancelamento de pedido pago online cria estorno aprovado', async () => {
  o2 = await order(cust, { mode: 'online' });
  await payViaGateway(o2, 'ev-o2');
  await as(cust); await q("select public.cancel_order($1, 'desisti')", [o2]);
  await su();
  const [r] = await q('select status, amount, charged_to from public.refunds where order_id = $1', [o2]);
  eq(r.status, 'approved'); eq(r.charged_to, 'platform'); return eq(r.amount, '40.00');
});
await ok('Estoque volta no cancelamento', async () => { await su(); return eq((await q('select stock from public.products where id = $1', [pA]))[0].stock, '98.000'); });
let refundId;
await ok('Serviço pega o estorno para processar (uma vez só)', async () => {
  await as('service');
  const rows = await q('select * from public.svc_refunds_to_process(10)');
  const again = await q('select * from public.svc_refunds_to_process(10)');
  refundId = rows[0].refund_id; eq(rows.length, 1); return eq(again.length, 0);
});
await ok('Estorno concluído marca o pedido como estornado e lança no razão', async () => {
  await as('service');
  await q("select public.svc_refund_result($1, true, 'sbx_ref_1', null)", [refundId]);
  await q("select public.svc_refund_result($1, true, 'sbx_ref_1', null)", [refundId]); // repetido não duplica
  const o = await get(o2);
  eq(o.payment_status, 'refunded'); eq(o.refunded_amount, '40.00');
  return eq(await ledgerSum('order_id = $1', [o2]), 0) && eq(await ledgerSum("account = 'customer_prepaid'"), 0);
});
await ok('Pagamento que chega depois do cancelamento gera estorno automático', async () => {
  const o3 = await order(cust, { mode: 'online' });
  await as('service');
  const [{ r }] = await q("select public.svc_payment_begin($1, $2, 'sandbox') r", [o3, cust.id]);
  await q("select public.svc_payment_attach($1, 'sbx_late', null, null, null, null)", [r.payment_id]);
  await as(cust); await q("select public.cancel_order($1, 'demorou')", [o3]);
  await as('service');
  eq((await q("select public.svc_payment_apply('sandbox', 'sbx_late', 'paid', 40, 'ev-late', null) res"))[0].res, 'paid_refund_created');
  await su();
  return eq((await q("select count(*) c from public.refunds where order_id = $1 and status = 'approved'", [o3]))[0].c, 1);
});
await ok('Pedido online não pago expira no tempo limite', async () => {
  const o4 = await order(cust, { mode: 'online' });
  await su();
  await q("update public.orders set created_at = now() - interval '31 minutes' where id = $1", [o4]);
  await as('service'); await q('select public.expire_stale_orders()');
  const o = await get(o4); eq(o.status, 'CANCELLED'); return eq(o.payment_status, 'expired');
});
await ok('Pedido online pago e não aceito expira e é estornado', async () => {
  const o5 = await order(cust, { mode: 'online' });
  await payViaGateway(o5, 'ev-o5');
  await su(); await q("update public.orders set paid_at = now() - interval '16 minutes' where id = $1", [o5]);
  await as('service'); await q('select public.expire_stale_orders()');
  await su();
  return eq((await q("select count(*) c from public.refunds where order_id = $1 and status = 'approved'", [o5]))[0].c, 1);
});

// ---------- 4. Offline ----------
let off1;
await ok('Pedido offline Pix nasce pendente com a chave da loja', async () => {
  off1 = await order(cust, { method: 'pix' });
  const o = await get(off1); eq(o.payment_status, 'pending'); return eq(o.pix_key, 'chave@loja');
});
await as(cust);
await fails('Cliente não confirma o próprio pagamento offline', () => q('select public.confirm_offline_payment($1)', [off1]), 'Sem permissão');
await as(B.owner);
await fails('Outra loja não confirma o pagamento', () => q('select public.confirm_offline_payment($1)', [off1]), 'Sem permissão');
await ok('Loja confirma o recebimento e entrega; comissão vira "a receber da loja"', async () => {
  await as(A.owner); await q('select public.confirm_offline_payment($1)', [off1]);
  await deliverPickup(off1);
  const o = await get(off1); eq(o.payment_status, 'paid');
  return eq(await ledgerSum("account = 'store_receivable' and party_id = $1", [A.id]), 4);
});
await ok('Entrega da plataforma offline: loja deve comissão + taxa; entregador tem a receber', async () => {
  await su();
  await q("insert into public.couriers (user_id, city_id, status) values ($1, $2, 'approved')", [cour.id, city]);
  await q("insert into public.user_roles (user_id, role) values ($1, 'courier')", [cour.id]);
  const id = await order(cust, { method: 'cash', fulfillment: 'platform_delivery' });
  await as(A.owner);
  await q("select public.advance_order_status($1, 'ACCEPTED')", [id]);
  await q("select public.advance_order_status($1, 'READY')", [id]);
  await as(cour); await q('select public.courier_set_online(true)'); await q('select public.claim_delivery($1)', [id]); await q('select public.confirm_pickup($1)', [id]);
  await su(); const [{ delivery_code }] = await q('select delivery_code from public.order_secrets where order_id = $1', [id]);
  await as(cour); await q('select public.confirm_delivery($1, $2)', [id, delivery_code]);
  eq(await ledgerSum("account = 'store_receivable' and order_id = $1", [id]), 10); // 4 comissão + 6 entrega
  return eq(await ledgerSum("account = 'courier_payable' and party_id = $1", [cour.id]), -6);
});

// ---------- 5. Cupons ----------
await as(cust);
await fails('Cliente não cria cupom', () => q(`select public.upsert_coupon('{"code":"HACK","kind":"fixed","value":100,"funded_by":"platform"}'::jsonb)`), 'Sem permissão');
await as(B.owner);
await fails('Lojista não cria cupom para outra loja', () => q(`select public.upsert_coupon($1::jsonb)`, [JSON.stringify({ code: 'INVADE', store_id: A.id, kind: 'fixed', value: 5 })]), 'Sem permissão');
await as(A.owner);
await fails('Lojista não cria cupom bancado pela plataforma', () => q(`select public.upsert_coupon($1::jsonb)`, [JSON.stringify({ code: 'PLAT', store_id: A.id, kind: 'fixed', value: 5, funded_by: 'platform' })]), 'bancado pela loja');
await ok('Lojista cria cupom de 10% da própria loja', async () => {
  await q(`select public.upsert_coupon($1::jsonb)`, [JSON.stringify({ code: 'cafe10', store_id: A.id, kind: 'percent', value: 10, per_user_limit: 1 })]);
  return true;
});
await as(admin);
await ok('Admin cria cupom da plataforma (R$ 5, máx. 2 usos, pedido mínimo R$ 30)', async () => {
  await q(`select public.upsert_coupon($1::jsonb)`, [JSON.stringify({ code: 'BEMVINDO', kind: 'fixed', value: 5, max_redemptions: 2, min_subtotal: 30, funded_by: 'platform' })]);
  await q(`select public.upsert_coupon($1::jsonb)`, [JSON.stringify({ code: 'VENCIDO', kind: 'fixed', value: 5, starts_at: '2020-01-01', ends_at: '2020-02-01' })]);
  return true;
});
await fails('Código de cupom repetido na mesma loja é recusado', () => q(`select public.upsert_coupon($1::jsonb)`, [JSON.stringify({ code: 'BEMVINDO', kind: 'fixed', value: 1 })]), 'Já existe');
await as(cust);
await ok('Cliente não lista cupons (não dá para garimpar)', async () => eq((await q('select count(*) c from public.coupons'))[0].c, 0));
await ok('Simulação mostra o total com cupom sem gravar nada', async () => {
  await su(); const before = (await q('select count(*) c from public.orders'))[0].c; const stock = (await q('select stock from public.products where id = $1', [pA]))[0].stock;
  await as(cust);
  const [{ r }] = await q(`select public.quote_order($1, $2::jsonb, 'pickup', 'pix', null, 'offline', 'CAFE10') r`, [A.id, JSON.stringify([{ product_id: pA, quantity: 2 }])]);
  eq(r.total, 36); eq(r.discount, 4);
  await su();
  eq((await q('select count(*) c from public.orders'))[0].c, before);
  return eq((await q('select stock from public.products where id = $1', [pA]))[0].stock, stock);
});
let oc;
await ok('Cupom da loja: desconto aplicado e comissão sobre o valor com desconto', async () => {
  oc = await order(cust, { coupon: 'cafe10', expected: 36 });
  const o = await get(oc);
  eq(o.discount_amount, '4.00'); eq(o.discount_funded_by, 'store'); eq(o.total, '36.00');
  return eq(o.commission_amount, '3.60');
});
await fails('Cupom da loja não pode ser usado duas vezes pela mesma pessoa', () => order(cust, { coupon: 'CAFE10' }), 'já usou');
await fails('Cupom da loja A não vale na loja B', () => order(cust, { store: B.id, items: [{ product_id: pB, quantity: 3 }], coupon: 'CAFE10' }), 'não encontrado|não vale');
await fails('Cupom vencido é recusado', () => order(cust, { coupon: 'VENCIDO' }), 'expirado');
await fails('Cupom abaixo do pedido mínimo é recusado', () => order(cust, { qty: 1, coupon: 'BEMVINDO' }), 'a partir de');
await fails('Cupom inexistente é recusado', () => order(cust, { coupon: 'NAOEXISTE' }), 'não encontrado');
await fails('Total esperado sem o desconto é recusado (VMPRC)', () => order(cust2, { coupon: 'CAFE10', expected: 40 }), 'mudaram');
await ok('Cancelar devolve o uso do cupom', async () => {
  await as(cust); await q("select public.cancel_order($1, 'mudei')", [oc]);
  const again = await order(cust, { coupon: 'CAFE10' });
  return eq((await get(again)).discount_amount, '4.00');
});
let ob1;
await ok('Cupom da plataforma: loja recebe o valor cheio (plataforma banca)', async () => {
  ob1 = await order(cust, { coupon: 'BEMVINDO' });
  const o = await get(ob1);
  eq(o.total, '35.00'); eq(o.discount_funded_by, 'platform'); eq(o.commission_amount, '4.00');
  await as(A.owner); await q('select public.confirm_offline_payment($1)', [ob1]);
  await deliverPickup(ob1);
  // offline: loja deve 4 de comissão − 5 do desconto = −1 (a plataforma deve 1 à loja)
  return eq(await ledgerSum("account = 'store_receivable' and order_id = $1", [ob1]), -1);
});
await ok('Limite total do cupom da plataforma é respeitado', async () => {
  await order(cust2, { coupon: 'BEMVINDO' });
  try { await su(); const cust3 = await mk('cliente3'); await order(cust3, { coupon: 'BEMVINDO' }); return false; }
  catch (e) { if (!/esgotou/.test(e.message)) throw e; return true; }
});
await ok('Razão continua somando zero', async () => eq(await ledgerSum(), 0));

// ---------- 6. Reembolso pedido pelo cliente ----------
await as(cust2);
await fails('Outro cliente não pede reembolso do pedido alheio', () => q("select public.request_refund($1, 10, 'Produto veio errado demais')", [o1]), 'não encontrado');
await as(cust);
await fails('Reembolso acima do valor do pedido é recusado', () => q("select public.request_refund($1, 999, 'Produto veio errado demais')", [o1]), 'inválido');
await fails('Reembolso sem explicação é recusado', () => q("select public.request_refund($1, 10, 'ruim')", [o1]), '10 letras');
let refReq;
await ok('Cliente pede reembolso parcial e abre atendimento', async () => {
  refReq = (await q("select public.request_refund($1, 10, 'Faltou um item no pacote') id", [o1]))[0].id;
  return eq((await q("select count(*) c from public.support_tickets where refund_id = $1", [refReq]))[0].c, 1);
});
await as(A.owner);
await ok('Loja vê o atendimento de reembolso do próprio pedido', async () => eq((await q('select count(*) c from public.support_tickets where refund_id = $1', [refReq]))[0].c, 1));
await as(B.owner);
await ok('Outra loja não vê o atendimento', async () => eq((await q('select count(*) c from public.support_tickets'))[0].c, 0));
await as(A.owner);
await fails('Lojista não decide reembolso', () => q("select public.admin_decide_refund($1, true, null, 'store', 'aprovado')", [refReq]), 'administrador|restrito');
await as(admin);
await fails('Admin precisa justificar a decisão', () => q("select public.admin_decide_refund($1, true, null, 'store', '')", [refReq]), 'justificativa');
await ok('Admin aprova; estorno pós-entrega é descontado da loja', async () => {
  await q("select public.admin_decide_refund($1, true, null, 'store', 'Loja confirmou a falta')", [refReq]);
  await as('service');
  const rows = await q('select * from public.svc_refunds_to_process(10)');
  const mine = rows.find((r) => r.refund_id === refReq);
  await q("select public.svc_refund_result($1, true, 'sbx_ref_2', null)", [refReq]);
  eq(Number(mine.amount), 10);
  eq((await get(o1)).payment_status, 'partially_refunded');
  return eq(await ledgerSum("account = 'store_payable' and party_id = $1", [A.id]), -26);
});
await as(admin);
await fails('Decidir o mesmo reembolso de novo é recusado', () => q("select public.admin_decide_refund($1, false, null, 'store', 'mudei de ideia')", [refReq]), 'já foi decidido');

// ---------- 7. Repasses e saldos ----------
await as(A.owner);
await ok('Dono vê o saldo da própria loja', async () => { const [{ r }] = await q('select public.store_balance($1) r', [A.id]); return eq(r.to_receive, 26); });
await fails('Dono não vê o saldo de outra loja', () => q('select public.store_balance($1)', [B.id]), 'Sem permissão');
await as(B.owner);
await ok('Dono B não lê lançamentos da loja A', async () => eq((await q('select count(*) c from public.ledger_entries'))[0].c, 0));
await as(admin);
await fails('Repasse maior que o saldo é recusado', () => q("select public.admin_record_payout('store', $1, 100, 'pix', 'PIX-123')", [A.id]), 'maior que o saldo');
await ok('Repasse registrado zera o saldo a pagar', async () => {
  await q("select public.admin_record_payout('store', $1, 26, 'pix', 'PIX-E2E-0001')", [A.id]);
  return eq(await ledgerSum("account = 'store_payable' and party_id = $1", [A.id]), 0);
});
await ok('Ajuste manual exige justificativa e vira lançamento novo', async () => {
  await as(admin);
  try { await q("select public.admin_ledger_adjustment('store_payable', $1, -1, 'curto')", [A.id]); return false; } catch { /* esperado */ }
  await q("select public.admin_ledger_adjustment('store_payable', $1, -1, 'Diferença de arredondamento combinada')", [A.id]);
  return eq(await ledgerSum(), 0);
});

// ---------- 8. Conciliação ----------
await as(admin);
await ok('Extrato importado: tarifa lançada, duplicado ignorado', async () => {
  const lines = [{ provider_payment_id: 'sbx_o1', gross: 40, fee: 0.4, settled_on: '2026-11-13' },
                 { provider_payment_id: 'sbx_fantasma', gross: 12, fee: 0, settled_on: '2026-11-13' }];
  const [{ r }] = await q("select public.admin_import_settlement('sandbox', 'lote-1', $1::jsonb) r", [JSON.stringify(lines)]);
  const [{ r: r2 }] = await q("select public.admin_import_settlement('sandbox', 'lote-1', $1::jsonb) r", [JSON.stringify(lines)]);
  eq(r.imported, 2); eq(r2.duplicates, 2);
  return eq(await ledgerSum("account = 'platform_gateway_fees'"), 0.4);
});
await ok('Conciliação aponta linha do extrato sem pagamento e estorno pendente', async () => {
  await as(admin);
  const issues = await q('select issue from public.admin_reconciliation()');
  const kinds = new Set(issues.map((i) => i.issue));
  return kinds.has('extrato_sem_pagamento') && !kinds.has('razao_desbalanceado') && !kinds.has('entregue_sem_lancamento');
});
await as(cust);
await fails('Cliente não acessa a conciliação', () => q('select * from public.admin_reconciliation()'), 'administrador|restrito');

// ---------- 9. Suporte ----------
let tk;
await as(cust);
await ok('Cliente abre atendimento sobre o próprio pedido', async () => { tk = (await q("select public.open_ticket('delivery', 'Atraso', 'O pedido está atrasado', $1) id", [o1]))[0].id; return true; });
await as(cust2);
await fails('Outro cliente não abre atendimento sobre pedido alheio', () => q("select public.open_ticket('support', 'Olá suporte', 'teste', $1)", [o1]), 'não encontrado');
await fails('Outro cliente não escreve no atendimento alheio', () => q("select public.post_ticket_message($1, 'oi')", [tk]), 'não encontrado');
await as(admin);
await ok('Admin responde e o atendimento fica aguardando o cliente', async () => {
  await q("select public.admin_set_ticket_status($1, 'waiting_customer', 'Estamos verificando com a loja')", [tk]);
  return eq((await q('select count(*) c from public.support_messages where ticket_id = $1', [tk]))[0].c, 2);
});
await ok('Ações financeiras do admin ficam na auditoria', async () => {
  await su();
  const [{ c }] = await q("select count(*) c from public.audit_log where action in ('decide_refund','record_payout','ledger_adjustment','import_settlement','upsert_coupon')");
  return Number(c) >= 6;
});
await ok('Razão final soma zero', async () => eq(await ledgerSum(), 0));

process.exit(t.report() ? 0 : 1);
