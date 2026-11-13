// Teste de carga proporcional ao piloto: 25 clientes simultâneos por 30 s, pela mesma API do app (PostgREST),
// navegando (lojas, produtos), simulando o total (quote_order) e fazendo pedidos (create_order).
// Meta para uma cidade pequena: 0 erros, p95 < 800 ms, estoque e razão consistentes no fim.
// Uso: node e2e/carga.mjs   (com a API de teste de server.mjs no ar)
import pg from 'pg';
import { API, PG } from './config.mjs';

const VUS = Number(process.env.VM_CARGA_USUARIOS || 25);
const SECONDS = Number(process.env.VM_CARGA_SEGUNDOS || 30);
const db = new pg.Client(PG);
await db.connect();
const { anonKey } = await (await fetch(`${API}/anon-key`)).json();

// Cenário: 1 loja aberta 24 h com 3 produtos (1 com estoque limitado)
const [{ id: city }] = (await db.query("select id from cities where slug = 'sidrolandia-ms'")).rows;
const [{ id: owner }] = (await db.query("insert into auth.users (email) values ('dono-carga@t.local') returning id")).rows;
const [{ id: cat }] = (await db.query("select id from categories where slug = 'alimentacao'")).rows;
const [{ id: store }] = (await db.query("insert into stores (city_id, category_id, name, slug, created_by, status, approved_at) values ($1, $2, 'Lanchonete Carga', 'lanchonete-carga', $3, 'approved', now()) returning id", [city, cat, owner])).rows;
for (let d = 0; d < 7; d++) await db.query("insert into store_hours (store_id, weekday, opens, closes) values ($1, $2, '00:00', '12:00'), ($1, $2, '12:00', '00:00')", [store, d]);
const prods = [];
for (const [name, price, stock] of [['X-Burger', 22, null], ['Refrigerante', 6, null], ['Combo do dia', 30, 40]]) {
  prods.push((await db.query('insert into products (store_id, name, price, stock) values ($1, $2, $3, $4) returning id', [store, name, price, stock])).rows[0].id);
}

// Usuários pelo login de teste (mesmo caminho do app)
const tokens = [];
for (let i = 0; i < VUS; i++) {
  const r = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `carga${i}-${Date.now()}@t.local`, password: 'SenhaForte123!' }) });
  tokens.push((await r.json()).access_token);
}

const lat = { leitura: [], simulacao: [], pedido: [] };
let errors = 0, orders = 0, stockOut = 0;
const call = async (kind, token, path, body) => {
  const t0 = performance.now();
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  lat[kind].push(performance.now() - t0);
  return { ok: r.ok, status: r.status, text };
};

const end = Date.now() + SECONDS * 1000;
await Promise.all(tokens.map(async (token, vu) => {
  let n = 0;
  while (Date.now() < end) {
    const r1 = await call('leitura', token, `stores?select=id,name,rating_avg&status=eq.approved&limit=20`);
    const r2 = await call('leitura', token, `products?select=id,name,price&store_id=eq.${store}`);
    const items = [{ product_id: prods[n % 3], quantity: 1 }, { product_id: prods[1], quantity: 2 }];
    const r3 = await call('simulacao', token, 'rpc/quote_order', { p_store_id: store, p_items: items, p_fulfillment: 'pickup', p_payment_method: 'cash' });
    const r4 = await call('pedido', token, 'rpc/create_order', {
      p_store_id: store, p_items: items, p_fulfillment: 'pickup', p_payment_method: 'cash',
      p_idempotency_key: `carga-${vu}-${n}-${Date.now()}`, p_customer_name: 'Cliente Carga', p_customer_phone: '67999990000',
    });
    for (const r of [r1, r2]) if (!r.ok) errors++;
    if (r4.ok) orders++;
    else if (/Estoque insuficiente/.test(r3.text + r4.text)) stockOut++; // esperado quando o combo acaba
    else errors++;
    if (!r3.ok && !/Estoque insuficiente/.test(r3.text)) errors++;
    n++;
  }
}));

const p = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0; };
const total = Object.values(lat).reduce((a, l) => a + l.length, 0);
const all = Object.values(lat).flat();
const [{ stock }] = (await db.query('select stock from products where id = $1', [prods[2]])).rows;
const [{ combos }] = (await db.query("select coalesce(sum(i.quantity),0)::int combos from order_items i join orders o on o.id = i.order_id where i.product_id = $1 and o.status <> 'CANCELLED'", [prods[2]])).rows;
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
console.log(`Carga: ${VUS} usuários × ${SECONDS} s = ${total} requisições (${Math.round(total / SECONDS)}/s), ${orders} pedidos`);
for (const [k, l] of Object.entries(lat)) console.log(`  ${k.padEnd(10)} n=${l.length} p50=${p(l, 0.5)} ms p95=${p(l, 0.95)} ms p99=${p(l, 0.99)} ms`);
check('Nenhum erro inesperado sob carga', errors === 0, `erros=${errors}`);
check('p95 geral abaixo de 800 ms', p(all, 0.95) < 800, `p95=${p(all, 0.95)} ms`);
check('Estoque do combo nunca vendido além do que havia (40)', combos === 40 - Number(stock) && Number(stock) >= 0, `vendidos=${combos}, restante=${stock}, recusas por estoque=${stockOut}`);
check('Volume mínimo atendido (> 5 pedidos/s)', orders / SECONDS > 5, `${(orders / SECONDS).toFixed(1)} pedidos/s`);
await db.end();
console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(results.every(Boolean) ? 0 : 1);
