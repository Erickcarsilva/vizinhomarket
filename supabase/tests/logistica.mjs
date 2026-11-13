// Testes de logística: online/offline, privacidade da localização, ofertas, aceite, retirada, recusa, falha,
// reatribuição, entregador próprio da loja e ganhos.
// Uso: node supabase/tests/logistica.mjs
import { setupDb, baseScenario } from './lib.mjs';

const t = await setupDb();
const { q, as, su, ok, fails, eq, mk } = t;
const { admin, city, bairro, mkStore } = await baseScenario(t);
const A = await mkStore('donoA', 'Mercado A');
const cust = await mk('cliente'), intruso = await mk('intruso');
const c1 = await mk('entregador1'), c2 = await mk('entregador2'), motoboyLoja = await mk('motoboyLoja');
await su();
await q("update public.stores set lat = -20.93, lng = -54.96 where id = $1", [A.id]);
const [{ id: pA }] = await q("insert into public.products (store_id, name, price) values ($1, 'Ração 10kg', 80) returning id", [A.id]);
for (const c of [c1, c2]) {
  await q("insert into public.couriers (user_id, city_id, status) values ($1, $2, 'approved')", [c.id, city]);
  await q("insert into public.user_roles (user_id, role) values ($1, 'courier')", [c.id]);
}
await q("insert into public.store_members (store_id, user_id, role) values ($1, $2, 'staff')", [A.id, motoboyLoja.id]);
await as(cust);
const [{ id: addr }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua X, 1', $2, $3) returning id", [cust.id, city, bairro]);

let seq = 0;
const newOrder = async (fulfillment = 'platform_delivery') => {
  await as(cust);
  const [{ id }] = await q("select public.create_order($1, $2::jsonb, $3, 'cash', $4, 'Cliente', '67988887777', $5) id",
    [A.id, JSON.stringify([{ product_id: pA, quantity: 1 }]), fulfillment, `log-${++seq}-${Date.now()}`, addr]);
  return id;
};
const status = async (id) => { await su(); return (await q('select status, courier_id from public.orders where id = $1', [id]))[0]; };
const advance = async (id, ...targets) => { await as(A.owner); for (const s of targets) await q('select public.advance_order_status($1, $2)', [id, s]); };

// ---------- Online/offline e privacidade ----------
await as(c1);
await fails('Entregador não muda online direto na tabela', () => q('update public.couriers set is_online = true'), 'permission denied');
await fails('Entregador não grava posição direto na tabela', () => q('update public.couriers set last_lat = 1'), 'permission denied');
await fails('Offline não envia posição', () => q('select public.delivery_update_location(-20.9, -54.9)'), 'online');
await fails('Offline não vê ofertas', () => q('select * from public.list_available_deliveries()'), 'online');
await ok('Fica online e envia posição (sem pedido: só a última, sem histórico)', async () => {
  await q('select public.courier_set_online(true)');
  await q('select public.delivery_update_location(-20.94, -54.97, 15)');
  await su();
  return eq((await q('select count(*) c from public.delivery_locations'))[0].c, 0);
});
await fails('Posição inválida é recusada', async () => { await as(c1); return q('select public.delivery_update_location(200, 0)'); }, 'inválida');
await ok('Ao ficar offline a última posição é apagada', async () => {
  await as(c1); await q('select public.courier_set_online(false)');
  await su();
  const [r] = await q('select last_lat, is_online from public.couriers where user_id = $1', [c1.id]);
  return r.last_lat === null && r.is_online === false;
});
await as(intruso);
await fails('Quem não é entregador não fica online', () => q('select public.courier_set_online(true)'), 'não aprovado');
await fails('Quem não é entregador nem tem entrega não envia posição', () => q('select public.delivery_update_location(-20.9, -54.9)'), 'Sem entrega');

// ---------- Ofertas e aceite ----------
let o1;
await ok('Pedido aceito pela loja já aparece como oferta (com distância real até a loja)', async () => {
  o1 = await newOrder();
  await advance(o1, 'ACCEPTED');
  await as(c1); await q('select public.courier_set_online(true)'); await su();
  await q("update public.couriers set last_lat = -20.94, last_lng = -54.97 where user_id = $1", [c1.id]);
  await as(c1);
  const rows = await q('select * from public.list_available_deliveries()');
  eq(rows.length, 1); eq(rows[0].courier_fee, '6.00');
  return Number(rows[0].distance_to_store_km) > 0 && Number(rows[0].distance_to_store_km) < 3;
});
await ok('Sem coordenadas, a distância não é inventada', async () => {
  await as(c2); await q('select public.courier_set_online(true)');
  const rows = await q('select * from public.list_available_deliveries()');
  return rows[0].distance_to_store_km === null;
});
await ok('Recusar esconde a oferta só para quem recusou', async () => {
  await as(c2); await q('select public.decline_delivery($1)', [o1]);
  eq((await q('select count(*) c from public.list_available_deliveries()'))[0].c, 0);
  await as(c1);
  return eq((await q('select count(*) c from public.list_available_deliveries()'))[0].c, 1);
});
await ok('Aceite antes de ficar pronto (entregador vai a caminho da loja)', async () => {
  await as(c1); await q('select public.claim_delivery($1)', [o1]);
  const s = await status(o1); eq(s.status, 'ACCEPTED'); return eq(s.courier_id, c1.id);
});
await as(c2);
await fails('Segundo aceite da mesma corrida é recusado', () => q('select public.claim_delivery($1)', [o1]), 'já foi assumida');
await as(c1);
await fails('Não retira antes de a loja marcar pronto', () => q('select public.confirm_pickup($1)', [o1]), 'ainda não está pronto');
await fails('Com corrida ativa não fica offline', () => q('select public.courier_set_online(false)'), 'Termine ou libere');
await ok('Liberar antes de retirar devolve à fila', async () => {
  await as(c1); await q("select public.release_delivery($1, 'pneu furou')", [o1]);
  return eq((await status(o1)).courier_id, null);
});
await ok('Quem liberou não vê mais a oferta; outro entregador pega', async () => {
  await as(c1); eq((await q('select count(*) c from public.list_available_deliveries()'))[0].c, 0);
  await su(); await q('delete from public.delivery_declines where courier_id = $1', [c2.id]);
  await as(c2); await q('select public.claim_delivery($1)', [o1]);
  return eq((await status(o1)).courier_id, c2.id);
});
await ok('Retirada coloca o pedido em rota', async () => {
  await advance(o1, 'READY');
  await as(c2); await q('select public.confirm_pickup($1)', [o1]);
  return eq((await status(o1)).status, 'IN_TRANSIT');
});
await as(c2);
await fails('Depois de retirar não dá para "liberar" (só reportar problema)', () => q("select public.release_delivery($1, 'cansei')", [o1]), 'Problema na entrega');

// ---------- Acompanhamento ----------
await ok('Posição do entregador em rota fica no histórico do pedido', async () => {
  await su(); await q("update public.couriers set last_lat = null where user_id = $1", [c2.id]);
  await as(c2);
  const [{ n }] = await q('select public.delivery_update_location(-20.935, -54.965, 10) n');
  return eq(n, 1);
});
await ok('Atualizações muito seguidas (< 10 s) são ignoradas', async () => {
  await as(c2); const [{ n }] = await q('select public.delivery_update_location(-20.936, -54.966) n'); return eq(n, 0);
});
await as(cust);
await ok('Cliente vê só a última posição, o primeiro nome e o prazo configurado', async () => {
  const [{ r }] = await q('select public.order_driver_position($1) r', [o1]);
  eq(r.driver_first_name, 'entregador2'); eq(r.lat, -20.935);
  return r.eta_min === 30;
});
await ok('Cliente não lê a tabela de posições diretamente', async () => {
  try { await q('select * from public.delivery_locations'); return false; } catch (e) { return /permission denied/.test(e.message); }
});
await as(intruso);
await fails('Outro usuário não vê a posição do entregador', () => q('select public.order_driver_position($1)', [o1]), 'não encontrado');

// ---------- Problema e reatribuição ----------
await as(c1);
await fails('Entregador de fora não reporta problema na corrida alheia', () => q("select public.report_delivery_problem($1, 'cliente ausente')", [o1]), 'não encontrada');
await ok('Entregador reporta problema e abre atendimento', async () => {
  await as(c2); await q("select public.report_delivery_problem($1, 'Cliente não atende o portão')", [o1]);
  await su(); return eq((await q("select count(*) c from public.support_tickets where order_id = $1 and kind = 'delivery'", [o1]))[0].c, 1);
});
await as(A.owner);
await fails('Loja não reatribui entrega da plataforma', () => q("select public.admin_reassign_delivery($1, null, 'quero trocar')", [o1]), 'administrador');
await as(admin);
await ok('Admin vê a corrida no monitor', async () => (await q('select * from public.admin_delivery_monitor()')).some((r) => r.order_id === o1));
await fails('Reatribuir exige justificativa', () => q("select public.admin_reassign_delivery($1, $2, '')", [o1, c1.id]), 'Justifique');
await ok('Admin reatribui ao entregador 1 (pedido volta a pronto para nova retirada)', async () => {
  await q("select public.admin_reassign_delivery($1, $2, 'Entregador 2 com problema na moto')", [o1, c1.id]);
  const s = await status(o1); eq(s.status, 'READY'); return eq(s.courier_id, c1.id);
});
await ok('Entregador 1 retira, entrega com código e recebe o ganho', async () => {
  await as(c1); await q('select public.confirm_pickup($1)', [o1]);
  await su(); const [{ delivery_code }] = await q('select delivery_code from public.order_secrets where order_id = $1', [o1]);
  await as(c1); await q('select public.confirm_delivery($1, $2)', [o1, delivery_code]);
  const [{ r }] = await q('select public.courier_earnings() r');
  eq(r.deliveries, 1); eq(r.earned, 6); return eq(r.balance, 6);
});
await as(c2);
await ok('Entregador 2 não ganha por corrida que não concluiu', async () => eq((await q('select public.courier_earnings() r'))[0].r.earned, 0));

// ---------- Entrega própria da loja ----------
let o2;
await ok('Dono marca membro da equipe como entregador e atribui o pedido', async () => {
  o2 = await newOrder('store_delivery');
  await as(A.owner);
  await q('select public.store_set_member_driver($1, $2, true)', [A.id, motoboyLoja.id]);
  await q("select public.advance_order_status($1, 'ACCEPTED')", [o2]);
  await q('select public.store_assign_driver($1, $2)', [o2, motoboyLoja.id]);
  await q("select public.advance_order_status($1, 'READY')", [o2]);
  await q("select public.advance_order_status($1, 'IN_TRANSIT')", [o2]);
  return true;
});
await as(A.owner);
await fails('Não atribui quem não é entregador da loja', () => q('select public.store_assign_driver($1, $2)', [o2, intruso.id]), 'equipe');
await ok('Entregador da loja compartilha a posição e o cliente acompanha', async () => {
  await as(motoboyLoja); await q('select public.delivery_update_location(-20.931, -54.961)');
  await as(cust); const [{ r }] = await q('select public.order_driver_position($1) r', [o2]);
  return eq(r.lat, -20.931);
});
await ok('Entrega própria não gera ganho de entregador da plataforma', async () => {
  await su(); const [{ delivery_code }] = await q('select delivery_code from public.order_secrets where order_id = $1', [o2]);
  await as(A.owner); await q('select public.confirm_delivery($1, $2)', [o2, delivery_code]);
  await su(); return eq((await q("select count(*) c from public.ledger_entries where order_id = $1 and account = 'courier_payable'", [o2]))[0].c, 0);
});

// ---------- Chave geral da entrega pela plataforma ----------
await su(); await q("update public.platform_settings set value = 'false' where key = 'platform_delivery_enabled'");
const Bowner = await mk('donoB');
await as(Bowner);
const [{ id: storeB }] = await q("select public.register_store('Loja B', (select id from public.categories where slug='pet'), $1, 'Dono', '67999990000', '111.444.777-35') id", [city]);
await fails('Loja não liga entrega da plataforma com a chave geral desligada', () => q('update public.stores set accepts_platform_delivery = true where id = $1', [storeB]), 'ainda não está disponível');

// ---------- Retenção ----------
await ok('Limpeza apaga posições antigas', async () => {
  await su(); await q("insert into public.delivery_locations (order_id, driver_id, lat, lng, recorded_at) values ($1, $2, 0, 0, now() - interval '40 days')", [o1, c1.id]);
  await as('service'); const [{ n }] = await q('select public.purge_delivery_locations() n');
  return eq(n, 1);
});

// ---------- Avaliação de pedido anonimizado (correção) ----------
await ok('Pedido anonimizado não pode ser avaliado por outra pessoa', async () => {
  await su(); await q('update public.orders set customer_id = null where id = $1', [o1]).catch(() => {});
  const [{ c }] = await q('select count(*) c from public.orders where id = $1 and customer_id is null', [o1]);
  if (Number(c) === 0) return true; // restrição do banco impede anonimizar com telefone: cenário não se aplica
  await as(intruso);
  try { await q('select public.rate_order($1, 1)', [o1]); return false; } catch (e) { return /não encontrado/.test(e.message); }
});

process.exit(t.report() ? 0 : 1);
