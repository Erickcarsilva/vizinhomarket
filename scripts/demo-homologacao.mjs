// Contas e dados de DEMONSTRAÇÃO para o ambiente de HOMOLOGAÇÃO (nunca em produção).
// Tudo o que este script cria tem "[DEMO]" no nome e e-mails @demo.vizinhomarket.test, para não se misturar com dados reais.
//
// Uso (no computador, com o projeto de TESTE):
//   cd e2e && SUPABASE_URL=https://<projeto-teste>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave service_role do TESTE> \
//     DEMO_PASSWORD=<senha forte> node ../scripts/demo-homologacao.mjs
// A chave service_role é secreta: não salve em arquivo nem no repositório.
import { createClient } from '../apps/web/node_modules/@supabase/supabase-js/dist/module/index.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEMO_PASSWORD) {
  console.error('Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e DEMO_PASSWORD (ver o topo do arquivo).');
  process.exit(1);
}
if (/prod/i.test(SUPABASE_URL)) { console.error('Recusado: parece ser o projeto de produção.'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

async function user(email, name) {
  const list = must(await sb.auth.admin.listUsers({ perPage: 1000 }));
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  return must(await sb.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: name } })).user.id;
}

const ids = {
  admin: await user('admin@demo.vizinhomarket.test', '[DEMO] Admin'),
  loja: await user('loja@demo.vizinhomarket.test', '[DEMO] Dona da Loja'),
  prestador: await user('prestador@demo.vizinhomarket.test', '[DEMO] Prestador'),
  cliente: await user('cliente@demo.vizinhomarket.test', '[DEMO] Cliente'),
  entregador: await user('entregador@demo.vizinhomarket.test', '[DEMO] Entregador'),
};
must(await sb.from('user_roles').upsert([{ user_id: ids.admin, role: 'admin' }, { user_id: ids.entregador, role: 'courier' }, { user_id: ids.loja, role: 'partner' }, { user_id: ids.prestador, role: 'partner' }], { onConflict: 'user_id,role' }));

const city = must(await sb.from('cities').select('id').eq('slug', 'sidrolandia-ms').single());
const cat = Object.fromEntries(must(await sb.from('categories').select('id, slug')).map((c) => [c.slug, c.id]));

async function store(owner, name, category, extra = {}) {
  const ex = must(await sb.from('stores').select('id').eq('name', name).maybeSingle());
  if (ex) return ex.id;
  const s = must(await sb.from('stores').insert({ city_id: city.id, category_id: cat[category], name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), created_by: owner, status: 'approved', approved_at: new Date().toISOString(), address_line: 'Endereço fictício, 100', ...extra }).select('id').single());
  must(await sb.from('store_members').insert({ store_id: s.id, user_id: owner, role: 'owner' }));
  must(await sb.from('store_private').insert({ store_id: s.id, legal_name: `${name} (fictícia)`, document: '00000000000191', owner_name: '[DEMO]', pix_key: 'pix-demo@vizinhomarket.test' }));
  const hours = []; for (let d = 0; d < 7; d++) hours.push({ store_id: s.id, weekday: d, opens: '07:00', closes: '23:00' });
  must(await sb.from('store_hours').insert(hours));
  return s.id;
}
const mercado = await store(ids.loja, '[DEMO] Mercado Exemplo', 'mercado', { delivery_fee_default: 5, accepts_platform_delivery: true, accepts_online_payment: true });
const servico = await store(ids.prestador, '[DEMO] Elétrica Exemplo', 'servicos');
if (!must(await sb.from('products').select('id').eq('store_id', mercado)).length) {
  must(await sb.from('products').insert([
    { store_id: mercado, name: 'Arroz 5 kg (demo)', price: 27.9, section: 'Mercearia', stock: 50 },
    { store_id: mercado, name: 'Café 500 g (demo)', price: 19.5, section: 'Mercearia', stock: 30 },
    { store_id: mercado, name: 'Banana kg (demo)', price: 6.99, unit: 'kg', section: 'Hortifrúti' },
  ]));
}
if (!must(await sb.from('service_offerings').select('id').eq('store_id', servico)).length) {
  must(await sb.from('service_offerings').insert({ store_id: servico, name: 'Instalação de chuveiro (demo)', price_from: 80, price_unit: 'visita' }));
}
must(await sb.from('couriers').upsert({ user_id: ids.entregador, city_id: city.id, status: 'approved', vehicle: 'moto', plate: 'DEM0A00' }, { onConflict: 'user_id' }));
if (!must(await sb.from('coupons').select('id').eq('code', 'DEMO10')).length) {
  must(await sb.from('coupons').insert({ code: 'DEMO10', kind: 'percent', value: 10, max_discount: 15, funded_by: 'platform', description: '[DEMO] cupom de teste' }));
}

console.log('Pronto. Contas de demonstração (senha = DEMO_PASSWORD):');
for (const [k, v] of Object.entries(ids)) console.log(`  ${k.padEnd(11)} ${k}@demo.vizinhomarket.test  (${v})`);
console.log('Lojas: [DEMO] Mercado Exemplo (produtos, Pix online em sandbox) e [DEMO] Elétrica Exemplo (serviços). Cupom: DEMO10.');
