// Teste ponta a ponta do painel administrativo, pelas telas:
// aprovar loja, comissão negociada, pedidos (filtro e cancelamento), faturas, usuários (bloqueio e admin),
// entregadores, configurações, histórico e bloqueio de acesso para quem não é admin.
// Uso: node admin.mjs <pasta para prints>   (rodar depois de reset.sh)
import { chromium } from 'playwright';
import pg from 'pg';
import { CLI, PAR, ADM, API, PG, launchOptions } from './config.mjs';

const APP = CLI;
const shots = process.argv[2] || '.';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const db = new pg.Client(PG);
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
// Executa uma função do banco como se fosse o usuário (igual ao app faria)
async function asUser(userId, sql, params = []) {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r.rows[0];
  } catch (e) { await db.query('rollback'); throw e; }
}

const browser = await chromium.launch(launchOptions);
const errors = [];
const pages = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Campo_Grande' });
  const page = await ctx.newPage();
  pages.push([name, page]);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|WebSocket|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|fonts\.g|status of 400/i.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
  page.on('dialog', (d) => d.accept());
  return page;
}
async function register(page, email, base = CLI) {
  await page.goto(`${base}/register`);
  await page.fill('input[type=email]', email);
  for (const p of await page.locator('input[type=password]').all()) await p.fill('SenhaForte123!');
  await page.getByRole('checkbox').first().click();
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
}
const uid = async (email) => (await one('select id from auth.users where email = $1', [email])).id;
async function signIn(page, base, email) {
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'SenhaForte123!');
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
}
const shot = (page, n) => page.screenshot({ path: `${shots}/adm-${n}.png`, fullPage: true });
const row = (page, text) => page.locator('div.p-4', { hasText: text }).first();

