// Testes: cidades pelo admin, equipe interna por área, CPF do pagador e fila de avisos.
// Uso: node supabase/tests/equipe.mjs
import { setupDb, baseScenario } from './lib.mjs';
import { sendQueued } from '../functions/avisos/logic.mjs';

const t = await setupDb();
const { q, as, su, ok, fails, eq, mk } = t;
const { admin, city, bairro, mkStore } = await baseScenario(t);
const A = await mkStore('donoA', 'Mercado A');
const fin = await mk('financeiro'), atend = await mk('atendente'), oper = await mk('operador'), cust = await mk('cliente'), cour = await mk('entregador');
await su();
const [{ id: pA }] = await q("insert into public.products (store_id, name, price) values ($1, 'Café', 20) returning id", [A.id]);
await q("insert into public.couriers (user_id, city_id, status, is_online) values ($1, $2, 'approved', true)", [cour.id, city]);
await q("insert into public.user_roles (user_id, role) values ($1, 'courier')", [cour.id]);

// ---------- Cidades ----------
await as(cust);
await fails('Cliente não cadastra cidade', () => q("select public.admin_upsert_city(null, 'Maracaju', 'MS')"), 'administrador');
await as(admin);
await fails('UF inválida é recusada', () => q("select public.admin_upsert_city(null, 'Maracaju', 'Mato Grosso')"), 'UF');
await fails('Fuso inválido é recusado', () => q("select public.admin_upsert_city(null, 'Maracaju', 'MS', 'Lua/Base')"), 'Fuso');
let nova;
await ok('Admin cadastra nova cidade (inativa)', async () => {
  nova = (await q("select public.admin_upsert_city(null, 'Maracaju', 'MS') id"))[0].id;
  const rows = await q('select * from public.admin_list_cities()');
  return rows.length === 2 && rows.find((r) => r.id === nova).active === false;
});
await fails('Cidade repetida é recusada', () => q("select public.admin_upsert_city(null, 'Maracaju', 'MS')"), 'já cadastrada');
await as(null);
await ok('Visitante não vê cidade inativa', async () => eq((await q('select count(*) c from public.cities'))[0].c, 1));
await as(admin);
await ok('Admin ativa a cidade', async () => { await q("select public.admin_upsert_city($1, 'Maracaju', 'MS', 'America/Campo_Grande', true)", [nova]); return true; });

// ---------- Equipe por área ----------
await as(fin);
await fails('Sem área, ninguém vê a conciliação', () => q('select * from public.admin_reconciliation()'), 'restrito');
await as(admin);
await ok('Admin concede áreas por e-mail', async () => {
  await q("select public.admin_set_staff_scope('financeiro@teste.local', 'financeiro', true)");
  await q("select public.admin_set_staff_scope('atendente@teste.local', 'atendimento', true)");
  await q("select public.admin_set_staff_scope('operador@teste.local', 'operacao', true)");
  return (await q('select * from public.admin_list_staff()')).length === 4;
});
await fails('Conceder a e-mail sem conta é recusado', () => q("select public.admin_set_staff_scope('ninguem@x.y', 'financeiro', true)"), 'Nenhuma conta');
await as(fin);
await ok('Financeiro vê conciliação e saldos', async () => { await q('select * from public.admin_reconciliation()'); await q('select * from public.admin_balances()'); return true; });
await fails('Financeiro não atende chamados', () => q("select public.admin_set_ticket_status(gen_random_uuid(), 'resolved')"), 'restrito');
await fails('Financeiro não aprova lojas (só admin)', () => q("select public.admin_set_store_status($1, 'suspended')", [A.id]), 'administrador');
await fails('Financeiro não muda configurações (só admin)', () => q("select public.admin_set_setting('default_commission_rate', '0.01'::jsonb)"), 'administrador');
await as(oper);
await ok('Operação vê o monitor de entregas', async () => { await q('select * from public.admin_delivery_monitor()'); return true; });
await fails('Operação não vê a conciliação', () => q('select * from public.admin_reconciliation()'), 'restrito');
await as(cust);
const [{ id: tk }] = await q("select public.open_ticket('support', 'Dúvida sobre entrega', 'Vocês entregam no domingo?') id");
await as(atend);
await ok('Atendimento lê e responde o chamado', async () => {
  eq((await q('select count(*) c from public.support_tickets'))[0].c, 1);
  await q("select public.admin_set_ticket_status($1, 'waiting_customer', 'Sim, das 8h às 14h.')", [tk]);
  return true;
});
await fails('Atendimento não registra repasse', () => q("select public.admin_record_payout('store', $1, 1, 'pix', 'X-123')", [A.id]), 'restrito');
await as(admin);
await ok('Admin retira a área e o acesso some', async () => {
  await q("select public.admin_set_staff_scope('operador@teste.local', 'operacao', false)");
  await as(oper);
  try { await q('select * from public.admin_delivery_monitor()'); return false; } catch (e) { return /restrito/.test(e.message); }
});
await su();
await ok('Concessões ficam na auditoria', async () => Number((await q("select count(*) c from public.audit_log where action in ('grant_scope','revoke_scope')"))[0].c) === 4);

