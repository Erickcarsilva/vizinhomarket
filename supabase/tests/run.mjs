// Testes de segurança e regras de negócio do backend VizinhoMarket.
// Roda as migrações num Postgres local (PGlite) e simula cada papel como no Supabase.
// Uso: node supabase/tests/run.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'migrations');
const db = new PGlite();

const results = [];
let current = 'superuser';
async function as(user) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ? user.id : '']);
  if (user === 'super') { current = 'superuser'; return; }
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  current = user ? user.name : 'anon';
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); current = 'superuser'; }
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

async function ok(name, fn) {
  try { const r = await fn(); results.push({ name, pass: r !== false, detail: r === false ? 'condição falsa' : '' }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
}
async function fails(name, fn, match) {
  try { await fn(); results.push({ name, pass: false, detail: 'deveria ter falhado e passou' }); }
  catch (e) {
    const pass = !match || new RegExp(match, 'i').test(e.message) || new RegExp(match, 'i').test(e.code || '');
    results.push({ name, pass, detail: pass ? e.message : `erro diferente: ${e.message}` });
  }
}
const eq = (a, b) => { if (String(a) !== String(b)) throw new Error(`esperado ${b}, obtido ${a}`); return true; };

// ---------- Montagem ----------
await db.exec(readFileSync(join(here, 'shim_supabase_local.sql'), 'utf8'));
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql') && !f.includes('supabase_platform')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
}

const mk = async (name) => {
  const [r] = await q("insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id", [`${name}@teste.local`, name]);
  return { id: r.id, name };
};
const admin = await mk('admin'), ownerA = await mk('donoA'), ownerB = await mk('donoB'), staffA = await mk('atendenteA');
const custA = await mk('clienteA'), custB = await mk('clienteB');
const cour1 = await mk('entregador1'), cour2 = await mk('entregador2'), courP = await mk('entregadorPendente');
await q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [admin.id]);
const [{ id: city }] = await q("select id from public.cities where slug = 'sidrolandia-ms'");
const [{ id: bairro1 }] = await q("insert into public.neighborhoods (city_id, name) values ($1, 'Centro') returning id", [city]);
const [{ id: bairro2 }] = await q("insert into public.neighborhoods (city_id, name) values ($1, 'Bairro Distante') returning id", [city]);
const cat = Object.fromEntries((await q('select slug, id from public.categories')).map(r => [r.slug, r.id]));

// Perfil criado pelo gatilho de cadastro
await ok('Gatilho de cadastro cria o perfil', async () => eq((await q('select count(*) c from public.profiles'))[0].c, 9));

// ---------- 1. Cadastro e aprovação de loja ----------
let storeA, storeB;
await as(ownerA);
await ok('Dono A cadastra loja (fica pendente)', async () => {
  storeA = (await q("select public.register_store('Mercado Teste', $1, $2, 'Dono A', '67999990000', '12.345.678/0001-90', 'Mercado Teste LTDA', null, '6733330000', 'Rua A, 10', $3) id", [cat.mercado, city, bairro1]))[0].id;
  return eq((await q('select status from public.stores where id = $1', [storeA]))[0].status, 'pending');
});
await fails('Cadastro com CPF/CNPJ inválido é recusado', () => q("select public.register_store('X', $1, $2, 'a', 'b', '123')", [cat.mercado, city]), 'CPF ou CNPJ');
await fails('Dono não aprova a própria loja (coluna status bloqueada)', () => q("update public.stores set status = 'approved' where id = $1", [storeA]), 'permission denied');
await fails('Dono não altera a própria comissão', () => q('update public.stores set commission_rate = 0 where id = $1', [storeA]), 'permission denied');
await fails('Dono não chama a função de aprovação do admin', () => q("select public.admin_set_store_status($1, 'approved')", [storeA]), 'administrador|permission denied');
await as(null);
await ok('Visitante não vê loja pendente', async () => eq((await q('select count(*) c from public.stores')).at(0).c, 0));
await as(ownerB);
storeB = (await q("select public.register_store('Lanche B', $1, $2, 'Dono B', '67999991111', '111.444.777-35') id", [cat.alimentacao, city]))[0].id;
await as(admin);
await ok('Admin aprova as lojas', async () => {
  await q("select public.admin_set_store_status($1, 'approved', 0.07)", [storeA]);
  await q("select public.admin_set_store_status($1, 'approved')", [storeB]);
  return eq((await q("select count(*) c from public.stores where status = 'approved'"))[0].c, 2);
});
await ok('Aprovação concede papel de parceiro ao dono', async () => eq((await q("select count(*) c from public.user_roles where role = 'partner'"))[0].c, 2));
await su();
await q("insert into public.store_members (store_id, user_id, role) values ($1, $2, 'staff')", [storeA, staffA.id]);

// ---------- 2. Dados pessoais do comércio ----------
await as(null);
await ok('Visitante vê loja aprovada', async () => eq((await q('select count(*) c from public.stores')).at(0).c, 2));
await fails('Visitante não lê CPF/CNPJ (store_private)', () => q('select document from public.store_private'), 'permission denied');
await as(custA);
await ok('Cliente não vê CPF/CNPJ de nenhuma loja', async () => eq((await q('select count(*) c from public.store_private'))[0].c, 0));
await as(staffA);
await ok('Atendente não vê dados fiscais (só o dono)', async () => eq((await q('select count(*) c from public.store_private'))[0].c, 0));
await as(ownerB);
await ok('Dono B não vê dados fiscais da loja A', async () => eq((await q('select count(*) c from public.store_private where store_id = $1', [storeA]))[0].c, 0));
await as(ownerA);
await ok('Dono A vê os próprios dados fiscais', async () => eq((await q('select document from public.store_private where store_id = $1', [storeA]))[0].document, '12345678000190'));

