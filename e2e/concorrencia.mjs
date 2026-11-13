// Testes de concorrência REAIS: várias conexões simultâneas num Postgres de verdade (não dá para fazer no PGlite).
// Cobre: aceite de corrida, último item do estoque, limite do cupom, pedido duplicado, webhook duplicado e estornos.
// Uso: node e2e/apply.mjs . && node e2e/concorrencia.mjs   (Postgres em VM_PG_HOST:VM_PG_PORT, padrão localhost:54329)
import pg from 'pg';
import { PG } from './config.mjs';

const pool = new pg.Pool({ ...PG, max: 40 });
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const su = async (sql, p = []) => (await pool.query(sql, p)).rows;

// Executa como um usuário (ou service_role), numa transação própria, numa conexão própria.
async function asUser(userId, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId && userId !== 'service' ? userId : '']);
    await c.query(userId === 'service' ? 'set local role service_role' : 'set local role authenticated');
    const r = await c.query(sql, params);
    await c.query('commit');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    return { ok: false, error: e.message };
  } finally { c.release(); }
}
const all = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const mkUser = async (name) => (await su("insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id", [`${name}-${Date.now()}-${Math.random()}@t.local`, name]))[0].id;

// ---------- Cenário ----------
await su("update public.platform_settings set value = 'true' where key in ('platform_delivery_enabled', 'online_payments_enabled')");
const admin = await mkUser('admin');
await su("insert into public.user_roles (user_id, role) values ($1, 'admin')", [admin]);
const [{ id: city }] = await su("select id from public.cities where slug = 'sidrolandia-ms'");
const [{ id: bairro }] = await su("insert into public.neighborhoods (city_id, name) values ($1, 'Centro') returning id", [city]);
const owner = await mkUser('dono');
const [{ id: cat }] = await su("select id from public.categories where slug = 'mercado'");
const reg = await asUser(owner, "select public.register_store('Mercado Concorrência', $1, $2, 'Dono', '67999990000', '12.345.678/0001-90') id", [cat, city]);
const store = reg.rows[0].id;
await asUser(admin, "select public.admin_set_store_status($1, 'approved', 0.1)", [store]);
for (let d = 0; d < 7; d++) await su("insert into public.store_hours (store_id, weekday, opens, closes) values ($1, $2, '00:00', '12:00'), ($1, $2, '12:00', '00:00')", [store, d]);
await su('update public.stores set accepts_platform_delivery = true, accepts_online_payment = true, delivery_fee_default = 5 where id = $1', [store]);
const [{ id: pLast }] = await su("insert into public.products (store_id, name, price, stock) values ($1, 'Último lote', 10, 5) returning id", [store]);
const [{ id: pFree }] = await su("insert into public.products (store_id, name, price) values ($1, 'Café', 30) returning id", [store]);

const customers = await all(20, (i) => mkUser(`cliente${i}`));
const order = (cust, product, key, coupon = null, mode = 'offline') => asUser(cust,
  "select public.create_order($1, $2::jsonb, 'pickup', 'pix', $3, 'Cliente', '67988887777', null, null, null, null, $4, $5) id",
  [store, JSON.stringify([{ product_id: product, quantity: 1 }]), key, mode, coupon]);

// ---------- 1. Último item do estoque ----------
{
  const rs = await all(20, (i) => order(customers[i], pLast, `estoque-${i}-${Date.now()}`));
  const okN = rs.filter((r) => r.ok).length;
  const [{ stock }] = await su('select stock from public.products where id = $1', [pLast]);
  check('20 compras simultâneas com 5 em estoque: exatamente 5 pedidos', okN === 5, `pedidos=${okN}`);
  check('Estoque termina em zero (nunca negativo)', Number(stock) === 0, `estoque=${stock}`);
  check('As recusas dizem "Estoque insuficiente"', rs.filter((r) => !r.ok).every((r) => /Estoque insuficiente/.test(r.error)));
}

// ---------- 2. Pedido duplicado (mesma chave, 10 cliques simultâneos) ----------
{
  const key = `duplo-${Date.now()}`;
  const rs = await all(10, () => order(customers[0], pFree, key));
  const ids = new Set(rs.filter((r) => r.ok).map((r) => r.rows[0].id));
  const [{ c }] = await su('select count(*) c from public.orders where idempotency_key = $1', [key]);
  check('10 envios simultâneos do mesmo pedido criam 1 pedido só', Number(c) === 1 && ids.size === 1, `pedidos=${c}, ids=${ids.size}`);
}

