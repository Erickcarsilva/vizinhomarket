// Revisão visual local dos painéis (comerciante, admin) e do app do entregador SEM banco: sessão de teste no navegador
// e respostas da API com dados FICTÍCIOS. Uso (build com VITE_SUPABASE_URL=https://demo.supabase.co, servido em URL):
//   node e2e/paineis-demo.mjs <parceiro|admin|entregador> <URL> <pasta dos prints>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { launchOptions } from './config.mjs';

const [mode, base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const W = Number(process.env.VM_LARGURA || (mode === 'entregador' ? 390 : 1280));
const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'demo@vizinhomarket.test', user_metadata: { full_name: 'Ana Demo' }, app_metadata: {}, created_at: '2026-10-01' };
const now = Date.now();
const iso = (min) => new Date(now - min * 60000).toISOString();
const hours = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [{ weekday: d, opens: '00:00', closes: '12:00' }, { weekday: d, opens: '12:00', closes: '00:00' }]);
const store = { id: 's1', city_id: 'c1', category_id: 'k0', name: 'Pastelaria do Bairro', slug: 's1', description: '', logo_url: null, cover_url: null, phone_public: '6799999999',
  address_line: 'Rua Exemplo, 100', is_paused: false, accepts_pickup: true, accepts_store_delivery: true, accepts_platform_delivery: true, accepts_online_payment: true,
  delivery_fee_default: 5, min_order: 15, prep_time_min: 25, status: 'approved', rating_avg: 4.8, rating_count: 37, created_by: 'u1', created_at: '2026-10-01', updated_at: '2026-10-01',
  category: { slug: 'alimentacao', name: 'Restaurantes e lanches', kind: 'goods', attributes_schema: [] }, city: { name: 'Sidrolândia', timezone: 'America/Campo_Grande' }, hours, zones: [] };
const item = (name, q, p) => ({ product_id: 'p', name, variant_name: null, unit_price: p, quantity: q, line_total: q * p, addons: [] });
const order = (code, name, status, min, extra = {}) => ({ id: code, code, city_id: 'c1', store_id: 's1', customer_id: 'c', courier_id: null, status, fulfillment: 'store_delivery',
  payment_method: 'pix', change_for: null, customer_name: name, customer_phone: '67988887777', address_line: 'Rua das Flores, 50', address_reference: 'Portão verde', notes: null,
  age_check_required: false, subtotal: 28, delivery_fee: 5, total: 33, commission_rate: 0.08, commission_amount: 2.24, cancel_reason: null, created_at: iso(min), accepted_at: null,
  ready_at: null, picked_up_at: null, delivered_at: status === 'DELIVERED' ? iso(min - 30) : null, cancelled_at: null, payment_mode: 'offline', payment_status: 'pending', paid_at: null,
  discount_amount: 0, discount_funded_by: null, courier_fee: 0, refunded_amount: 0, courier_assigned_at: null, store_driver_id: null,
  store: { name: store.name }, items: [item('Pastel de carne', 2, 9.5), item('Caldo de cana 500 ml', 1, 7)], events: [{ status: 'CREATED', created_at: iso(min) }], review: [], ...extra });