// ---------- 3. Produtos ----------
let pArroz, pCarne, pCamisa, pCerveja, pPizza, vPizzaG, gBorda, addCatupiry, addCheddar, gExtra, addBacon;
await as(ownerA);
await ok('Dono A configura horários, entrega e produtos', async () => {
  for (let d = 0; d < 7; d++) {
    await q("insert into public.store_hours (store_id, weekday, opens, closes) values ($1, $2, '00:00', '12:00'), ($1, $2, '12:00', '00:00')", [storeA, d]);
  }
  await q('insert into public.delivery_zones (store_id, neighborhood_id, fee) values ($1, $2, 5)', [storeA, bairro1]);
  await q('update public.stores set accepts_platform_delivery = true, min_order = 10 where id = $1', [storeA]);
  pArroz = (await q("insert into public.products (store_id, name, price, stock) values ($1, 'Arroz 5kg', 25.90, 10) returning id", [storeA]))[0].id;
  pCarne = (await q("insert into public.products (store_id, name, price, unit) values ($1, 'Carne moída', 39.90, 'kg') returning id", [storeA]))[0].id;
  pCerveja = (await q("insert into public.products (store_id, name, price, age_restricted) values ($1, 'Cerveja lata', 4.50, true) returning id", [storeA]))[0].id;
  pPizza = (await q("insert into public.products (store_id, name, price) values ($1, 'Pizza', 40) returning id", [storeA]))[0].id;
  await q("insert into public.product_variants (product_id, name, price) values ($1, 'Média', 45)", [pPizza]);
  vPizzaG = (await q("insert into public.product_variants (product_id, name, price, stock) values ($1, 'Grande', 60, 5) returning id", [pPizza]))[0].id;
  gBorda = (await q("insert into public.product_addon_groups (product_id, name, min_select, max_select) values ($1, 'Borda', 1, 1) returning id", [pPizza]))[0].id;
  addCatupiry = (await q("insert into public.product_addons (group_id, name, price) values ($1, 'Catupiry', 8) returning id", [gBorda]))[0].id;
  addCheddar = (await q("insert into public.product_addons (group_id, name, price) values ($1, 'Cheddar', 7) returning id", [gBorda]))[0].id;
  gExtra = (await q("insert into public.product_addon_groups (product_id, name, min_select, max_select) values ($1, 'Extras', 0, 2) returning id", [pPizza]))[0].id;
  addBacon = (await q("insert into public.product_addons (group_id, name, price) values ($1, 'Bacon', 5) returning id", [gExtra]))[0].id;
  return true;
});
await fails('Dono A não cria produto na loja B', () => q("insert into public.products (store_id, name, price) values ($1, 'Invasor', 1)", [storeB]), 'row-level security');
await fails('Dono A não move produto para a loja B', () => q('update public.products set store_id = $1 where id = $2', [storeB, pArroz]), 'permission denied');
await fails('Ninguém apaga produto fisicamente (usa deleted_at)', () => q('delete from public.products where id = $1', [pArroz]), 'permission denied');
await as(ownerB);
await ok('Dono B não altera preço de produto da loja A', async () => {
  await q('update public.products set price = 0.01 where id = $1', [pArroz]);
  await su();
  return eq((await q('select price from public.products where id = $1', [pArroz]))[0].price, '25.90');
});
await as(ownerB);
await fails('Dono B não cria variação em produto da loja A', () => q("insert into public.product_variants (product_id, name, price) values ($1, 'X', 1)", [pPizza]), 'row-level security');
await as(ownerB);
await q("insert into public.products (store_id, name, price) values ($1, 'X-Burger', 20)", [storeB]);
await as(null);
await ok('Visitante vê produtos da loja aprovada', async () => (await q('select count(*) c from public.products'))[0].c >= 5);