// ---------- CPF do pagador ----------
await as(cust);
await fails('CPF com dígito errado é recusado', () => q("select public.set_my_document('111.444.777-36')"), 'inválido');
await fails('CPF repetido (111.111.111-11) é recusado', () => q("select public.set_my_document('111.111.111-11')"), 'inválido');
await ok('CPF válido é guardado só no próprio perfil', async () => {
  await q("select public.set_my_document('111.444.777-35')");
  return eq((await q('select document from public.profiles where id = $1', [cust.id]))[0].document, '11144477735');
});
await as(A.owner);
await ok('Lojista não lê o CPF de cliente', async () => eq((await q('select count(*) c from public.profiles where id = $1', [cust.id]))[0].c, 0));
await as('service');
await ok('Serviço de pagamentos obtém nome, e-mail e CPF do pagador', async () => eq((await q('select public.svc_payer($1) r', [cust.id]))[0].r.document, '11144477735'));
await as(cust);
await fails('Cliente não chama a função do serviço', () => q('select public.svc_payer($1)', [cust.id]), 'permission denied');

// ---------- Avisos ----------
await as(cust);
const [{ id: addr }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua 1', $2, $3) returning id", [cust.id, city, bairro]);
const [{ id: o }] = await q("select public.create_order($1, $2::jsonb, 'platform_delivery', 'cash', 'aviso-0001', 'Cliente', '67988887777', $3) id", [A.id, JSON.stringify([{ product_id: pA, quantity: 1 }]), addr]);
await as(A.owner);
await q("select public.advance_order_status($1, 'ACCEPTED')", [o]);
await ok('Aceite gera aviso para o cliente e corrida para o entregador online', async () => {
  await su();
  const rows = await q('select app, user_id, body from public.notification_outbox order by id');
  return rows.some((r) => r.app === 'customer' && r.user_id === cust.id && /aceitou/.test(r.body)) && rows.some((r) => r.app === 'courier' && r.user_id === cour.id);
});
await as(cust);
await ok('Cliente não lê a fila de avisos', async () => { try { await q('select * from public.notification_outbox'); return false; } catch (e) { return /permission denied/.test(e.message); } });
await su();
await q("insert into public.push_tokens (user_id, app, token) values ($1, 'customer', '{\"endpoint\":\"https://x\"}')", [cust.id]);
await as('service');
await ok('Serviço de avisos pega o lote uma vez só, com os aparelhos', async () => {
  const a = await q('select * from public.svc_take_notifications(50)');
  const b = await q('select * from public.svc_take_notifications(50)');
  const c = a.find((r) => r.app === 'customer');
  return a.length >= 2 && b.length === 0 && c.tokens.length === 1;
});

await ok('Função avisos envia ao aparelho e remove inscrição cancelada (410)', async () => {
  await su();
  await q("insert into public.notification_outbox (user_id, app, title, body) values ($1, 'customer', 'T', 'B')", [cust.id]);
  await q("insert into public.push_tokens (user_id, app, token) values ($1, 'customer', $2)", [cust.id, JSON.stringify({ endpoint: 'https://gone' })]);
  const rpc = async (fn, args) => {
    await as('service');
    const keys = Object.keys(args);
    const sql = 'select * from public.' + fn + '(' + keys.map((k, i) => k + ' => $' + (i + 1)).join(', ') + ')';
    const rows = await q(sql, keys.map((k) => args[k]));
    return fn === 'svc_take_notifications' ? rows : null;
  };
  const sentTo = [];
  const out = await sendQueued({ rpc, send: async (sub) => {
    if (sub.endpoint.includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
    sentTo.push(sub.endpoint);
  } });
  await su();
  const left = (await q("select count(*) c from public.push_tokens where token like '%gone%'"))[0].c;
  return out.sent === 1 && out.removed === 1 && Number(left) === 0 && sentTo[0] === 'https://x';
});

process.exit(t.report() ? 0 : 1);
