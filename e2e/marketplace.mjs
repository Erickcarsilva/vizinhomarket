// Ponta a ponta pelas telas dos módulos do marketplace:
//   cupom + pagamento online (gateway de SIMULAÇÃO) → loja só vê depois do "banco" confirmar → preparo
//   → entregador da plataforma (cadastro, online, aceite, retirada, código) → ganhos → razão financeiro;
//   orçamento de serviço (cliente pede, prestador propõe, cliente aceita);
//   telas novas do admin; celular sem rolagem lateral; acessibilidade (axe) sem violações graves.
// Uso: node marketplace.mjs <pasta para prints>
import { chromium } from 'playwright';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CLI, PAR, ADM, ENT, API, PG, launchOptions } from './config.mjs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const shots = process.argv[2] || '.';
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const db = new pg.Client(PG);
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
async function asUser(userId, sql, params = []) {
  await db.query('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await db.query('set local role authenticated');
    const r = await db.query(sql, params);
    await db.query('commit');
    return r.rows[0];
  } catch (e) { await db.query('rollback'); throw e; }
}

const browser = await chromium.launch(launchOptions);
const errors = [];
const opened = [];
async function person(name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Campo_Grande', ...opts });
  const page = await ctx.newPage();
  opened.push([name, page]);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  return page;
}
async function register(page, email, base) {
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
const userId = async (email) => (await one('select id from auth.users where email = $1', [email]))?.id;
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function axe(page) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length})`));
  return r;
}

try {
  // ---------- Preparação: chaves de operação ligadas, loja aprovada com Pix online e entrega da plataforma
  await db.query("update platform_settings set value = 'true' where key in ('online_payments_enabled', 'platform_delivery_enabled')");
  const [{ id: city }] = (await db.query("select id from cities where slug = 'sidrolandia-ms'")).rows;
  const dono = await person('lojista');
  await register(dono, 'dono@mercado.test', PAR);
  const donoId = await userId('dono@mercado.test');
  const cat = (await one("select id from categories where slug = 'mercado'")).id;
  const { id: storeId } = await asUser(donoId, "select public.register_store('Mercado do Bairro', $1, $2, 'Dono', '67999990000', '12.345.678/0001-90', null, null, null, 'Rua A, 10') id", [cat, city]);
  await db.query("update stores set status = 'approved', approved_at = now(), accepts_platform_delivery = true, accepts_online_payment = true, delivery_fee_default = 6, lat = -20.93, lng = -54.96 where id = $1", [storeId]);
  await db.query("insert into user_roles (user_id, role) values ($1, 'partner') on conflict do nothing", [donoId]);
  for (let d = 0; d < 7; d++) await db.query("insert into store_hours (store_id, weekday, opens, closes) values ($1, $2, '00:00', '12:00'), ($1, $2, '12:00', '00:00')", [storeId, d]);
  await db.query("insert into products (store_id, name, price, section) values ($1, 'Café especial 500g', 32, 'Mercearia')", [storeId]);
  await db.query(`insert into coupons (code, kind, value, funded_by, per_user_limit) values ('BEMVINDO5', 'fixed', 5, 'platform', 1)`);

  // ---------- Cliente: cupom + Pix pelo app
  const cli = await person('cliente');
  await register(cli, 'maria@cliente.test', CLI);
  await cli.goto(`${CLI}/loja/${storeId}`);
  await cli.waitForTimeout(1500);
  await cli.getByRole('button', { name: 'Adicionar' }).first().click();
  await cli.goto(`${CLI}/carrinho`);
  await cli.waitForTimeout(1000);
  await cli.fill('input[placeholder="Nome"]', 'Maria Cliente');
  await cli.fill('input[placeholder="WhatsApp / telefone"]', '67988887777');
  await cli.getByRole('radio', { name: 'Entrega pela plataforma' }).click();
  const addr = cli.locator('input[placeholder="Endereço completo (rua, número, bairro)"]');
  if (await addr.count()) await addr.fill('Rua das Flores, 50, Centro');
  await cli.fill('input[placeholder="Cupom de desconto"]', 'bemvindo5');
  await cli.getByRole('button', { name: 'Aplicar' }).click();
  await cli.waitForTimeout(1500);
  check('Cupom aplicado mostra o desconto calculado pelo servidor', await cli.getByText(/Cupom BEMVINDO5/).isVisible());
  await cli.getByRole('radio', { name: 'Pagar agora pelo app' }).click();
  await cli.waitForTimeout(800);
  check('Pagamento pelo app avisa que é ambiente de teste', await cli.getByText(/Ambiente de teste/).first().isVisible());
  check('Finalização sem rolagem lateral no celular', await noSideScroll(cli));
  await shot(cli, 'm01-checkout-cupom-pix');
  await cli.getByRole('button', { name: /Ir para o pagamento/ }).click();
  await cli.waitForTimeout(2500);
  const o = await one("select id, code, total, discount_amount, payment_mode, payment_status from orders order by created_at desc limit 1");
  check('Pedido online criado com desconto e aguardando pagamento', o && o.payment_mode === 'online' && o.payment_status === 'awaiting_payment' && Number(o.discount_amount) === 5, JSON.stringify(o));
  await cli.waitForSelector('[data-pagamento-online]', { timeout: 8000 }).catch(() => {});
  check('Tela do pedido mostra o Pix copia e cola gerado pelo servidor', await cli.getByText(/SIMULACAO-VIZINHOMARKET/).isVisible().catch(() => false));
  await shot(cli, 'm02-pix-gerado');

  // Loja ainda não vê o pedido (não pago)
  await signIn(dono, PAR, 'dono@mercado.test');
  await dono.goto(`${PAR}/`);
  await dono.waitForTimeout(1500);
  check('Loja não vê pedido online antes da confirmação do banco', !(await dono.getByText('Maria Cliente').count()));

  // "Banco" confirma (webhook assinado → mesmas regras da Edge Function)
  const pay = await one('select provider_payment_id, amount from payments where order_id = $1', [o.id]);
  const wh = await (await fetch(`${API}/functions/v1/sandbox-pagar`, { method: 'POST', body: JSON.stringify({ provider_payment_id: pay.provider_payment_id, paid_amount: Number(pay.amount) }) })).json();
  check('Webhook do gateway confirma o pagamento', wh.result === 'paid', JSON.stringify(wh));
  await cli.getByRole('button', { name: /Já paguei/ }).click().catch(() => {});
  await cli.waitForTimeout(1500);
  check('Cliente vê "Pagamento confirmado pelo banco"', await cli.getByText(/Pagamento confirmado pelo banco/).isVisible().catch(() => false));
  await dono.reload();
  await dono.waitForTimeout(2000);
  check('Depois de pago, o pedido aparece para a loja como "Pago pelo app"', await dono.getByText(/Pago pelo app/).first().isVisible().catch(() => false));
  await shot(dono, 'm03-loja-pedido-pago');
  await dono.getByRole('button', { name: 'Aceitar pedido' }).first().click();
  await dono.waitForTimeout(1200);
  await dono.getByRole('button', { name: 'Iniciar preparo' }).first().click();
  await dono.waitForTimeout(1200);
  await dono.getByRole('button', { name: 'Marcar como pronto' }).first().click();
  await dono.waitForTimeout(1200);
  check('Loja leva o pedido até "pronto"', (await one('select status from orders where id = $1', [o.id])).status === 'READY');
  check('Loja não tem botão "Saiu para entrega" em entrega da plataforma', !(await dono.getByRole('button', { name: 'Saiu para entrega' }).count()));

  // ---------- Entregador
  const ent = await person('entregador', { geolocation: { latitude: -20.94, longitude: -54.97 }, permissions: ['geolocation'] });
  await register(ent, 'joao@entregador.test', ENT);
  await ent.goto(`${ENT}/cadastro`);
  await ent.waitForTimeout(1200);
  await ent.fill('input[placeholder="ABC1D23"]', 'ABC1D23');
  await ent.fill('input[placeholder="000.000.000-00"]', '529.982.247-25');
  await ent.locator('input[type=checkbox]').last().check();
  await shot(ent, 'm04-entregador-cadastro');
  await ent.getByRole('button', { name: 'Enviar cadastro' }).click();
  await ent.waitForTimeout(1500);
  check('Cadastro do entregador fica em análise', await ent.getByText('Cadastro em análise').isVisible().catch(() => false));
  const entId = await userId('joao@entregador.test');
  await db.query("update couriers set status = 'approved', approved_at = now() where user_id = $1", [entId]);
  await db.query("insert into user_roles (user_id, role) values ($1, 'courier') on conflict do nothing", [entId]);
  await ent.goto(`${ENT}/`);
  await ent.waitForTimeout(1500);
  await ent.getByRole('button', { name: 'Ficar online' }).click();
  await ent.waitForTimeout(3000);
  check('Entregador online vê a corrida com o valor dele', await ent.getByText('Mercado do Bairro').first().isVisible().catch(() => false));
  check('Oferta não mostra endereço nem telefone do cliente', !(await ent.getByText('Rua das Flores').count()) && !(await ent.getByText('67988887777').count()));
  check('App do entregador sem rolagem lateral', await noSideScroll(ent));
  await shot(ent, 'm05-entregador-oferta');
  const a11yEnt = await axe(ent);
  check('Acessibilidade (axe): app do entregador sem violação grave', a11yEnt.length === 0, a11yEnt.join(', '));
  await ent.getByRole('button', { name: 'Aceitar corrida' }).click();
  await ent.waitForTimeout(1500);
  await ent.getByText(/Pronto para retirar/).first().click();
  await ent.waitForTimeout(1500);
  await ent.getByRole('button', { name: 'Confirmar retirada' }).click();
  await ent.waitForTimeout(1500);
  check('Retirada coloca o pedido em rota', (await one('select status, courier_id from orders where id = $1', [o.id])).status === 'IN_TRANSIT');
  check('Depois do aceite o entregador vê o endereço do cliente', await ent.getByText(/Rua das Flores/).first().isVisible().catch(() => false));
  await ent.waitForTimeout(25000); // reenvio periódico da posição (a cada 20 s) depois da retirada
  const pos = await one('select count(*)::int n from delivery_locations where order_id = $1', [o.id]);
  check('Posição do entregador registrada durante a entrega', pos.n >= 1, `posições=${pos.n}`);
  const { delivery_code: code } = await one('select delivery_code from order_secrets where order_id = $1', [o.id]);
  await ent.fill('input[aria-label="Código de entrega"]', code);
  await shot(ent, 'm06-entregador-codigo');
  await ent.getByRole('button', { name: 'Concluir entrega' }).click();
  await ent.waitForTimeout(1500);
  check('Entrega concluída com o código do cliente', await ent.getByText('Entrega concluída').isVisible().catch(() => false));
  await ent.goto(`${ENT}/ganhos`);
  await ent.waitForTimeout(1500);
  check('Ganhos mostram a corrida', await ent.getByText('R$ 6,00').first().isVisible().catch(() => false));
  await shot(ent, 'm07-entregador-ganhos');

  const led = await one("select coalesce(sum(amount),0)::numeric s, count(*)::int n from ledger_entries");
  const loja = await one("select -coalesce(sum(amount),0)::numeric s from ledger_entries where account = 'store_payable' and party_id = $1", [storeId]);
  check('Razão financeiro fecha em zero', Number(led.s) === 0 && led.n > 0, JSON.stringify(led));
  check('Loja tem a receber R$ 29,44 (R$ 32 − 8% de comissão; o cupom é bancado pela plataforma)', Number(loja.s) === 29.44, `a receber=${loja.s}`);

  // ---------- Serviços
  const prest = await person('prestador');
  await register(prest, 'ze@eletricista.test', PAR);
  const prestId = await userId('ze@eletricista.test');
  const catS = (await one("select id from categories where slug = 'servicos'")).id;
  const { id: provId } = await asUser(prestId, "select public.register_store('Elétrica do Zé', $1, $2, 'Zé', '67999991111', '111.444.777-35') id", [catS, city]);
  await db.query("update stores set status = 'approved', approved_at = now() where id = $1", [provId]);
  await db.query("insert into user_roles (user_id, role) values ($1, 'partner') on conflict do nothing", [prestId]);
  await db.query("insert into service_offerings (store_id, name, price_from, price_unit) values ($1, 'Instalação de chuveiro', 80, 'visita')", [provId]);
  await cli.goto(`${CLI}/loja/${provId}`);
  await cli.waitForTimeout(1500);
  check('Página do prestador mostra serviços e o pedido de orçamento (sem carrinho)', await cli.getByText('Instalação de chuveiro').isVisible() && await cli.getByRole('button', { name: /Enviar pedido de orçamento/ }).isVisible());
  await cli.getByText('Instalação de chuveiro').click();
  await cli.fill('textarea[aria-label="Descrição do serviço"]', 'Trocar o chuveiro do banheiro, 220V, sem urgência.');
  await cli.getByRole('button', { name: /Enviar pedido de orçamento/ }).click();
  await cli.waitForTimeout(2000);
  check('Pedido de orçamento aberto', await cli.getByText('Aguardando proposta').isVisible().catch(() => false));
  await shot(cli, 'm08-orcamento-pedido');
  await signIn(prest, PAR, 'ze@eletricista.test');
  await prest.goto(`${PAR}/orcamentos`);
  await prest.waitForTimeout(2000);
  await prest.locator('label:has-text("Valor (R$)") input').first().fill('150');
  await prest.getByRole('button', { name: 'Enviar proposta' }).click();
  await prest.waitForTimeout(1500);
  await shot(prest, 'm09-prestador-proposta');
  await cli.reload();
  await cli.waitForTimeout(1500);
  check('Cliente recebe a proposta', await cli.getByText('Proposta recebida').isVisible().catch(() => false));
  await cli.getByRole('button', { name: 'Aceitar proposta' }).click();
  await cli.waitForTimeout(1500);
  check('Cliente aceita a proposta', (await one('select status, commission_amount from service_requests order by created_at desc limit 1')).status === 'ACCEPTED');

  // ---------- Admin: telas novas
  const adm = await person('admin', { viewport: { width: 1280, height: 900 } });
  await register(adm, 'admin@vizinhomarket.test', CLI);
  await db.query("insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = 'admin@vizinhomarket.test'");
  await signIn(adm, ADM, 'admin@vizinhomarket.test');
  for (const [path, text] of [['/financeiro', 'Pendências'], ['/reembolsos', 'Para decidir'], ['/atendimento', 'Abertos'], ['/cupons', 'BEMVINDO5'], ['/entregas', 'Entregas'], ['/categorias', 'Criar (inativa)']]) {
    await adm.goto(`${ADM}${path}`);
    await adm.waitForTimeout(1500);
    check(`Admin abre ${path}`, await adm.getByText(text).first().isVisible().catch(() => false));
  }
  await adm.goto(`${ADM}/financeiro`);
  await adm.waitForTimeout(1500);
  await shot(adm, 'm10-admin-conciliacao');

  // ---------- Acessibilidade e celular nas telas do cliente
  for (const path of ['/', `/loja/${storeId}`, `/pedido/${o.id}`, '/meus-pedidos', '/suporte']) {
    await cli.goto(`${CLI}${path}`);
    await cli.waitForTimeout(1500);
    const v = await axe(cli);
    check(`Acessibilidade (axe) ${path}: sem violação grave`, v.length === 0, v.join(', '));
    check(`Celular sem rolagem lateral ${path}`, await noSideScroll(cli));
  }
} catch (e) {
  check('Execução sem erro inesperado', false, e.message.split('\n')[0]);
  // Diagnóstico: onde cada pessoa estava quando parou (aparece no log do CI).
  for (const [n, p] of opened) {
    const txt = await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, ' ')).catch(() => '');
    console.log(`FALHOU  (diagnóstico) ${n} em ${p.url()} → ${txt}`);
    await shot(p, `m99-falha-${n}`).catch(() => {});
  }
}

check('Nenhum erro de JavaScript nas telas', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
await db.end();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} verificações passaram`);
process.exit(passed === results.length ? 0 : 1);