try {
  // ---------- Preparação
  const dono = await person('lojista');
  await register(dono, 'dono@lanches.test');
  const donoId = await uid('dono@lanches.test');
  const [{ id: cat }] = (await db.query("select id from categories where slug = 'alimentacao'")).rows;
  const [{ id: city }] = (await db.query("select id from cities where slug = 'sidrolandia-ms'")).rows;
  const { id: storeId } = await asUser(donoId, "select public.register_store('Lanches do Zé', $1, $2, 'Zé Dono', '67999991111', '12.345.678/0001-90', null, null, '67999991111', 'Rua A, 1', null) id", [cat, city]);
  for (let d = 0; d < 7; d++) await db.query("insert into store_hours (store_id, weekday, opens, closes) values ($1, $2, '00:00', '23:59')", [storeId, d]);
  await db.query("update store_private set pix_key = 'pix@lanches.test' where store_id = $1", [storeId]);

  const adm = await person('admin');
  await register(adm, 'erick@vizinho.test');
  await db.query("insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = 'erick@vizinho.test'");
  await signIn(adm, ADM, 'erick@vizinho.test');

  const cli = await person('cliente');
  await register(cli, 'ana@cliente.test');
  const cliId = await uid('ana@cliente.test');

  // ---------- Quem não é admin não entra
  await signIn(cli, ADM, 'ana@cliente.test');
  check('Cliente não consegue abrir o painel admin', await cli.getByText('Acesso restrito').isVisible() && !(await cli.getByText('Visão geral').first().isVisible()));

  // ---------- Lojas: aprovar e comissão
  await adm.goto(`${ADM}/`);
  await adm.waitForTimeout(2000);
  check('Visão geral avisa que há loja aguardando aprovação', await adm.getByText('loja(s) aguardando aprovação').isVisible());
  await shot(adm, '01-visao');
  await adm.getByText('loja(s) aguardando aprovação').click();
  await adm.waitForTimeout(1500);
  check('Aviso leva para a seção Lojas', adm.url().endsWith('/lojas'));
  await row(adm, 'Lanches do Zé').getByRole('button', { name: 'Aprovar' }).click();
  await adm.waitForTimeout(1500);
  check('Admin aprova a loja pelo painel', (await one('select status from stores where id = $1', [storeId])).status === 'approved');
  await row(adm, 'Lanches do Zé').getByRole('button', { name: /Lanches do Zé/ }).click();
  await adm.waitForTimeout(500);
  check('Admin vê responsável, CPF/CNPJ e Pix da loja', await adm.getByText('pix@lanches.test').isVisible() && await adm.getByText('12345678000190').isVisible());
  await adm.locator('input[placeholder^="padrão"]').fill('6');
  await adm.getByRole('button', { name: 'Salvar comissão' }).click();
  await adm.waitForTimeout(1500);
  check('Admin define comissão negociada de 6%', (await one('select commission_rate from stores where id = $1', [storeId])).commission_rate === '0.0600');
  await shot(adm, '02-lojas');

  // ---------- Pedidos: dados de teste
  const { id: prod } = await one("insert into products (store_id, name, price, section) values ($1, 'X-Burguer', 20, 'Lanches') returning id", [storeId]);
  const { id: addr } = await one("insert into addresses (user_id, line, city_id) values ($1, 'Rua B, 2', $2) returning id", [cliId, city]);
  const mk = async (key) => (await asUser(cliId, "select public.create_order($1, $2::jsonb, 'store_delivery', 'pix', $3, 'Ana Cliente', '67988880000', $4, null, null) id", [storeId, JSON.stringify([{ product_id: prod, quantity: 2 }]), key, addr])).id;
  const o1 = await mk('adm-0001'), o2 = await mk('adm-0002');
  await db.query("update orders set status = 'DELIVERED', accepted_at = created_at + interval '2 minutes', delivered_at = now() where id = $1", [o1]);
  const c1 = await one('select code, commission_amount from orders where id = $1', [o1]);
  const c2 = await one('select code from orders where id = $1', [o2]);
  check('Pedido usa a comissão negociada (6% de R$ 40 = R$ 2,40)', c1.commission_amount === '2.40', JSON.stringify(c1));

  await adm.goto(`${ADM}/pedidos`);
  await adm.waitForTimeout(1500);
  check('Aba Pedidos mostra o pedido em andamento', await adm.getByText(c2.code, { exact: false }).first().isVisible());
  await adm.getByRole('button', { name: 'Entregues' }).click();
  await adm.waitForTimeout(1200);
  check('Filtro "Entregues" mostra o pedido entregue', await adm.getByText(c1.code, { exact: false }).first().isVisible());
  await adm.getByRole('button', { name: 'Em andamento' }).click();
  await adm.waitForTimeout(1200);
  await adm.getByText(c2.code, { exact: false }).first().click();
  await adm.fill('input[placeholder="Motivo do cancelamento"]', 'Cliente pediu por telefone');
  await adm.getByRole('button', { name: 'Cancelar pedido' }).click();
  await adm.waitForTimeout(1500);
  const can = await one('select status, cancel_reason from orders where id = $1', [o2]);
  check('Admin cancela pedido com motivo', can.status === 'CANCELLED' && can.cancel_reason === 'Cliente pediu por telefone', JSON.stringify(can));
  await shot(adm, '03-pedidos');

  // ---------- Comissões e faturas
  await adm.goto(`${ADM}/comissoes`);
  await adm.waitForTimeout(1200);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await adm.fill('input[type=month]', ym);
  await adm.getByRole('button', { name: /Gerar \/ atualizar/ }).click();
  await adm.waitForTimeout(1800);
  const inv = await one('select id, orders_count, commission_total, status from invoices where store_id = $1', [storeId]);
  check('Fatura do mês gerada com o pedido entregue (R$ 2,40)', inv?.orders_count === 1 && inv?.commission_total === '2.40', JSON.stringify(inv));
  check('Fatura aparece na tela com botão de cobrança pelo WhatsApp', await adm.getByText('Enviar cobrança').isVisible());
  await shot(adm, '04-faturas');
  await adm.getByRole('button', { name: 'Marcar como paga' }).click();
  await adm.waitForTimeout(1500);
  check('Admin marca a fatura como paga', (await one('select status from invoices where id = $1', [inv.id])).status === 'paid');

  // ---------- Usuários
  await adm.goto(`${ADM}/usuarios`);
  await adm.waitForTimeout(1500);
  await adm.fill('input[placeholder="Buscar por e-mail, nome ou telefone"]', 'ana@');
  await adm.getByRole('button', { name: 'Buscar' }).click();
  await adm.waitForTimeout(1200);
  await row(adm, 'ana@cliente.test').getByRole('button', { name: 'Bloquear' }).click();
  await adm.waitForTimeout(1500);
  check('Admin bloqueia usuário', (await one("select banned_until > now() b from auth.users where email = 'ana@cliente.test'")).b === true);
  const login = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ana@cliente.test', password: 'SenhaForte123!' }) });
  check('Usuário bloqueado não consegue entrar', login.status >= 400, `HTTP ${login.status}`);
  await row(adm, 'ana@cliente.test').getByRole('button', { name: 'Desbloquear' }).click();
  await adm.waitForTimeout(1500);
  check('Admin desbloqueia usuário', (await one("select coalesce(banned_until > now(), false) b from auth.users where email = 'ana@cliente.test'")).b === false);
  await adm.fill('input[placeholder="Buscar por e-mail, nome ou telefone"]', 'dono@');
  await adm.getByRole('button', { name: 'Buscar' }).click();
  await adm.waitForTimeout(1200);
  check('Lista mostra que a pessoa é lojista', await row(adm, 'dono@lanches.test').getByText('Lojista').isVisible());
  await row(adm, 'dono@lanches.test').getByRole('button', { name: 'Tornar admin' }).click();
  await adm.waitForTimeout(1500);
  check('Admin dá acesso de admin', Number((await one("select count(*) c from user_roles where user_id = $1 and role = 'admin'", [donoId])).c) === 1);
  await row(adm, 'dono@lanches.test').getByRole('button', { name: 'Remover admin' }).click();
  await adm.waitForTimeout(1500);
  check('Admin remove acesso de admin', Number((await one("select count(*) c from user_roles where user_id = $1 and role = 'admin'", [donoId])).c) === 0);
  await shot(adm, '05-usuarios');

  // ---------- Entregadores
  await db.query("insert into couriers (user_id, city_id, vehicle, plate, document) values ($1, $2, 'moto', 'ABC1D23', '12345678909')", [cliId, city]);
  await adm.goto(`${ADM}/entregadores`);
  await adm.waitForTimeout(1500);
  check('Entregador pendente aparece com placa', await adm.getByText('placa ABC1D23', { exact: false }).isVisible());
  await adm.getByRole('button', { name: 'Aprovar' }).click();
  await adm.waitForTimeout(1500);
  check('Admin aprova o entregador', (await one('select status from couriers where user_id = $1', [cliId])).status === 'approved');

  // ---------- Configurações
  await adm.goto(`${ADM}/config`);
  await adm.waitForTimeout(1500);
  const geral = adm.locator('div', { has: adm.getByRole('heading', { name: 'Geral' }) }).last();
  const inputs = geral.locator('input');
  await inputs.nth(0).fill('9');
  await inputs.nth(1).fill('20');
  await inputs.nth(2).fill('pix@vizinhomarket.test');
  await geral.getByRole('button', { name: 'Salvar' }).click();
  await adm.waitForTimeout(1500);
  const set = Object.fromEntries((await db.query('select key, value from platform_settings')).rows.map((r) => [r.key, r.value]));
  check('Admin muda comissão padrão, tempo limite e Pix', Number(set.default_commission_rate) === 0.09 && Number(set.order_accept_timeout_min) === 20 && set.platform_pix_key === 'pix@vizinhomarket.test', JSON.stringify(set));
  await adm.locator('div.py-2', { hasText: 'Restaurantes e lanches' }).locator('input').fill('7,5');
  await adm.locator('div.py-2', { hasText: 'Restaurantes e lanches' }).getByRole('button', { name: 'Salvar' }).click();
  await adm.waitForTimeout(1500);
  check('Admin define comissão da categoria Restaurantes (7,5%)', (await one('select rate from commission_rules where category_id = $1', [cat]))?.rate === '0.0750');
  check('Valor errado é recusado com mensagem', await (async () => { await inputs.nth(1).fill('2'); await geral.getByRole('button', { name: 'Salvar' }).click(); await adm.waitForTimeout(800); return adm.getByText('Tempo limite deve ficar entre 5 e 120').isVisible(); })());
  await shot(adm, '06-config');

  // ---------- Histórico
  await adm.goto(`${ADM}/registros`);
  await adm.waitForTimeout(1500);
  check('Histórico registra as ações do admin', await adm.getByText('Bloqueou usuário').first().isVisible() && await adm.getByText('Mudou situação da fatura').first().isVisible());
  await adm.goto(`${ADM}/`);
  await adm.waitForTimeout(2000);
  await adm.getByRole('button', { name: 'Abrir menu' }).click();
  await adm.waitForTimeout(600);
  check('Versão aparece no menu do painel', await adm.getByText(/Versão 21\/10\/2026/).last().isVisible());
  await adm.keyboard.press('Escape');
  check('Painel admin não oferece cadastro aberto', await (async () => { const p = await person('visitante'); await p.goto(`${ADM}/login`); await p.waitForTimeout(800); return !(await p.getByText('Criar conta').isVisible()); })());
} catch (e) {
  check('Roteiro completo sem travar', false, e.message.split('\n').slice(0, 3).join(' / '));
  for (const [n, p] of pages) { await p.screenshot({ path: `${shots}/adm-falha-${n}.png`, fullPage: true }).catch(() => {}); console.log('url', n, p.url()); }
}

check('Nenhum erro de JavaScript nas telas', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); await db.end();
const ok = results.filter((r) => r.pass).length;
console.log(`\n${ok}/${results.length} verificações passaram`);
process.exit(ok === results.length ? 0 : 1);
