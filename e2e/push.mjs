// Aviso de pedido novo com o painel fechado (Web Push), testado sem internet:
// 1) regra da função novo-pedido (supabase/functions/novo-pedido/logic.mjs) contra o banco local de teste,
//    enviando com a biblioteca web-push de verdade para um "serviço de push" falso, aqui mesmo;
// 2) gatilho do banco (migração ..._supabase_platform_aviso_pedido.sql) com uma imitação do pg_net.
// Uso: node push.mjs   (depois de apply.mjs / reset.sh)
import pg from 'pg';
import https from 'node:https';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import webpush from 'web-push';
import { PG } from './config.mjs';
import { handleNewOrder } from '../supabase/functions/novo-pedido/logic.mjs';

const root = process.env.VM_REPO || new URL('..', import.meta.url).pathname;
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const db = new pg.Client(PG);
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

// ---------- serviço de push falso (HTTPS local, certificado de teste)
const dir = mkdtempSync(join(tmpdir(), 'vm-push-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // só para este teste local
const received = [];
const server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received.push({ path: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length });
    res.writeHead(req.url.startsWith('/gone') ? 410 : 201); res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `https://127.0.0.1:${server.address().port}`;
const fakeSub = (path) => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return JSON.stringify({ endpoint: `${base}${path}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } });
};
const vapid = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:teste@vizinhomarket.test', vapid.publicKey, vapid.privateKey);

try {
  // ---------- dados: loja A (dono + atendente), loja B (dono), cliente
  const mk = async (email) => (await one('insert into auth.users (email) values ($1) returning id', [email])).id;
  const donoA = await mk('dono.a@push.test'), atendA = await mk('atend.a@push.test'), donoB = await mk('dono.b@push.test'), cli = await mk('cli@push.test');
  const { id: city } = await one("select id from cities where slug = 'sidrolandia-ms'");
  const { id: cat } = await one("select id from categories where slug = 'mercado'");
  const mkStore = async (name, owner) => {
    const { id } = await one("insert into stores (city_id, category_id, name, slug, created_by, status) values ($1, $2, $3, $4, $5, 'approved') returning id", [city, cat, name, name.toLowerCase().replace(/ /g, '-'), owner]);
    await db.query("insert into store_members (store_id, user_id, role) values ($1, $2, 'owner')", [id, owner]);
    return id;
  };
  const lojaA = await mkStore('Loja Push A', donoA), lojaB = await mkStore('Loja Push B', donoB);
  await db.query("insert into store_members (store_id, user_id, role) values ($1, $2, 'staff')", [lojaA, atendA]);
  const tok = async (user, app, path) => (await one('insert into push_tokens (user_id, app, token) values ($1, $2, $3) returning id', [user, app, fakeSub(path)])).id;
  await tok(donoA, 'partner', '/dono-a');
  const tGone = await tok(atendA, 'partner', '/gone-atendente');
  await tok(donoB, 'partner', '/dono-b');
  await tok(cli, 'customer', '/cliente');
  const { id: pedido } = await one(`insert into orders (code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
      subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key)
    values ('VM-PUSH1', $1, $2, $3, 'CREATED', 'pickup', 'pix', 'Maria Cliente', '67900000000', 30, 0, 30, 0.08, 2.4, 'push-teste-0001') returning id`, [city, lojaA, cli]);

  // ---------- mesma leitura que a função faz no Supabase (index.ts), aqui com SQL
  const store = {
    getOrder: (id) => one('select id, code, store_id, status, created_at, customer_name, total from orders where id = $1', [id]),
    getPartnerTokens: async (sid) => (await db.query("select t.id, t.token from push_tokens t join store_members m on m.user_id = t.user_id and m.store_id = $1 where t.app = 'partner'", [sid])).rows,
    deleteToken: (id) => db.query('delete from push_tokens where id = $1', [id]),
  };
  const send = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 600, urgency: 'high' });

  const r = await handleNewOrder(pedido, { db: store, send });
  check('Pedido novo avisa os aparelhos da equipe da loja (dono e atendente)', r.sent === 1 && r.removed === 1, JSON.stringify(r));
  const paths = received.map((x) => x.path).sort();
  check('Dono e cliente de outra loja não recebem o aviso', paths.join() === '/dono-a,/gone-atendente', paths.join());
  const h = received.find((x) => x.path === '/dono-a')?.headers || {};
  check('Aviso vai cifrado e assinado (padrão Web Push: aes128gcm + VAPID)', h['content-encoding'] === 'aes128gcm' && /^vapid t=.+, k=.+/.test(h.authorization || '') && Number(h.ttl) === 600, `${h['content-encoding']} · ${String(h.authorization).slice(0, 12)}… · TTL ${h.ttl}`);
  check('Aparelho que cancelou a inscrição (410) é removido', !(await one('select 1 x from push_tokens where id = $1', [tGone])));
  await db.query("update orders set status = 'ACCEPTED' where id = $1", [pedido]);
  check('Pedido já aceito não gera aviso', (await handleNewOrder(pedido, { db: store, send })).skipped === 'status');
  await db.query("update orders set status = 'CREATED' where id = $1", [pedido]);
  check('Pedido antigo (mais de 15 min) não gera aviso', (await handleNewOrder(pedido, { db: store, send, now: Date.now() + 20 * 60e3 })).skipped === 'antigo');
  check('Id inventado não gera aviso', (await handleNewOrder('00000000-0000-0000-0000-000000000000', { db: store, send })).skipped === 'nao_encontrado');

  // ---------- gatilho do banco com imitação do pg_net
  await db.query(`create schema if not exists net;
    create table if not exists net._calls (url text, body jsonb);
    create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000) returns bigint
    language plpgsql as $f$ begin
      if url like '%quebrado%' then raise exception 'falha de rede simulada'; end if;
      insert into net._calls values (url, body); return 1; end $f$;`);
  const mig = readFileSync(join(root, 'supabase/migrations/202610220004_supabase_platform_aviso_pedido.sql'), 'utf8').replace(/create extension if not exists pg_net[^;]*;/, '');
  await db.query(mig);
  const novoPedido = async (n) => (await one(`insert into orders (code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
      subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key)
    values ($4, $1, $2, $3, 'CREATED', 'pickup', 'pix', 'Maria', '67900000000', 10, 0, 10, 0.08, 0.8, $5) returning id`, [city, lojaA, cli, `VM-PUSH${n}`, `push-teste-000${n}`])).id;
  await novoPedido(2);
  check('Sem endereço da função configurado, o gatilho não chama nada', (await one('select count(*)::int n from net._calls')).n === 0);
  await db.query(`insert into platform_settings (key, value) values ('push_function_url', '"https://exemplo.supabase.co/functions/v1/novo-pedido"') on conflict (key) do update set value = excluded.value`);
  const p3 = await novoPedido(3);
  const call = await one('select url, body from net._calls');
  check('Pedido novo chama a função com o id do pedido', call?.body?.order_id === p3 && call.url.endsWith('/novo-pedido'), JSON.stringify(call));
  await db.query(`update platform_settings set value = '"https://quebrado.test/x"' where key = 'push_function_url'`);
  const p4 = await novoPedido(4);
  check('Falha ao chamar a função não impede o pedido', !!(await one('select 1 x from orders where id = $1', [p4])));
} catch (e) {
  check('Roteiro completo sem travar', false, e.message.split('\n')[0]);
} finally {
  server.close();
  await db.end();
  console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
