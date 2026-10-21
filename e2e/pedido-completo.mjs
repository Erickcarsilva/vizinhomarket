// Teste ponta a ponta pelas telas: lojista cadastra loja → admin aprova → lojista cadastra produto
// → cliente faz pedido → lojista aceita, prepara, envia e confirma com o código → cliente avalia.
// Também tenta fraudes direto na API com o login do cliente.
// Uso: node pedido-completo.mjs <pasta para prints>
import { chromium } from 'playwright';
import pg from 'pg';

const CLI = 'http://localhost:4173';   // app do cliente
const PAR = 'http://localhost:4174';   // painel do comerciante
const ADM = 'http://localhost:4175';   // painel admin
const APP = CLI;
const API = 'http://localhost:54321';
const shots = process.argv[2] || '.';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const db = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'vm' });
await db.connect();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
const errors = [];
const pages = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Campo_Grande' });
  const page = await ctx.newPage();
  pages.push([name, page]);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|WebSocket|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|fonts\.g/i.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
  return page;
}
async function register(page, email, base = CLI) {
  await page.goto(`${base}/register`);
  await page.fill('input[type=email]', email);
  for (const p of await page.locator('input[type=password]').all()) await p.fill('SenhaForte123!');
  const terms = page.getByRole('checkbox').first();
  if (await terms.count()) await terms.click();
  await page.click('button[type=submit]');
  await page.waitForTimeout(800);
  const otp = page.locator('input[autocomplete="one-time-code"], [data-input-otp] input, input[inputmode="numeric"]').first();
  if (await otp.count()) {
    await otp.click(); await page.keyboard.type('123456');
    const verify = page.getByRole('button', { name: /verificar|confirmar|continuar/i }).first();
    if (await verify.count()) await verify.click();
  }
  await page.waitForTimeout(1200);
}
async function signIn(page, base, email) {
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'SenhaForte123!');
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
}
const shot = (page, n) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: true });