// ---------- 4. Pedido: preços e regras no servidor ----------
let addrA, order1;
await as(custA);
addrA = (await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua do Cliente, 100', $2, $3) returning id", [custA.id, city, bairro1]))[0].id;
await fails('Cliente não insere pedido direto na tabela', () => q("insert into public.orders (code, city_id, store_id, customer_id, fulfillment, payment_method, customer_name, customer_phone, subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key) values ('X', $1, $2, $3, 'pickup', 'pix', 'aa', '67999999999', 0.01, 0, 0.01, 0, 0, 'chave-fraude-1')", [city, storeA, custA.id]), 'permission denied');
const createOrder = (items, key, extra = {}) => q(
  'select public.create_order($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10) id',
  [extra.store || storeA, JSON.stringify(items), extra.fulfillment || 'platform_delivery', extra.payment || 'pix', key,
   'Cliente A', '67988887777', extra.fulfillment === 'pickup' ? null : (extra.address ?? addrA), null, extra.change ?? null]);
await ok('Pedido calcula preço, taxa e comissão no servidor', async () => {
  // Cliente tenta mandar preço junto: o campo é ignorado.
  order1 = (await createOrder([{ product_id: pArroz, quantity: 2, price: 0.01 }], 'chave-pedido-0001'))[0].id;
  const [o] = await q('select subtotal, delivery_fee, total, commission_rate, commission_amount, status from public.orders where id = $1', [order1]);
  eq(o.subtotal, '51.80'); eq(o.delivery_fee, '5.00'); eq(o.total, '56.80'); eq(o.commission_rate, '0.0700'); eq(o.commission_amount, '3.63');
  return eq(o.status, 'CREATED');
});
await ok('Mesma chave de idempotência não duplica o pedido', async () => {
  const again = (await createOrder([{ product_id: pArroz, quantity: 2 }], 'chave-pedido-0001'))[0].id;
  eq(again, order1);
  return eq((await q('select count(*) c from public.orders'))[0].c, 1);
});
await ok('Estoque baixou 2 unidades', async () => { await su(); return eq((await q('select stock from public.products where id = $1', [pArroz]))[0].stock, '8.000'); });
await as(custA);
await fails('Pedido acima do estoque é recusado', () => createOrder([{ product_id: pArroz, quantity: 9 }], 'chave-pedido-0002'), 'Estoque insuficiente');
await ok('Recusa por estoque não baixa nada', async () => { await su(); return eq((await q('select stock from public.products where id = $1', [pArroz]))[0].stock, '8.000'); });
await as(custA);
await fails('Abaixo do pedido mínimo é recusado', () => createOrder([{ product_id: pCarne, quantity: 0.1 }], 'chave-pedido-0003', { fulfillment: 'pickup' }), 'mínimo');
await fails('Produto de outra loja no pedido é recusado', async () => {
  await su(); const [{ id }] = await q("select id from public.products where name = 'X-Burger'"); await as(custA);
  return createOrder([{ product_id: id, quantity: 1 }], 'chave-pedido-0004');
}, 'não encontrado');
await fails('Quantidade fracionada em produto por unidade é recusada', () => createOrder([{ product_id: pArroz, quantity: 1.5 }], 'chave-pedido-0005'), 'Quantidade inválida');
await ok('Produto por peso aceita 0,5 kg', async () => {
  const id = (await createOrder([{ product_id: pCarne, quantity: 0.5 }], 'chave-pedido-0006', { fulfillment: 'pickup' }))[0].id;
  return eq((await q('select subtotal from public.orders where id = $1', [id]))[0].subtotal, '19.95');
});
await fails('Pizza sem escolher tamanho é recusada', () => createOrder([{ product_id: pPizza, quantity: 1, addon_ids: [addCatupiry] }], 'chave-pedido-0007'), 'Escolha uma opção');
await fails('Pizza sem a borda obrigatória é recusada', () => createOrder([{ product_id: pPizza, variant_id: vPizzaG, quantity: 1 }], 'chave-pedido-0008'), 'Borda');
await fails('Duas bordas quando o máximo é 1 é recusado', () => createOrder([{ product_id: pPizza, variant_id: vPizzaG, quantity: 1, addon_ids: [addCatupiry, addCheddar] }], 'chave-pedido-0009'), 'Borda');
await fails('Adicional de outro produto é recusado', async () => {
  await su(); const [{ id: g }] = await q("insert into public.product_addon_groups (product_id, name) values ($1, 'Outro') returning id", [pArroz]);
  const [{ id: a }] = await q("insert into public.product_addons (group_id, name, price) values ($1, 'Intruso', 0) returning id", [g]);
  await as(custA);
  return createOrder([{ product_id: pPizza, variant_id: vPizzaG, quantity: 1, addon_ids: [addCatupiry, a] }], 'chave-pedido-0010');
}, 'Adicional inválido');
await ok('Pizza grande + catupiry + bacon = (60+8+5) x 2', async () => {
  const id = (await createOrder([{ product_id: pPizza, variant_id: vPizzaG, quantity: 2, addon_ids: [addCatupiry, addBacon] }], 'chave-pedido-0011', { fulfillment: 'pickup' }))[0].id;
  return eq((await q('select subtotal from public.orders where id = $1', [id]))[0].subtotal, '146.00');
});
await fails('Bebida alcoólica sem confirmar maioridade é recusada', () => createOrder([{ product_id: pCerveja, quantity: 4 }], 'chave-pedido-0012', { fulfillment: 'pickup' }), '18 anos');
await ok('Após confirmar maioridade, bebida é aceita e marcada para conferência', async () => {
  await q("select public.confirm_age('1990-05-10')");
  const id = (await createOrder([{ product_id: pCerveja, quantity: 4 }], 'chave-pedido-0013', { fulfillment: 'pickup' }))[0].id;
  return eq((await q('select age_check_required from public.orders where id = $1', [id]))[0].age_check_required, true);
});
await fails('Troco menor que o total é recusado', () => createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0014', { payment: 'cash', change: 20 }), 'Troco');
await fails('Endereço de outro cliente é recusado', async () => {
  await as(custB);
  const [{ id }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua B, 1', $2, $3) returning id", [custB.id, city, bairro1]);
  await as(custA);
  return createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0015', { address: id });
}, 'Endereço');
await fails('Bairro fora da área de entrega é recusado', async () => {
  const [{ id }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Longe, 1', $2, $3) returning id", [custA.id, city, bairro2]);
  return createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0016', { address: id });
}, 'não entrega');
await fails('Loja pausada não recebe pedido', async () => {
  await as(ownerA); await q('update public.stores set is_paused = true where id = $1', [storeA]);
  await as(custA);
  try { return await createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0017'); }
  finally { await as(ownerA); await q('update public.stores set is_paused = false where id = $1', [storeA]); await as(custA); }
}, 'pausou');
await fails('Loja sem horário cadastrado (fechada) não recebe pedido', async () => {
  await su(); const [{ id }] = await q("select id from public.products where name = 'X-Burger'"); await as(custA);
  return createOrder([{ product_id: id, quantity: 1 }], 'chave-pedido-0018', { store: storeB, fulfillment: 'pickup' });
}, 'fechada');

// ---------- 5. Quem vê o pedido ----------
await as(custB);
await ok('Cliente B não vê pedido do cliente A', async () => eq((await q('select count(*) c from public.orders where id = $1', [order1]))[0].c, 0));
await ok('Cliente B não vê itens do pedido do cliente A', async () => eq((await q('select count(*) c from public.order_items where order_id = $1', [order1]))[0].c, 0));
await as(ownerB);
await ok('Loja B não vê pedido da loja A', async () => eq((await q('select count(*) c from public.orders where id = $1', [order1]))[0].c, 0));
await as(cour1);
await ok('Entregador não vê pedido antes de aceitar', async () => eq((await q('select count(*) c from public.orders where id = $1', [order1]))[0].c, 0));
await as(staffA);
await ok('Atendente da loja A vê o pedido', async () => eq((await q('select count(*) c from public.orders where id = $1', [order1]))[0].c, 1));
await ok('Atendente não vê o código de entrega', async () => eq((await q('select count(*) c from public.order_secrets where order_id = $1', [order1]))[0].c, 0));
await as(custA);
let code1;
await ok('Cliente vê o próprio código de entrega', async () => { code1 = (await q('select delivery_code from public.order_secrets where order_id = $1', [order1]))[0].delivery_code; return /^\d{4}$/.test(code1); });

// ---------- 6. Status ----------
await fails('Cliente não avança status', () => q("select public.advance_order_status($1, 'ACCEPTED')", [order1]), 'Sem permissão');
await as(ownerB);
await fails('Loja B não avança pedido da loja A', () => q("select public.advance_order_status($1, 'ACCEPTED')", [order1]), 'Sem permissão');
await as(ownerA);
await fails('Loja não pula de CREATED para READY', () => q("select public.advance_order_status($1, 'READY')", [order1]), 'não permitida');
await fails('Loja não marca entregue direto (exige código)', () => q("select public.advance_order_status($1, 'DELIVERED')", [order1]), 'não permitida');
await ok('Loja aceita, prepara e marca pronto', async () => {
  for (const s of ['ACCEPTED', 'PREPARING', 'READY']) await q('select public.advance_order_status($1, $2)', [order1, s]);
  return eq((await q('select status from public.orders where id = $1', [order1]))[0].status, 'READY');
});
await fails('Loja não marca "saiu para entrega" em entrega da plataforma', () => q("select public.advance_order_status($1, 'IN_TRANSIT')", [order1]), 'não permitida');

// ---------- 7. Entregadores ----------
for (const c of [cour1, cour2, courP]) { await as(c); await q("select public.apply_as_courier($1, 'moto', 'abc1d23', '529.982.247-25')", [city]); }
await as(cour1);
await fails('Entregador não se aprova sozinho', () => q("update public.couriers set status = 'approved'"), 'permission denied');
await as(admin);
await q("select public.admin_set_courier_status($1, 'approved')", [cour1.id]);
await q("select public.admin_set_courier_status($1, 'approved')", [cour2.id]);
await as(courP);
await fails('Entregador pendente não vê corridas', () => q('select * from public.list_available_deliveries()'), 'não aprovado');
await fails('Entregador pendente não aceita corrida', () => q('select public.claim_delivery($1)', [order1]), 'não aprovado');
await as(cour1);
await ok('Lista de corridas não expõe endereço nem telefone do cliente', async () => {
  const rows = await q('select * from public.list_available_deliveries()');
  const cols = Object.keys(rows[0] || {});
  return rows.length === 1 && !cols.some(c => /address_line$|phone|customer_name/.test(c)) && cols.includes('customer_neighborhood');
});
await ok('Entregador 1 aceita a corrida', async () => { await q('select public.claim_delivery($1)', [order1]); return true; });
await as(cour2);
await fails('Entregador 2 não aceita a mesma corrida (aceite atômico)', () => q('select public.claim_delivery($1)', [order1]), 'já foi assumida');
await ok('Entregador 2 não vê o pedido', async () => eq((await q('select count(*) c from public.orders where id = $1', [order1]))[0].c, 0));
await as(cour1);
await ok('Entregador 1 vê endereço depois de aceitar', async () => eq((await q('select address_line from public.orders where id = $1', [order1]))[0].address_line, 'Rua do Cliente, 100'));
await ok('Entregador não vê o código de entrega', async () => eq((await q('select count(*) c from public.order_secrets where order_id = $1', [order1]))[0].c, 0));
await ok('Código errado não entrega e conta tentativa', async () => {
  const wrong = code1 === '0000' ? '1111' : '0000';
  const [{ r }] = await q('select public.confirm_delivery($1, $2) r', [order1, wrong]);
  eq(r.ok, false);
  await su();
  eq((await q('select attempts from public.order_secrets where order_id = $1', [order1]))[0].attempts, 1);
  return eq((await q('select status from public.orders where id = $1', [order1]))[0].status, 'IN_TRANSIT');
});
await as(cour2);
await fails('Entregador 2 não confirma entrega alheia', () => q('select public.confirm_delivery($1, $2)', [order1, code1]), 'não pode confirmar');
await as(cour1);
await ok('Código certo conclui a entrega', async () => {
  const [{ r }] = await q('select public.confirm_delivery($1, $2) r', [order1, code1]);
  eq(r.ok, true);
  return eq((await q('select status from public.orders where id = $1', [order1]))[0].status, 'DELIVERED');
});

// ---------- 8. Avaliação ----------
await as(custB);
await fails('Cliente B não avalia pedido do cliente A', () => q('select public.rate_order($1, 5)', [order1]), 'não encontrado');
await as(custA);
await ok('Cliente A avalia o pedido entregue', async () => { await q("select public.rate_order($1, 4, 5, 'Chegou rápido')", [order1]); return true; });
await fails('Não avalia duas vezes', () => q('select public.rate_order($1, 1)', [order1]), 'já avaliado');
await ok('Nota média da loja atualizada', async () => eq((await q('select rating_avg, rating_count from public.stores where id = $1', [storeA]))[0].rating_avg, '4.00'));
await as(null);
await ok('Visitante lê nota e comentário da avaliação', async () => eq((await q('select store_rating from public.reviews'))[0].store_rating, 4));
await fails('Visitante não descobre quem avaliou', () => q('select customer_id from public.reviews'), 'permission denied');

// ---------- 9. Cancelamento e retirada ----------
await as(custA);
let order2;
await ok('Cliente cancela pedido ainda não aceito', async () => {
  order2 = (await createOrder([{ product_id: pArroz, quantity: 3 }], 'chave-pedido-0020'))[0].id;
  await q('select public.cancel_order($1, null)', [order2]);
  await su();
  return eq((await q('select stock from public.products where id = $1', [pArroz]))[0].stock, '8.000');
});
await as(custA);
const order3 = (await createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0021', { fulfillment: 'pickup' }))[0].id;
await as(ownerA); await q("select public.advance_order_status($1, 'ACCEPTED')", [order3]);
await as(custA);
await fails('Cliente não cancela pedido já aceito', () => q("select public.cancel_order($1, 'desisti')", [order3]), 'já aceitou');
await as(ownerA);
await fails('Loja precisa informar motivo para cancelar', () => q("select public.cancel_order($1, '')", [order3]), 'motivo');
await ok('Retirada: loja confirma com o código do cliente', async () => {
  await q("select public.advance_order_status($1, 'READY')", [order3]);
  await as(custA); const [{ delivery_code }] = await q('select delivery_code from public.order_secrets where order_id = $1', [order3]);
  await as(ownerA); const [{ r }] = await q('select public.confirm_delivery($1, $2) r', [order3, delivery_code]);
  return eq(r.ok, true);
});

// ---------- 10. Papéis e dados pessoais ----------
await as(custA);
await fails('Cliente não se dá papel de admin', () => q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [custA.id]), 'permission denied');
await fails('Cliente não muda configurações da plataforma', () => q("select public.admin_set_setting('default_commission_rate', '0')"), 'administrador');
await fails('Cliente não chama funções internas', () => q("select public._audit('x', 'y', 'z')"), 'permission denied');
await ok('Cliente A não vê perfil do cliente B', async () => eq((await q('select count(*) c from public.profiles where id = $1', [custB.id]))[0].c, 0));
await ok('Cliente A não vê endereços do cliente B', async () => eq((await q('select count(*) c from public.addresses where user_id = $1', [custB.id]))[0].c, 0));
await fails('Cliente não confirma maioridade direto na tabela', () => q('update public.profiles set age_confirmed = true where id = $1', [custA.id]), 'permission denied');
await as(cour1);
await ok('Entregador não vê CPF de outros entregadores', async () => eq((await q('select count(*) c from public.couriers'))[0].c, 1));
await as(null);
await fails('Visitante não cria pedido', () => q("select public.create_order($1, '[]'::jsonb, 'pickup', 'pix', 'chave-anon-01', 'x', 'y')", [storeA]), 'permission denied');


// ---------- 11. Ajustes para as telas (19/10) ----------
await as(null);
await fails('Visitante não vê a comissão negociada da loja', () => q('select commission_rate from public.stores'), 'permission denied');
await as(custA);
await fails('Cliente não vê a comissão negociada da loja', () => q('select commission_rate from public.stores'), 'permission denied');
await ok('Cliente lê colunas públicas da loja', async () => eq((await q('select name from public.stores where id = $1', [storeA]))[0].name, 'Mercado Teste'));
await fails('Endereço sem bairro é recusado quando a loja entrega por bairro', async () => {
  const [{ id }] = await q("insert into public.addresses (user_id, line, city_id) values ($1, 'Rua Sem Bairro, 5', $2) returning id", [custA.id, city]);
  return createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0030', { address: id });
}, 'Informe o bairro');
await ok('Endereço sem bairro é aceito quando a loja usa taxa única', async () => {
  await as(ownerA); await q('delete from public.delivery_zones where store_id = $1', [storeA]);
  await as(custA);
  const [{ id: addr }] = await q("insert into public.addresses (user_id, line, city_id) values ($1, 'Rua Sem Bairro, 6', $2) returning id", [custA.id, city]);
  const id = (await createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-pedido-0031', { address: addr }))[0].id;
  return eq((await q('select delivery_fee from public.orders where id = $1', [id]))[0].delivery_fee, '0.00');
});
await ok('Cliente indica uma loja', async () => { await q("insert into public.store_referrals (store_name, contact) values ('Padaria Nova', '67999990000')"); return true; });
await ok('Cliente não lê as indicações', async () => eq((await q('select count(*) c from public.store_referrals'))[0].c, 0));
await fails('Cliente não forja quem indicou', () => q("insert into public.store_referrals (store_name, referred_by) values ('X loja', $1)", [custB.id]), 'permission denied');
await as(admin);
await ok('Admin lê as indicações com o autor gravado pelo servidor', async () => eq((await q('select referred_by from public.store_referrals'))[0].referred_by, custA.id));

// ---------- 12. Bloco 1 do piloto (20/10) ----------
await as(ownerA);
await q("update public.store_private set pix_key = 'pix@mercadoteste.com' where store_id = $1", [storeA]);
const pB1 = (await q("insert into public.products (store_id, name, price, stock) values ($1, 'Produto Bloco1', 10, 1000) returning id", [storeA]))[0].id;
await as(custA);
const oPix = (await createOrder([{ product_id: pB1, quantity: 1 }], 'chave-bloco1-0001'))[0].id;
await ok('Cliente que pagou com Pix vê a chave Pix da loja', async () => {
  const [{ i }] = await q('select public.order_payment_info($1) i', [oPix]);
  eq(i.pix_key, 'pix@mercadoteste.com');
  return eq(Number(i.amount), Number((await q('select total from public.orders where id = $1', [oPix]))[0].total));
});
await ok('Chave Pix continua fora da tabela pública da loja', async () => eq((await q("select count(*) c from information_schema.columns where table_name = 'stores' and column_name like '%pix%'"))[0].c, 0));
await as(custB);
await fails('Outro cliente não vê a chave Pix daquele pedido', () => q('select public.order_payment_info($1)', [oPix]), 'não encontrado');
await as(custA);
const oCard = (await createOrder([{ product_id: pB1, quantity: 1 }], 'chave-bloco1-0002', { payment: 'card_on_delivery' }))[0].id;
await ok('Pedido no cartão não expõe chave Pix', async () => eq((await q('select public.order_payment_info($1) i', [oCard]))[0].i, null));
await fails('Cliente não roda o cancelamento automático', () => q('select public.expire_stale_orders()'), 'permission denied');
await su();
await q("update public.orders set created_at = now() - interval '20 minutes' where id = $1", [oCard]);
await ok('Pedido sem aceite há mais de 15 min é cancelado sozinho', async () => {
  const [{ n }] = await q('select public.expire_stale_orders() n'); eq(n, 1);
  const [o] = await q('select status, cancel_reason from public.orders where id = $1', [oCard]);
  eq(o.status, 'CANCELLED'); return /não respondeu/.test(o.cancel_reason);
});
await ok('Pedido recente não é cancelado', async () => eq((await q('select status from public.orders where id = $1', [oPix]))[0].status, 'CREATED'));
await ok('Cancelamento automático devolve o estoque', async () => eq((await q('select stock from public.products where id = $1', [pB1]))[0].stock, '999.000'));

await as(custA);
await fails('Cliente com pedido em andamento não exclui a conta', () => q('select public.delete_my_account()'), 'em andamento');
await as(ownerA);
await fails('Dono de loja não exclui a conta sem encerrar a loja', () => q('select public.delete_my_account()'), 'dono de uma loja');
await su();
const custC = await mk('clienteC');
const [{ id: addrC }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua C, 3', $2, $3) returning id", [custC.id, city, bairro1]);
await as(custC);
const oC = (await q("select public.create_order($1, $2::jsonb, 'store_delivery', 'cash', 'chave-bloco1-0003', 'Cliente C', '67911112222', $3, 'apto 2', null) id", [storeA, JSON.stringify([{ product_id: pB1, quantity: 1 }]), addrC]))[0].id;
await q("select public.cancel_order($1, '')", [oC]);
await ok('Cliente exclui a própria conta', async () => { await q('select public.delete_my_account()'); return true; });
await su();
await ok('Conta excluída some do login, do perfil e dos endereços', async () => {
  eq((await q('select count(*) c from auth.users where id = $1', [custC.id]))[0].c, 0);
  eq((await q('select count(*) c from public.profiles where id = $1', [custC.id]))[0].c, 0);
  return eq((await q('select count(*) c from public.addresses where user_id = $1', [custC.id]))[0].c, 0);
});
await ok('Pedido da conta excluída fica anônimo para a loja', async () => {
  const [o] = await q('select customer_id, customer_name, customer_phone, address_line, total from public.orders where id = $1', [oC]);
  eq(o.customer_id, null); eq(o.customer_name, 'Cliente removido'); eq(o.customer_phone, null); return eq(o.address_line, null);
});

await as(custA);
await fails('Pedido de cliente ativo continua exigindo telefone', () => q("select public.create_order($1, $2::jsonb, 'pickup', 'cash', 'chave-bloco1-0004', 'Cliente A', null, null, null, null)", [storeA, JSON.stringify([{ product_id: pB1, quantity: 1 }])]), 'orders_phone_required|telefone|null');
await as(null);
await ok('App registra erro mesmo sem login', async () => { await q("select public.log_client_error('Erro de teste', 'pilha', '/carrinho', 'Android', '1.0')"); return true; });
await fails('Visitante não lê os erros', () => q('select * from public.client_errors'), 'permission denied');
await as(custA);
await ok('Cliente não lê os erros', async () => eq((await q('select count(*) c from public.client_errors'))[0].c, 0));
await as(admin);
await ok('Admin lê os erros registrados', async () => eq((await q('select message from public.client_errors'))[0].message, 'Erro de teste'));

// ---------- 13. Painel administrativo (21/10) ----------
await as(custA);
await fails('Cliente não lista usuários', () => q('select * from public.admin_list_users()'), 'administrador');
await fails('Cliente não gera faturas', () => q("select public.admin_generate_invoices('2026-01-01', '2026-12-31')"), 'administrador');
await fails('Cliente não vê o resumo do admin', () => q('select public.admin_overview()'), 'administrador');
await as(ownerA);
await fails('Lojista não bloqueia usuário', () => q('select public.admin_set_user_banned($1, true)', [custB.id]), 'administrador');
await fails('Lojista não vira admin sozinho', () => q('select public.admin_set_admin($1, true)', [ownerA.id]), 'administrador');
await as(admin);
await ok('Admin lista usuários com e-mail e papel', async () => {
  const rows = await q("select * from public.admin_list_users('admin')");
  return eq(rows[0].email, 'admin@teste.local') && eq(rows[0].roles.includes('admin'), true);
});
await ok('Admin vê quem é dono de loja', async () => eq((await q("select owns_store from public.admin_list_users('donoA')"))[0].owns_store, true));
await ok('Admin bloqueia e desbloqueia usuário', async () => {
  await q('select public.admin_set_user_banned($1, true, $2)', [custB.id, 'teste']);
  eq((await q("select banned from public.admin_list_users('clienteB')"))[0].banned, true);
  await q('select public.admin_set_user_banned($1, false)', [custB.id]);
  return eq((await q("select banned from public.admin_list_users('clienteB')"))[0].banned, false);
});
await fails('Admin não bloqueia a si mesmo', () => q('select public.admin_set_user_banned($1, true)', [admin.id]), 'própria conta');
await fails('Admin não tira o próprio acesso', () => q('select public.admin_set_admin($1, false)', [admin.id]), 'próprio acesso');
await ok('Admin dá e tira acesso de admin de outra pessoa', async () => {
  await q('select public.admin_set_admin($1, true)', [ownerB.id]);
  eq((await q("select count(*) c from public.user_roles where user_id = $1 and role = 'admin'", [ownerB.id]))[0].c, 1);
  await q('select public.admin_set_admin($1, false)', [ownerB.id]);
  return eq((await q("select count(*) c from public.user_roles where user_id = $1 and role = 'admin'", [ownerB.id]))[0].c, 0);
});
await ok('Admin lista entregadores com a situação', async () => (await q('select * from public.admin_list_couriers()')).some((r) => r.status === 'pending'));
await ok('Ação do admin fica no registro de auditoria', async () => Number((await q("select count(*) c from public.audit_log where action in ('ban_user','unban_user','grant_admin','revoke_admin')"))[0].c) >= 4);
await ok('Resumo do admin calcula no servidor', async () => {
  const [{ r }] = await q("select public.admin_overview('2000-01-01', now() + interval '1 day') r");
  return Number(r.orders) > 0 && Number(r.delivered) > 0 && r.stores_approved >= 1;
});
await ok('Admin gera faturas do período só com pedidos entregues', async () => {
  const n = (await q("select public.admin_generate_invoices('2000-01-01', (now() + interval '1 day')::date) n"))[0].n;
  const [inv] = await q('select orders_count, commission_total from public.invoices where store_id = $1', [storeA]);
  const [real] = await q("select count(*) c, sum(commission_amount) s from public.orders where store_id = $1 and status = 'DELIVERED'", [storeA]);
  eq(inv.orders_count, real.c); eq(inv.commission_total, real.s); return n >= 1;
});
await ok('Gerar de novo não duplica a fatura', async () => {
  await q("select public.admin_generate_invoices('2000-01-01', (now() + interval '1 day')::date)");
  return eq((await q('select count(*) c from public.invoices where store_id = $1', [storeA]))[0].c, 1);
});
await ok('Admin marca a fatura como paga', async () => {
  const [{ id }] = await q('select id from public.invoices where store_id = $1', [storeA]);
  await q("select public.admin_set_invoice_status($1, 'paid')", [id]);
  const [i] = await q('select status, paid_at from public.invoices where id = $1', [id]);
  return eq(i.status, 'paid') && i.paid_at !== null;
});
await ok('Fatura paga não é alterada ao gerar de novo', async () => {
  await q("select public.admin_generate_invoices('2000-01-01', (now() + interval '1 day')::date)");
  return eq((await q('select status from public.invoices where store_id = $1', [storeA]))[0].status, 'paid');
});
await ok('Admin vê a comissão negociada e a efetiva de cada loja', async () => {
  const [r] = await q('select * from public.admin_store_rates() where store_id = $1', [storeA]);
  return eq(r.negotiated, '0.0700') && eq(r.effective, '0.0700');
});
await ok('Admin volta a loja para a comissão padrão', async () => {
  await q('select public.admin_set_store_commission($1, null)', [storeA]);
  const [r] = await q('select * from public.admin_store_rates() where store_id = $1', [storeA]);
  eq(r.negotiated, null); await q('select public.admin_set_store_commission($1, 0.07)', [storeA]); return true;
});
await fails('Comissão acima de 50% é recusada', () => q('select public.admin_set_store_commission($1, 0.9)', [storeA]), 'entre 0');
await as(ownerA);
await fails('Lojista não chama a lista de comissões', () => q('select * from public.admin_store_rates()'), 'administrador');
await ok('Lojista vê a própria fatura', async () => eq((await q('select count(*) c from public.invoices where store_id = $1', [storeA]))[0].c, 1));
await as(ownerB);
await ok('Lojista não vê fatura de outra loja', async () => eq((await q('select count(*) c from public.invoices where store_id = $1', [storeA]))[0].c, 0));
await as(custA);
await fails('Cliente não marca fatura como paga', async () => { await su(); const [{ id }] = await q('select id from public.invoices limit 1'); await as(custA); return q("select public.admin_set_invoice_status($1, 'void')", [id]); }, 'administrador');

// ---------- 14. Totais do comerciante no servidor (21/10) ----------
await su();
// 1.200 pedidos entregues + 150 cancelados na loja B, espalhados nos últimos 60 dias
await q(`insert into public.orders (code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
           subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key, created_at, accepted_at, delivered_at)
         select 'VOL-' || g, $1, $2, $3, 'DELIVERED', 'store_delivery', 'pix', 'Cliente Volume', '67900000000',
                10 + (g % 7), 5, 15 + (g % 7), 0.08, round((10 + (g % 7)) * 0.08, 2), 'volume-' || g,
                now() - (g % 60) * interval '1 day' - interval '1 hour', now() - (g % 60) * interval '1 day' - interval '58 minutes',
                now() - (g % 60) * interval '1 day' - interval '30 minutes'
         from generate_series(1, 1200) g`, [city, storeB, custA.id]);
await q(`insert into public.orders (code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
           subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key, created_at, cancel_reason)
         select 'VOLC-' || g, $1, $2, $3, 'CANCELLED', 'store_delivery', 'pix', 'Cliente Volume', '67900000000', 20, 5, 25, 0.08, 1.6,
                'volume-c-' || g, now() - (g % 60) * interval '1 day', case when g % 3 = 0 then 'A loja não respondeu a tempo. Nenhum valor foi cobrado.' else 'outro' end
         from generate_series(1, 150) g`, [city, storeB, custA.id]);
await q(`insert into public.order_items (order_id, product_id, name, unit, unit_price, quantity, line_total)
         select o.id, null, case when o.code like '%1' then 'X-Bacon' else 'X-Salada' end, 'un', o.subtotal, 1, o.subtotal
         from public.orders o where o.code like 'VOL-%'`);
const range = ["now() - interval '30 days'", 'now() + interval \'1 minute\''];
const [ref] = await q(`select count(*) filter (where status='DELIVERED' and delivered_at >= ${range[0]}) entregues,
    sum(subtotal) filter (where status='DELIVERED' and delivered_at >= ${range[0]}) vendas,
    sum(commission_amount) filter (where status='DELIVERED' and delivered_at >= ${range[0]}) comissao,
    count(*) filter (where status='CANCELLED' and created_at >= ${range[0]}) cancelados
  from public.orders where store_id = $1`, [storeB]);
await as(ownerB);
await ok('Resumo do servidor bate com a soma direta no banco (mais de 500 pedidos)', async () => {
  const [{ r }] = await q(`select public.store_summary($1, ${range[0]}, ${range[1]}) r`, [storeB]);
  eq(r.delivered, ref.entregues); eq(Number(r.sales).toFixed(2), Number(ref.vendas).toFixed(2));
  eq(Number(r.commission).toFixed(2), Number(ref.comissao).toFixed(2)); return eq(r.cancelled, ref.cancelados);
});
await ok('Período maior que 1.000 pedidos também bate (60 dias)', async () => {
  const [{ r }] = await q("select public.store_summary($1, now() - interval '61 days', now() + interval '1 minute') r", [storeB]);
  return eq(r.delivered, 1200 + Number((await q("select count(*) c from public.orders where store_id = $1 and status = 'DELIVERED' and code not like 'VOL-%'", [storeB]))[0].c));
});
await ok('Cancelamentos automáticos contados à parte', async () => {
  const [{ r }] = await q("select public.store_summary($1, now() - interval '61 days', now() + interval '1 minute') r", [storeB]);
  return eq(r.auto_cancelled, 50);
});
await ok('Vendas por dia somam o mesmo total do resumo', async () => {
  const rows = await q(`select * from public.store_daily($1, ${range[0]}, ${range[1]})`, [storeB]);
  const [{ r }] = await q(`select public.store_summary($1, ${range[0]}, ${range[1]}) r`, [storeB]);
  return eq(rows.reduce((t, d) => t + Number(d.delivered), 0), r.delivered);
});
await ok('Produtos mais vendidos calculados no servidor', async () => {
  const rows = await q(`select * from public.store_top_products($1, now() - interval '61 days', now() + interval '1 minute', 5)`, [storeB]);
  return eq(rows[0].name, 'X-Salada') && eq(Number(rows[0].quantity) + Number(rows[1].quantity) >= 1200, true);
});
await as(ownerA);
await ok('Dono de outra loja recebe zero no resumo da loja B', async () => {
  const [{ r }] = await q("select public.store_summary($1, now() - interval '61 days', now() + interval '1 minute') r", [storeB]);
  return eq(r.delivered, 0) && eq(Number(r.commission), 0);
});
await ok('Dono de outra loja não vê os produtos da loja B', async () => eq((await q("select * from public.store_top_products($1, now() - interval '61 days', now(), 5)", [storeB])).length, 0));
await as(null);
await fails('Visitante não chama o resumo', () => q("select public.store_summary($1, now() - interval '1 day', now())", [storeB]), 'permission denied');
await as(admin);
await ok('Admin vê o resumo de qualquer loja', async () => {
  const [{ r }] = await q(`select public.store_summary($1, ${range[0]}, ${range[1]}) r`, [storeB]);
  return eq(r.delivered, ref.entregues);
});

// ---------- 15. Farmácia fora do piloto (21/10) ----------
await as(ownerA);
await ok('Farmácia não aparece para quem usa o app', async () => eq((await q("select count(*) c from public.categories where slug = 'farmacia'"))[0].c, 0));
await fails('Cadastro de loja na categoria Farmácia é recusado', () => q("select public.register_store('Drogaria X', $1, $2, 'Dono', '67999990000', '111.444.777-35')", [cat.farmacia, city]), 'Categoria inválida');
await as(admin);
await ok('Admin ainda vê a categoria (inativa) para reativar no futuro', async () => eq((await q("select active from public.categories where slug = 'farmacia'"))[0].active, false));

// ---------- 16. Favoritos na conta (22/10) ----------
await as(custA);
await ok('Cliente salva um favorito', async () => { await q('insert into public.favorites (product_id) values ($1)', [pArroz]); return eq((await q('select count(*) c from public.favorites'))[0].c, 1); });
await fails('Favorito repetido é recusado (sem duplicar)', () => q('insert into public.favorites (product_id) values ($1)', [pArroz]), 'duplicate|unique');
await fails('Cliente não salva favorito em nome de outra pessoa', () => q('insert into public.favorites (user_id, product_id) values ($1, $2)', [custB.id, pArroz]), 'permission denied');
await as(custB);
await ok('Outro cliente não vê os favoritos do primeiro', async () => eq((await q('select count(*) c from public.favorites'))[0].c, 0));
await ok('Outro cliente não consegue apagar favorito alheio', async () => { await q('delete from public.favorites'); await su(); const n = (await q('select count(*) c from public.favorites'))[0].c; await as(custB); return eq(n, 1); });
await as(null);
await fails('Visitante não lê favoritos', () => q('select * from public.favorites'), 'permission denied');
await as(custA);
await ok('Cliente remove o próprio favorito', async () => { await q('delete from public.favorites where product_id = $1', [pArroz]); return eq((await q('select count(*) c from public.favorites'))[0].c, 0); });

// ---------- 17. Bairros e taxa por bairro (22/10) ----------
await as(admin);
let novos;
await ok('Admin cadastra vários bairros de uma vez (repetidos ignorados)', async () => {
  novos = (await q("select public.admin_add_neighborhoods($1, array['Jardim Pindorama', '  jardim   pindorama ', 'Vila Nova', 'Centro', 'x']) n", [city]))[0].n;
  return eq(novos, 2);
});
const nb = Object.fromEntries((await q('select name, id from public.neighborhoods where city_id = $1', [city])).map((r) => [r.name, r.id]));
await as(ownerB);
await fails('Dono de loja não cadastra bairro', () => q("select public.admin_add_neighborhoods($1, array['Bairro Falso'])", [city]), 'administrador|permission denied');
await fails('Dono de outra loja não mexe nas taxas da loja A', () => q('select public.store_set_delivery_zones($1, $2::jsonb)', [storeA, JSON.stringify([{ neighborhood_id: nb['Vila Nova'], fee: 1 }])]), 'permissão');
await as(ownerA);
await fails('Taxa acima de R$ 100 é recusada', () => q('select public.store_set_delivery_zones($1, $2::jsonb)', [storeA, JSON.stringify([{ neighborhood_id: nb['Vila Nova'], fee: 150 }])]), 'entre R');
await fails('Bairro inexistente é recusado', () => q('select public.store_set_delivery_zones($1, $2::jsonb)', [storeA, JSON.stringify([{ neighborhood_id: '00000000-0000-0000-0000-000000000099', fee: 3 }])]), 'Bairro inválido');
await ok('Loja grava as taxas de vários bairros de uma vez', async () => {
  const n = (await q('select public.store_set_delivery_zones($1, $2::jsonb) n', [storeA, JSON.stringify([{ neighborhood_id: nb['Vila Nova'], fee: 4.5 }, { neighborhood_id: nb['Jardim Pindorama'], fee: 7 }])]))[0].n;
  return eq(n, 2);
});
await as(custA);
const [{ id: addrVN }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua Vila Nova, 1', $2, $3) returning id", [custA.id, city, nb['Vila Nova']]);
const [{ id: addrCt }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua Centro, 2', $2, $3) returning id", [custA.id, city, nb['Centro']]);
await ok('Pedido no bairro atendido usa a taxa daquele bairro', async () => {
  const id = (await createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-bairro-0001', { address: addrVN }))[0].id;
  return eq((await q('select delivery_fee from public.orders where id = $1', [id]))[0].delivery_fee, '4.50');
});
await fails('Pedido em bairro que a loja não atende é recusado', () => createOrder([{ product_id: pArroz, quantity: 1 }], 'chave-bairro-0002', { address: addrCt }), 'não entrega neste bairro');
await as(ownerA);
await ok('Lista vazia volta para a taxa única', async () => { await q("select public.store_set_delivery_zones($1, '[]'::jsonb)", [storeA]); return eq((await q('select count(*) c from public.delivery_zones where store_id = $1', [storeA]))[0].c, 0); });
await as(admin);
await ok('Admin desativa um bairro (some para quem usa o app)', async () => {
  await q('select public.admin_set_neighborhood_active($1, false)', [nb['Vila Nova']]);
  await as(custA); const n = (await q("select count(*) c from public.neighborhoods where name = 'Vila Nova'"))[0].c; await as(admin);
  return eq(n, 0);
});

// ---------- 18. Atendentes da loja (22/10) ----------
await as(ownerA);
await ok('Dono vê a equipe da loja (dono + atendente)', async () => eq((await q('select role from public.store_list_members($1)', [storeA])).map((r) => r.role).join(','), 'owner,staff'));
await ok('Dono convida atendente pelo e-mail (maiúsculas não importam)', async () => {
  const id = (await q("select public.store_add_staff($1, ' ClienteB@Teste.Local ') id", [storeA]))[0].id;
  return eq(id, custB.id);
});
await fails('Convite repetido é recusado', () => q("select public.store_add_staff($1, 'clienteB@teste.local')", [storeA]), 'já faz parte');
await fails('E-mail sem conta é recusado com orientação', () => q("select public.store_add_staff($1, 'ninguem@teste.local')", [storeA]), 'criar a conta');
await as(staffA);
await fails('Atendente não convida ninguém', () => q("select public.store_add_staff($1, 'clienteC@teste.local')", [storeA]), 'Só o dono');
await fails('Atendente não vê a lista da equipe', () => q('select * from public.store_list_members($1)', [storeA]), 'Só o dono');
await ok('Atendente pode pausar e reabrir a loja', async () => {
  await q('update public.stores set is_paused = true where id = $1', [storeA]);
  await q('update public.stores set is_paused = false where id = $1', [storeA]);
  return true;
});
await fails('Atendente não muda a taxa de entrega da loja', () => q('update public.stores set delivery_fee_default = delivery_fee_default + 1 where id = $1', [storeA]), 'Só o dono');
await fails('Atendente não muda as taxas por bairro', () => q("select public.store_set_delivery_zones($1, '[]'::jsonb)", [storeA]), 'Só o dono');
await ok('Atendente ainda pausa um produto do cardápio', async () => { await q('update public.products set available = false where id = $1', [pB1]); await q('update public.products set available = true where id = $1', [pB1]); return true; });
await as(custB);
await ok('Novo atendente passa a ver a loja no painel', async () => eq((await q('select count(*) c from public.store_members where user_id = $1 and store_id = $2', [custB.id, storeA]))[0].c, 1));
await ok('Atendente pode sair da equipe por conta própria', async () => { await q('select public.store_remove_staff($1, $2)', [storeA, custB.id]); return true; });
await as(ownerA);
await fails('O dono não pode ser removido da equipe', () => q('select public.store_remove_staff($1, $2)', [storeA, ownerA.id]), 'dono não pode');
await ok('Dono continua mudando os dados da loja', async () => { await q('update public.stores set min_order = 0 where id = $1', [storeA]); return true; });

// ---------- 19. Correções do servidor (23/10) ----------
await as(custA);
await fails('Pedido com lista de itens nula é recusado', () => q("select public.create_order($1, null, 'pickup', 'pix', 'chave-corr-0001', 'Cliente A', '67988887777')", [storeA]), 'entre 1 e 50');
await fails('Item que não é objeto é recusado', () => createOrder(['x'], 'chave-corr-0002', { fulfillment: 'pickup' }), 'Item inválido');
await ok('O pedido vazio não foi gravado', async () => { await su(); return eq((await q("select count(*) c from public.orders where idempotency_key in ('chave-corr-0001', 'chave-corr-0002')"))[0].c, 0); });
await as(ownerA);
const pZero = (await q("insert into public.products (store_id, name, price) values ($1, 'Brinde', 0) returning id", [storeA]))[0].id;
await as(custA);
await fails('Pedido de R$ 0,00 é recusado', () => createOrder([{ product_id: pZero, quantity: 2 }], 'chave-corr-0003', { fulfillment: 'pickup' }), 'maior que zero');
await ok('Brinde de R$ 0 junto com item pago é aceito', async () => {
  const id = (await createOrder([{ product_id: pZero, quantity: 1 }, { product_id: pB1, quantity: 1 }], 'chave-corr-0004', { fulfillment: 'pickup' }))[0].id;
  return eq((await q('select subtotal from public.orders where id = $1', [id]))[0].subtotal, '10.00');
});
const orderExp = (expected, key) => q(
  "select public.create_order($1, $2::jsonb, 'pickup', 'pix', $3, 'Cliente A', '67988887777', null, null, null, $4) id",
  [storeA, JSON.stringify([{ product_id: pB1, quantity: 2 }]), key, expected]);
await ok('Total visto pelo cliente igual ao do servidor: pedido criado', async () => !!(await orderExp(20, 'chave-corr-0005'))[0].id);
await ok('Preço mudou desde o carrinho: pedido não é criado e o servidor devolve o preço novo', async () => {
  let err;
  try { await orderExp(18, 'chave-corr-0006'); } catch (e) { err = e; }
  if (!err) throw new Error('deveria ter recusado');
  eq(err.code, 'VMPRC');
  const d = JSON.parse(err.detail);
  eq(Number(d.total), 20); eq(Number(d.items[0].unit), 10);
  await su();
  eq((await q("select count(*) c from public.orders where idempotency_key = 'chave-corr-0006'"))[0].c, 0);
  return eq((await q('select stock from public.products where id = $1', [pB1]))[0].stock !== null, true);
});
await ok('Pedido recusado por preço não baixa estoque', async () => {
  await su(); const before = (await q('select stock from public.products where id = $1', [pB1]))[0].stock;
  await as(custA); try { await orderExp(1, 'chave-corr-0007'); } catch { /* esperado */ }
  await su(); return eq((await q('select stock from public.products where id = $1', [pB1]))[0].stock, before);
});
await as(custA);
const oPixSnap = (await createOrder([{ product_id: pB1, quantity: 1 }], 'chave-corr-0008', { fulfillment: 'pickup' }))[0].id;
await as(ownerA);
await q("update public.store_private set pix_key = 'chave-trocada@outra.test' where store_id = $1", [storeA]);
await as(custA);
await ok('Pix: trocar a chave depois não muda a chave do pedido já feito', async () => eq((await q('select public.order_payment_info($1) i', [oPixSnap]))[0].i.pix_key, 'pix@mercadoteste.com'));
await ok('Pix: pedido novo usa a chave nova', async () => {
  const id = (await createOrder([{ product_id: pB1, quantity: 1 }], 'chave-corr-0009', { fulfillment: 'pickup' }))[0].id;
  return eq((await q('select public.order_payment_info($1) i', [id]))[0].i.pix_key, 'chave-trocada@outra.test');
});
await as(ownerA); await q("update public.store_private set pix_key = 'pix@mercadoteste.com' where store_id = $1", [storeA]);
await as(custA);
await fails('Chave de pedido repetida em outra loja é recusada', () => createOrder([{ product_id: pB1, quantity: 1 }], 'chave-corr-0008', { store: storeB, fulfillment: 'pickup' }), 'outra loja');
await fails('Maioridade: data de menor de 18 é recusada', () => q("select public.confirm_age((current_date - interval '17 years')::date)"), '18 anos');
await fails('Maioridade: data no futuro é recusada', () => q("select public.confirm_age((current_date + 1)::date)"), 'válida');
await fails('Maioridade: confirmar sem data não existe mais', () => q('select public.confirm_age()'), 'does not exist|não existe');
await ok('Maioridade: guarda quando foi confirmada, não a data de nascimento', async () => {
  const cols = (await q("select column_name from information_schema.columns where table_name = 'profiles'")).map((r) => r.column_name);
  return !cols.some((c) => /birth|nasc/.test(c)) && cols.includes('age_confirmed_at');
});
const oAge = (await createOrder([{ product_id: pCerveja, quantity: 2 }], 'chave-corr-0010', { fulfillment: 'pickup' }))[0].id;
const ageCode = (await q('select delivery_code from public.order_secrets where order_id = $1', [oAge]))[0].delivery_code;
await as(ownerA);
await q("select public.advance_order_status($1, 'ACCEPTED')", [oAge]);
await q("select public.advance_order_status($1, 'READY')", [oAge]);
await fails('Entrega +18 sem conferir documento é recusada', () => q('select public.confirm_delivery($1, $2)', [oAge, ageCode]), 'documento');
await ok('Recusa por documento não gasta tentativa do código', async () => { await su(); return eq((await q('select attempts from public.order_secrets where order_id = $1', [oAge]))[0].attempts, 0); });
await as(ownerA);
await ok('Entrega +18 com documento conferido conclui e fica registrada', async () => {
  const [{ r }] = await q('select public.confirm_delivery($1, $2, true) r', [oAge, ageCode]);
  eq(r.ok, true);
  return eq((await q("select note from public.order_events where order_id = $1 and status = 'DELIVERED'", [oAge]))[0].note, 'Documento conferido (+18)');
});
await as(admin);
await fails('Faturas: período que cruza uma fatura existente é recusado', () => q("select public.admin_generate_invoices((now() at time zone 'America/Campo_Grande')::date, (now() at time zone 'America/Campo_Grande')::date)"), 'cobre parte');
await ok('Faturas: gerar de novo o mesmo período continua permitido', async () => { await q("select public.admin_generate_invoices('2000-01-01', (now() + interval '1 day')::date)"); return true; });
await fails('Faturas: fatura paga não pode ser anulada', async () => {
  const [{ id }] = await q("select id from public.invoices where store_id = $1 and status = 'paid'", [storeA]);
  return q("select public.admin_set_invoice_status($1, 'void')", [id]);
}, 'paga não pode');
await su();
const invX = (await q("insert into public.invoices (store_id, period_start, period_end, orders_count, gross_amount, commission_total) values ($1, '1999-01-01', '1999-01-31', 0, 0, 0) returning id", [storeB]))[0].id;
await as(admin);
await ok('Faturas: aberta pode ser anulada e reaberta', async () => {
  await q("select public.admin_set_invoice_status($1, 'void')", [invX]);
  await q("select public.admin_set_invoice_status($1, 'open')", [invX]);
  return eq((await q('select status from public.invoices where id = $1', [invX]))[0].status, 'open');
});
await fails('Faturas: anulada não vira paga direto', async () => {
  await q("select public.admin_set_invoice_status($1, 'void')", [invX]);
  return q("select public.admin_set_invoice_status($1, 'paid')", [invX]);
}, 'anulada não pode');

// ---------- Relatório ----------
const passed = results.filter(r => r.pass).length;
for (const r of results) console.log(`${r.pass ? 'PASSOU' : 'FALHOU'}  ${r.name}${r.pass ? '' : '  →  ' + r.detail}`);
console.log(`\n${passed}/${results.length} testes passaram`);
process.exit(passed === results.length ? 0 : 1);