const orders = [
  order('VM-7K2QF', 'Maria Souza', 'CREATED', 2),
  order('VM-9PL3D', 'João Lima', 'PREPARING', 14, { payment_mode: 'online', payment_status: 'paid', accepted_at: iso(12) }),
  order('VM-3HG8T', 'Carla Dias', 'READY', 25, { fulfillment: 'platform_delivery', courier_id: 'k1', accepted_at: iso(22) }),
  order('VM-2AB5C', 'Pedro Alves', 'DELIVERED', 80, { payment_status: 'paid' }),
];
const tables = {
  profiles: [{ id: 'u1', full_name: 'Ana Demo', phone: '67999990000', age_confirmed: true, document: null }],
  user_roles: mode === 'admin' ? [{ role: 'admin' }] : mode === 'entregador' ? [{ role: 'courier' }] : [{ role: 'partner' }],
  staff_scopes: [], store_members: [{ role: 'owner', store_id: 's1', user_id: 'u1', store }], stores: [store], orders, invoices: [], coupons: [],
  couriers: [{ user_id: 'u1', status: 'approved', vehicle: 'moto', plate: 'ABC1D23', is_online: true, last_seen: iso(1), created_at: '2026-10-01' }],
  categories: [{ id: 'k0', slug: 'alimentacao', name: 'Restaurantes e lanches' }], cities: [{ id: 'c1', name: 'Sidrolândia', timezone: 'America/Campo_Grande' }],
  neighborhoods: [], platform_settings: [{ key: 'default_commission_rate', value: 0.08 }, { key: 'online_payments_enabled', value: true }], commission_rules: [],
  client_errors: [], audit_log: [], push_tokens: [], support_tickets: [], refunds: [], payments: [], store_private: [], delivery_zones: [], products: [],
};
const rpcs = {
  admin_overview: { orders: 128, delivered: 117, cancelled: 6, auto_cancelled: 2, open: 5, gmv: 4210.5, commission: 336.84, avg_accept_min: 2.4, online_share: 31.5,
    stores_pending: 2, stores_approved: 14, stores_suspended: 0, couriers_pending: 1, couriers_online: 3, users: 412, invoices_open: 180.2, refunds_pending: 1,
    tickets_open: 2, deliveries_unassigned: 0, payments_review: 0, services_open: 3 },
  store_summary: [{ orders: 42, delivered: 39, cancelled: 1, gross: 1380.5, commission: 110.44 }], store_balance: { to_receive: 245.3, to_pay: 61.2, payouts: 500 },
  list_available_deliveries: [{ order_id: 'VM-3HG8T', code: 'VM-3HG8T', status: 'READY', store_name: 'Pastelaria do Bairro', store_address: 'Rua Exemplo, 100', store_neighborhood: 'Centro',
    customer_neighborhood: 'Jardim Pindorama', courier_fee: 6, items_count: 3, ready_at: iso(3), accepted_at: iso(20), distance_to_store_km: 1.2 }],
  courier_earnings: { deliveries: 18, earned: 126, balance: 84, paid_out: 42 }, public_config: { online_payments_enabled: true, platform_delivery_enabled: true },
};

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: W, height: W > 800 ? 900 : 844 }, locale: 'pt-BR', timezoneId: 'America/Campo_Grande' });
await ctx.addInitScript((u) => {
  localStorage.setItem('sb-demo-auth-token', JSON.stringify({ access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600 * 24, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24, user: u }));
}, user);
await ctx.route('https://demo.supabase.co/**', async (route) => {
  const url = new URL(route.request().url());
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
  if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(user) });
  if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 200, headers: h, body: '{}' });
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop();
    return route.fulfill({ status: 200, headers: h, body: JSON.stringify(fn in rpcs ? rpcs[fn] : []) });
  }
  const table = url.pathname.replace('/rest/v1/', '');
  let rows = tables[table] || [];
  for (const [k, v] of url.searchParams) if (v.startsWith('eq.') && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === v.slice(3));
  for (const [k, v] of url.searchParams) if (v.startsWith('in.(') && rows.length && k in rows[0]) { const set = v.slice(4, -1).split(','); rows = rows.filter((r) => set.includes(String(r[k]))); }
  for (const [k, v] of url.searchParams) if (v.startsWith('not.in.(') && rows.length && k in rows[0]) { const set = v.slice(8, -1).split(','); rows = rows.filter((r) => !set.includes(String(r[k]))); }
  const single = /vnd\.pgrst\.object/.test(route.request().headers().accept || '');
  return route.fulfill({ status: 200, headers: { ...h, 'Content-Range': `0-${rows.length}/${rows.length}` }, body: JSON.stringify(single ? rows[0] || null : rows) });
});
const page = await ctx.newPage();
const PAGES = {
  parceiro: [['/', 'pedidos'], ['/financeiro', 'financeiro'], ['/historico', 'historico'], ['/promocoes', 'promocoes']],
  admin: [['/', 'visao'], ['/pedidos', 'pedidos'], ['/financeiro', 'financeiro'], ['/config', 'config']],
  entregador: [['/', 'corridas'], ['/ganhos', 'ganhos']],
};
for (const [path, name] of PAGES[mode]) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${mode}-${name}.png` });
}
await browser.close();
console.log('prints em', out);