try {
  // ---------- Lojista cria conta e cadastra loja
  const dono = await person('lojista');
  await register(dono, 'dona@restaurante.test', PAR);
  await dono.goto(`${PAR}/cadastrar-loja`);
  await dono.waitForSelector('input[placeholder="Nome da loja"]', { timeout: 10000 });
  await dono.fill('input[placeholder="Nome da loja"]', 'Marmitaria da Ana');
  await dono.fill('input[placeholder="Responsável (nome completo)"]', 'Ana Souza');
  await dono.fill('input[placeholder="CNPJ ou CPF"]', '11.444.777/0001-61');
  await dono.fill('input[placeholder="Telefone / WhatsApp"]', '67999998888');
  await dono.fill('input[placeholder="Endereço"]', 'Rua Dom Pedro II, 100');
  await dono.fill('input[placeholder="Horário (ex: Seg–Sáb, 8h–18h)"]', 'Todos os dias 0h-23h59');
  await dono.fill('input[placeholder="Taxa de entrega (R$)"]', '5');
  await dono.getByRole('button', { name: 'Enviar cadastro' }).click();
  await dono.waitForTimeout(2000);
  await shot(dono, '01-loja-cadastrada');
  const st = (await db.query("select s.id, s.status, sp.document, (select count(*) from store_hours h where h.store_id = s.id) horas from stores s join store_private sp on sp.store_id = s.id where s.name = 'Marmitaria da Ana'")).rows[0];
  check('Loja cadastrada pela tela fica pendente', st?.status === 'pending', JSON.stringify(st));
  check('Horário digitado virou 7 dias estruturados', Number(st?.horas) === 7);
  check('CPF/CNPJ gravado só em dados privados', st?.document === '11444777000161');

  // ---------- Admin aprova
  const admin = await person('admin');
  await register(admin, 'erick@vizinhomarket.test');
  await db.query("insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = 'erick@vizinhomarket.test'");
  await signIn(admin, ADM, 'erick@vizinhomarket.test');
  await admin.goto(`${ADM}/lojas`);
  await admin.waitForTimeout(1500);
  await admin.getByRole('button', { name: 'Aprovar' }).first().click();
  await admin.waitForTimeout(1500);
  await shot(admin, '02-admin-aprovou');
  check('Admin aprova a loja pela tela', (await db.query("select status from stores where name = 'Marmitaria da Ana'")).rows[0].status === 'approved');

  // ---------- Lojista cadastra produto
  await dono.goto(`${PAR}/cardapio`);
  await dono.waitForTimeout(1500);
  await dono.getByRole('button', { name: /Novo produto/ }).click();
  await dono.fill('input[placeholder="Nome"]', 'Marmita grande');
  await dono.fill('input[placeholder="Preço (R$)"]', '22.50');
  await dono.fill('input[placeholder="Seção (ex: Lanches)"]', 'Marmitas');
  await dono.locator('form button').last().click();
  await dono.waitForTimeout(1500);
  await shot(dono, '03-produto-cadastrado');
  check('Produto cadastrado pela tela', (await db.query("select price from products where name = 'Marmita grande'")).rows[0]?.price === '22.50');

  // ---------- Cliente compra
  const cli = await person('cliente');
  await register(cli, 'joao@cliente.test');
  await cli.goto(APP);
  await cli.waitForTimeout(2000);
  await shot(cli, '04-home-cliente');
  check('Loja aprovada aparece na vitrine', await cli.getByText('Marmitaria da Ana').first().isVisible());
  await cli.getByText('Marmitaria da Ana').first().click();
  await cli.waitForTimeout(1500);
  await cli.getByRole('button', { name: 'Adicionar' }).first().click();
  await cli.getByRole('button', { name: 'Adicionar' }).first().click();
  await shot(cli, '05-loja-carrinho');
  await cli.goto(`${APP}/carrinho`);
  await cli.waitForTimeout(800);
  await cli.fill('input[placeholder="Nome"]', 'João Cliente');
  await cli.fill('input[placeholder="WhatsApp / telefone"]', '67988887777');
  const addr = cli.locator('input[placeholder="Endereço completo (rua, número, bairro)"]');
  if (await addr.count()) await addr.fill('Rua das Flores, 50, Centro');
  // tenta adulterar o preço no carrinho salvo no navegador antes de enviar
  await cli.evaluate(() => { const c = JSON.parse(localStorage.getItem('perto_cart')); c.items[0].price = 0.01; localStorage.setItem('perto_cart', JSON.stringify(c)); });
  await shot(cli, '06-checkout');
  await cli.getByRole('button', { name: /Fazer pedido/ }).click();
  await cli.waitForURL(/\/pedido\//, { timeout: 10000 });
  await cli.waitForTimeout(1500);
  await shot(cli, '07-pedido-criado');
  const ord = (await db.query("select o.id, o.code, o.subtotal, o.delivery_fee, o.total, o.commission_amount, s.delivery_code from orders o join order_secrets s on s.order_id = o.id order by created_at desc limit 1")).rows[0];
  check('Preço adulterado no navegador é ignorado (2 × R$ 22,50)', ord.subtotal === '45.00', JSON.stringify(ord));
  check('Taxa de entrega vem da loja (R$ 5)', ord.delivery_fee === '5.00');
  check('Comissão calculada no servidor (8% padrão = R$ 3,60)', ord.commission_amount === '3.60');
  check('Cliente vê o código de entrega na tela', await cli.getByText(ord.delivery_code, { exact: true }).isVisible());

  // ---------- Fraudes direto na API com o login do cliente
  const login = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'joao@cliente.test', password: 'SenhaForte123!' }) })).json();
  const anonKey = (await (await fetch(`${API}/anon-key`)).json()).anonKey;
  const H = { apikey: anonKey, authorization: `Bearer ${login.access_token}`, 'content-type': 'application/json', prefer: 'return=representation' };
  const r1 = await fetch(`${API}/rest/v1/orders?id=eq.${ord.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ total: 0.01, status: 'DELIVERED' }) });
  check('Cliente não altera total nem status pela API', r1.status >= 400 && (await db.query('select total, status from orders where id = $1', [ord.id])).rows[0].total === '50.00', `HTTP ${r1.status}`);
  const r2 = await fetch(`${API}/rest/v1/rpc/confirm_delivery`, { method: 'POST', headers: H, body: JSON.stringify({ p_order_id: ord.id, p_code: ord.delivery_code }) });
  check('Cliente não confirma a própria entrega', r2.status >= 400, `HTTP ${r2.status}`);
  const r3 = await fetch(`${API}/rest/v1/store_private?select=document`, { headers: H });
  check('Cliente não lê CPF/CNPJ da loja', (await r3.json()).length === 0);

  // ---------- Lojista atende o pedido
  await dono.goto(`${PAR}/`);
  await dono.waitForTimeout(2000);
  await shot(dono, '08-lojista-pedido-novo');
  for (const label of ['Aceitar pedido', 'Iniciar preparo', 'Marcar como pronto', 'Saiu para entrega']) {
    await dono.getByRole('button', { name: label }).first().click();
    await dono.waitForTimeout(1200);
    await dono.reload(); await dono.waitForTimeout(1500);
  }
  check('Lojista avança até "a caminho"', (await db.query('select status from orders where id = $1', [ord.id])).rows[0].status === 'IN_TRANSIT');
  await dono.getByRole('button', { name: 'Confirmar entrega' }).first().click();
  const wrong = ord.delivery_code === '0000' ? '1111' : '0000';
  await dono.fill('input[placeholder="Código do cliente (4 números)"]', wrong);
  await dono.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await dono.waitForTimeout(1200);
  await shot(dono, '09-codigo-errado');
  check('Código errado é recusado com mensagem', await dono.getByText(/Código incorreto/).isVisible());
  await dono.fill('input[placeholder="Código do cliente (4 números)"]', ord.delivery_code);
  await dono.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await dono.waitForTimeout(1500);
  check('Código certo conclui a entrega', (await db.query('select status from orders where id = $1', [ord.id])).rows[0].status === 'DELIVERED');
  await dono.goto(`${PAR}/financeiro`);
  await dono.waitForTimeout(1500);
  await shot(dono, '10-comissoes');
  check('Tela de comissões mostra o pedido', await dono.getByText(ord.code).isVisible());

  // ---------- Cliente avalia
  await cli.reload(); await cli.waitForTimeout(1500);
  const stars = cli.locator('button:has(svg)').filter({ hasNot: cli.locator('text=Enviar') });
  await cli.locator('textarea[placeholder="Conte como foi (opcional)"]').fill('Chegou quentinha!');
  await cli.locator('div:has(> textarea) button, button').filter({ has: cli.locator('svg.lucide-star') }).nth(4).click();
  await cli.getByRole('button', { name: /Enviar|Avaliar/ }).last().click();
  await cli.waitForTimeout(1500);
  await shot(cli, '11-avaliacao');
  const rev = (await db.query('select store_rating, comment from reviews where order_id = $1', [ord.id])).rows[0];
  check('Cliente avalia o pedido entregue', rev?.store_rating === 5, JSON.stringify(rev));
} catch (e) {
  check('Roteiro completo sem travar', false, e.message.split('\n').slice(0,3).join(' / '));
  for (const [n, pg_] of pages) { await pg_.screenshot({ path: `${shots}/falha-${n}.png`, fullPage: true }).catch(() => {}); console.log('url', n, pg_.url()); }
}

check('Nenhum erro de JavaScript nas telas', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); await db.end();
const ok = results.filter((r) => r.pass).length;
console.log(`\n${ok}/${results.length} verificações passaram`);
process.exit(ok === results.length ? 0 : 1);