// ---------- 3. Limite total do cupom ----------
{
  await asUser(admin, `select public.upsert_coupon('{"code":"CORRIDA","kind":"fixed","value":3,"max_redemptions":3,"funded_by":"platform"}'::jsonb)`);
  const rs = await all(12, (i) => order(customers[i + 5], pFree, `cupom-${i}-${Date.now()}`, 'CORRIDA'));
  const okN = rs.filter((r) => r.ok).length;
  const [{ redemptions }] = await su("select redemptions from public.coupons where code = 'CORRIDA'");
  check('12 pedidos simultâneos com cupom de 3 usos: exatamente 3 com desconto', okN === 3 && Number(redemptions) === 3, `ok=${okN}, usos=${redemptions}`);
}

// ---------- 4. Aceite de corrida (10 entregadores ao mesmo tempo) ----------
{
  const couriers = await all(10, (i) => mkUser(`entregador${i}`));
  for (const c of couriers) {
    await su("insert into public.couriers (user_id, city_id, status, is_online) values ($1, $2, 'approved', true)", [c, city]);
    await su("insert into public.user_roles (user_id, role) values ($1, 'courier')", [c]);
  }
  const cust = customers[19];
  const [{ id: addr }] = await su("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua 1', $2, $3) returning id", [cust, city, bairro]);
  const r = await asUser(cust, "select public.create_order($1, $2::jsonb, 'platform_delivery', 'cash', $3, 'Cliente', '67988887777', $4) id",
    [store, JSON.stringify([{ product_id: pFree, quantity: 1 }]), `corrida-${Date.now()}`, addr]);
  const oid = r.rows[0].id;
  await asUser(owner, "select public.advance_order_status($1, 'ACCEPTED')", [oid]);
  const rs = await all(10, (i) => asUser(couriers[i], 'select public.claim_delivery($1)', [oid]));
  const okN = rs.filter((x) => x.ok).length;
  const [{ courier_id }] = await su('select courier_id from public.orders where id = $1', [oid]);
  check('10 entregadores aceitam a mesma corrida ao mesmo tempo: só 1 consegue', okN === 1 && couriers.includes(courier_id), `aceites=${okN}`);
  check('Os outros recebem "já foi assumida"', rs.filter((x) => !x.ok).every((x) => /já foi assumida/.test(x.error)));
}

// ---------- 5. Webhook duplicado ao mesmo tempo ----------
{
  const cust = customers[18];
  const r = await order(cust, pFree, `online-${Date.now()}`, null, 'online');
  const oid = r.rows[0].id;
  const b = await asUser('service', "select public.svc_payment_begin($1, $2, 'sandbox') r", [oid, cust]);
  await asUser('service', "select public.svc_payment_attach($1, 'sbx_conc', null, null, null, null)", [b.rows[0].r.payment_id]);
  const rs = await all(8, () => asUser('service', "select public.svc_payment_apply('sandbox', 'sbx_conc', 'paid', 30, 'evento-unico', null) res"));
  const [{ n }] = await su("select count(*) n from public.ledger_entries where kind = 'payment_received' and order_id = $1", [oid]);
  check('8 entregas simultâneas do mesmo webhook: 1 lançamento de recebimento', Number(n) === 2, `linhas=${n} (2 = débito + crédito)`); // uma transação = 2 linhas
  check('Nenhuma entrega simultânea do webhook deu erro', rs.every((x) => x.ok), rs.filter((x) => !x.ok).map((x) => x.error).join(' | '));
  // ---------- 6. Dois processadores de estorno ao mesmo tempo ----------
  await asUser(admin, "select public.cancel_order($1, 'teste de concorrência')", [oid]);
  const picks = await all(4, () => asUser('service', 'select * from public.svc_refunds_to_process(10)'));
  const picked = picks.filter((p) => p.ok).flatMap((p) => p.rows.map((x) => x.refund_id));
  check('4 processadores de estorno simultâneos: cada estorno é pego uma vez só', picked.length === 1 && new Set(picked).size === 1, `pegos=${picked.length}`);
}

// ---------- Razão ----------
{
  const [{ s }] = await su('select coalesce(sum(amount), 0) s from public.ledger_entries');
  check('Razão soma zero depois de tudo', Number(s) === 0, `soma=${s}`);
}

await pool.end();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} verificações passaram`);
process.exit(passed === results.length ? 0 : 1);
