// Revisão visual local do App do Cliente SEM banco: abre o build real no Chromium e responde a API com dados de exemplo.
// Uso: build do cliente com VITE_SUPABASE_URL=https://demo.supabase.co, servido (vite preview) em VM_URL_CLIENTE; depois
//   node e2e/vitrine-demo.mjs <pasta dos prints>
// Os dados abaixo são FICTÍCIOS e servem só para ver o layout.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CLI, launchOptions } from './config.mjs';

const out = process.argv[2] || 'prints-demo';
mkdirSync(out, { recursive: true });
const city = { id: 'c1', name: 'Sidrolândia', timezone: 'America/Campo_Grande', slug: 'sidrolandia-ms', state: 'MS', active: true };
const cats = [['alimentacao', 'Restaurantes e lanches'], ['mercado', 'Mercado'], ['pet', 'Pet shop'], ['bebidas', 'Bebidas'], ['farmacia', 'Farmácia e saúde'], ['servicos', 'Serviços'],
  ['eletronicos', 'Eletrônicos'], ['moda', 'Moda e acessórios'], ['construcao', 'Construção e materiais'], ['beleza', 'Beleza e cuidados'], ['autopecas', 'Autopeças']]
  .map(([slug, name], i) => ({ id: `k${i}`, slug, name, kind: slug === 'servicos' ? 'services' : 'goods', attributes_schema: [] }));
const hours = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [{ weekday: d, opens: '00:00', closes: '12:00' }, { weekday: d, opens: '12:00', closes: '00:00' }]);
const mk = (id, name, slug, fee, rating, prep, extra = {}) => ({
  id, city_id: 'c1', category_id: cats.find((c) => c.slug === slug).id, name, slug: id, description: 'Loja de exemplo para revisão visual.',
  logo_url: null, cover_url: null, phone_public: '6799999999', address_line: 'Rua Exemplo, 100', neighborhood_id: null,
  is_paused: false, accepts_pickup: true, accepts_store_delivery: true, accepts_platform_delivery: false, accepts_online_payment: true,
  delivery_fee_default: fee, min_order: 15, prep_time_min: prep, lat: null, lng: null, status: 'approved', rating_avg: rating, rating_count: 37,
  approved_at: '2026-10-01', created_by: 'u', created_at: '2026-10-01', updated_at: '2026-10-01',
  category: cats.find((c) => c.slug === slug), city, hours, zones: [], ...extra,
});
const stores = [
  mk('s1', 'Pastelaria do Bairro', 'alimentacao', 5, 4.8, 25),
  mk('s2', 'Mercado Bom Preço', 'mercado', 0, 4.6, 40),
  mk('s3', 'Pizzaria Forno a Lenha', 'alimentacao', 7, 4.9, 45),
  mk('s4', 'Pet Amigo', 'pet', 6, 4.7, 30),
  mk('s5', 'Disk Bebidas Gelada', 'bebidas', 4, 4.5, 20),
  mk('s6', 'Elétrica do Zé', 'servicos', 0, 5.0, 0),
  mk('s7', 'Drogaria Central', 'farmacia', 5, 4.8, 25),
  mk('s8', 'Cell Assistência e Acessórios', 'eletronicos', 8, null, 50),
  mk('s9', 'Casa do Construtor', 'construcao', 15, 4.4, 90),
  mk('s10', 'Studio Bela', 'beleza', 0, 4.9, 35),
  mk('s11', 'Auto Peças Avenida', 'autopecas', 10, null, 60, { hours: [] }),
];
const prod = (id, sid, section, name, price, desc = '') => ({ id, store_id: sid, section, name, description: desc, image_url: null, price, unit: 'un', stock: null,
  available: true, age_restricted: false, attributes: {}, sort: 0, created_at: '2026-10-01', variants: [], addon_groups: [] });
const products = [
  prod('p1', 's1', 'Pastéis', 'Pastel de carne', 9.5, 'Carne moída temperada, massa sequinha.'),
  prod('p2', 's1', 'Pastéis', 'Pastel de queijo', 8.5, 'Muçarela derretida.'),
  prod('p3', 's1', 'Pastéis', 'Pastel de frango com catupiry', 10.5),
  prod('p4', 's1', 'Bebidas', 'Caldo de cana 500 ml', 7),
  prod('p5', 's1', 'Bebidas', 'Refrigerante lata', 5.5),
];

const mapByTable = { cities: [city], categories: cats, stores, products, neighborhoods: [], delivery_zones: [], reviews: [], favorites: [], service_offerings: [] };
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Campo_Grande' });
await ctx.route('https://demo.supabase.co/**', async (route) => {
  const url = new URL(route.request().url());
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
  if (url.pathname.startsWith('/rest/v1/rpc/public_config')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ online_payments_enabled: true, payment_sandbox: true, platform_delivery_enabled: false, refund_window_days: 7 }) });
  if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, headers: h, body: '[]' });
  if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 401, headers: h, body: '{"message":"no session"}' });
  const table = url.pathname.replace('/rest/v1/', '');
  let rows = mapByTable[table] || [];
  for (const [k, v] of url.searchParams) {
    if (v.startsWith('eq.') && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === v.slice(3));
  }
  const single = /vnd\.pgrst\.object/.test(route.request().headers().accept || '');
  return route.fulfill({ status: 200, headers: { ...h, 'Content-Range': `0-${rows.length}/${rows.length}` }, body: JSON.stringify(single ? rows[0] || null : rows) });
});
const page = await ctx.newPage();
const W = Number(process.env.VM_LARGURA || 390);
await page.setViewportSize({ width: W, height: W > 800 ? 900 : 844 });
const shots = [['/', 'inicio'], ['/loja/s1', 'loja'], ['/busca', 'busca'], ['/categorias', 'categorias']];
for (const [path, name] of shots) {
  await page.goto(`${CLI}${path}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.VM_PAGINA_INTEIRA === '1' });
}
await page.goto(`${CLI}/loja/s1`);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Adicionar' }).first().click();
await page.getByRole('button', { name: 'Adicionar' }).nth(1).click();
await page.goto(`${CLI}/carrinho`);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/sacola.png`, fullPage: false });
await browser.close();
console.log('prints em', out);
