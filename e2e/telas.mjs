// Teste ponta a ponta das telas que ainda não tinham cobertura, com volume de pedidos acima do antigo limite de 500:
// Painel do Comerciante — Histórico (totais e "Carregar mais"), Entregas, Relatórios, Comissões, resumo do mês;
// App do Cliente — Busca, Favoritos e Indique uma loja.
// Uso: node telas.mjs <pasta para prints>   (rodar depois de reset.sh)
import { chromium } from 'playwright';
import pg from 'pg';
import { CLI, PAR, API, PG, launchOptions } from './config.mjs';

const shots = process.argv[2] || '.';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const db = new pg.Client(PG);
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = (s) => (s || '').replace(/\s/g, ' ').trim();

const browser = await chromium.launch(launchOptions);
const errors = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Campo_Grande' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|WebSocket|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|fonts\.g/i.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
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
const shot = (page, n) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const textOf = async (page, sel) => norm(await page.locator(sel).first().textContent({ timeout: 10000 }));
// espera o número sair do "…" (carregando)
async function settled(page, sel) {
  await page.waitForFunction((s) => { const el = document.querySelector(s); return el && !/…/.test(el.textContent); }, sel, { timeout: 15000 });
  return textOf(page, sel);
}

try {
  // ---------- Preparação: comerciante e cliente pelas telas; loja e 600+ pedidos direto no banco
  const dono = await person('comerciante');
  await register(dono, 'dono@telas.test', PAR);
  const cli = await person('cliente');
  await register(cli, 'cliente@telas.test', CLI);
  const owner = await one("select id from auth.users where email = 'dono@telas.test'");
  const cust = await one("select id from auth.users where email = 'cliente@telas.test'");
  const { id: city } = await one("select id from cities where slug = 'sidrolandia-ms'");
  const { id: cat } = await one("select id from categories where slug = 'alimentacao'");
  const { id: store } = await one(`insert into stores (city_id, category_id, name, slug, created_by, status, accepts_store_delivery, accepts_pickup)
    values ($1, $2, 'Padaria Volume', 'padaria-volume', $3, 'approved', true, true) returning id`, [city, cat, owner.id]);
  await db.query("insert into store_members (store_id, user_id, role) values ($1, $2, 'owner')", [store, owner.id]);
  await db.query("insert into store_private (store_id, document, owner_name, owner_phone) values ($1, '11144477735', 'Dono Volume', '67999990000')", [store]);
  await db.query("insert into user_roles (user_id, role) values ($1, 'partner') on conflict do nothing", [owner.id]);
  await db.query("insert into store_hours (store_id, weekday, opens, closes) select $1, d, '00:00', '23:59' from generate_series(0, 6) d", [store]);
  const { id: pao } = await one("insert into products (store_id, name, price, stock) values ($1, 'Pão de queijo recheado', 6.5, 1000) returning id", [store]);
  await db.query("insert into products (store_id, name, price, stock) values ($1, 'Café coado', 4, 1000)", [store]);
  const cols = `code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
                subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key, created_at, accepted_at, delivered_at`;
  // 620 entregues nos últimos 6 dias (sem contar hoje), 3 entregues hoje, 40 cancelados, 1 pronto, 2 a caminho
  await db.query(`insert into orders (${cols})
    select 'VT-' || g, $1, $2, $3, 'DELIVERED', 'store_delivery', 'pix', 'Cliente Volume', '67900000000',
           10 + (g % 9), 5, 15 + (g % 9), 0.08, round((10 + (g % 9)) * 0.08, 2), 'telas-v-' || g,
           now() - (1 + g % 6) * interval '1 day' - interval '2 hours', now() - (1 + g % 6) * interval '1 day' - interval '115 minutes',
           now() - (1 + g % 6) * interval '1 day' - interval '1 hour'
    from generate_series(1, 620) g`, [city, store, cust.id]);
  await db.query(`insert into orders (${cols})
    select 'VH-' || g, $1, $2, $3, 'DELIVERED', 'store_delivery', 'cash', 'Cliente Hoje', '67900000000', 20, 5, 25, 0.08, 1.6, 'telas-h-' || g,
           now() - interval '20 minutes', now() - interval '18 minutes', now() - interval '2 minutes'
    from generate_series(1, 3) g`, [city, store, cust.id]);
  await db.query(`insert into orders (code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
                  subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key, created_at, cancel_reason)
    select 'VC-' || g, $1, $2, $3, 'CANCELLED', 'store_delivery', 'pix', 'Cliente Volume', '67900000000', 20, 5, 25, 0.08, 1.6,
           'telas-c-' || g, now() - (1 + g % 6) * interval '1 day', 'Cliente desistiu'
    from generate_series(1, 40) g`, [city, store, cust.id]);
  await db.query(`insert into orders (code, city_id, store_id, customer_id, status, fulfillment, payment_method, customer_name, customer_phone,
                  subtotal, delivery_fee, total, commission_rate, commission_amount, idempotency_key, created_at, accepted_at)
    select 'VA-' || g, $1, $2, $3, (case when g = 1 then 'READY' else 'IN_TRANSIT' end)::order_status, 'store_delivery', 'pix', 'Cliente Ativo', '67900000000',
           12, 5, 17, 0.08, 0.96, 'telas-a-' || g, now() - interval '30 minutes', now() - interval '28 minutes'
    from generate_series(1, 3) g`, [city, store, cust.id]);
  await db.query(`insert into order_items (order_id, product_id, name, unit, unit_price, quantity, line_total)
    select o.id, $1, 'Pão de queijo recheado', 'un', o.subtotal, 1, o.subtotal from orders o where o.store_id = $2`, [pao, store]);
  const ref7 = await one(`select count(*)::int n, sum(subtotal) vendas, sum(commission_amount) comissao from orders
    where store_id = $1 and status = 'DELIVERED' and delivered_at >= now() - interval '7 days'`, [store]);
  const ref30 = await one("select sum(total) total from orders where store_id = $1 and status = 'DELIVERED' and delivered_at >= now() - interval '30 days'", [store]);
  const refMes = await one(`select count(*)::int n from orders where store_id = $1
    and created_at >= (date_trunc('month', now() at time zone 'America/Campo_Grande') at time zone 'America/Campo_Grande')`, [store]);
  check('Banco de teste com mais de 500 pedidos entregues na loja', ref7.n > 500, `${ref7.n} entregues em 7 dias`);

  // ---------- Comerciante: Histórico
  await dono.goto(`${PAR}/login`);
  await dono.fill('input[type=email]', 'dono@telas.test');
  await dono.fill('input[type=password]', 'SenhaForte123!');
  await dono.click('button[type=submit]');
  await dono.waitForTimeout(1500);
  await dono.goto(`${PAR}/historico`);
  const entregues = await settled(dono, '[data-total="Entregues"]');
  check('Histórico: total de entregues (7 dias) igual ao banco, acima de 500', entregues === String(ref7.n), `tela ${entregues} · banco ${ref7.n}`);
  const vendas = await settled(dono, '[data-total="Vendas"]');
  check('Histórico: vendas iguais ao banco', vendas === norm(brl(ref7.vendas)), `tela ${vendas} · banco ${brl(ref7.vendas)}`);
  const comissao = await settled(dono, '[data-total="Comissão"]');
  check('Histórico: comissão igual ao banco', comissao === norm(brl(ref7.comissao)), `tela ${comissao} · banco ${brl(ref7.comissao)}`);
  await dono.waitForSelector('[data-order-row]');
  const first = await dono.locator('[data-order-row]').count();
  await dono.getByRole('button', { name: 'Carregar mais' }).click();
  await dono.waitForFunction((n) => document.querySelectorAll('[data-order-row]').length > n, first, { timeout: 10000 });
  const second = await dono.locator('[data-order-row]').count();
  check('Histórico: lista em páginas de 50 e "Carregar mais" traz a próxima', first === 50 && second === 100, `${first} → ${second}`);
  await shot(dono, 'telas-01-historico');

  // ---------- Comerciante: Entregas
  await dono.goto(`${PAR}/entregas`);
  await dono.waitForTimeout(2500);
  const hoje = await textOf(dono, '[data-count="Entregues hoje"]');
  const caminho = await textOf(dono, '[data-count="A caminho"]');
  const prontos = await textOf(dono, '[data-count="Prontos para sair"]');
  check('Entregas: entregues hoje, a caminho e prontos batem com o banco', hoje === '3' && caminho === '2' && prontos === '1', `hoje ${hoje} · a caminho ${caminho} · prontos ${prontos}`);
  await shot(dono, 'telas-02-entregas');

  // ---------- Comerciante: Relatórios (30 dias)
  await dono.goto(`${PAR}/relatorios`);
  const fat = await settled(dono, '[data-stat="Faturamento (entregues)"]');
  check('Relatórios: faturamento de 30 dias igual ao banco', fat === norm(brl(ref30.total)), `tela ${fat} · banco ${brl(ref30.total)}`);
  check('Relatórios: produto mais vendido aparece', await dono.getByText('Pão de queijo recheado').first().isVisible());
  await shot(dono, 'telas-03-relatorios');

  // ---------- Comerciante: Comissões e resumo do mês
  await dono.goto(`${PAR}/financeiro`);
  await dono.waitForSelector('[data-commission-row]', { timeout: 10000 });
  const comRows = await dono.locator('[data-commission-row]').count();
  check('Comissões: lista paginada (50) com "Carregar mais"', comRows === 50 && await dono.getByRole('button', { name: 'Carregar mais' }).isVisible(), `${comRows} linhas`);
  const mes = await settled(dono, '[data-stat="Pedidos no mês"]');
  check('Resumo do mês: pedidos no mês igual ao banco', mes === String(refMes.n), `tela ${mes} · banco ${refMes.n}`);
  await shot(dono, 'telas-04-financeiro');

  // ---------- Comerciante: Aparência da loja
  await dono.goto(`${PAR}/loja/aparencia`);
  await dono.waitForSelector('textarea[placeholder="Descreva sua loja para os clientes"]', { timeout: 10000 });
  await dono.fill('textarea[placeholder="Descreva sua loja para os clientes"]', 'Pão de queijo quentinho toda manhã');
  await dono.getByRole('button', { name: 'Salvar' }).click();
  await dono.getByText('Alterações salvas.').waitFor({ timeout: 10000 }).catch(() => {});
  const desc = await one('select description from stores where id = $1', [store]);
  check('Aparência: descrição salva no banco e aviso de "salvo" na tela',
    desc.description === 'Pão de queijo quentinho toda manhã' && await dono.getByText('Alterações salvas.').isVisible(), JSON.stringify(desc));
  check('Aparência: só um seletor de loja (o do menu lateral)', (await dono.locator('select').count()) <= 1);
  await shot(dono, 'telas-04b-aparencia');

  // ---------- Cliente: Busca
  await cli.goto(`${CLI}/busca`);
  await cli.fill('input[placeholder="Buscar por loja ou produto..."]', 'pão de queijo');
  await cli.waitForTimeout(1500);
  check('Busca: encontra o produto pelo nome', await cli.getByText('Pão de queijo recheado').first().isVisible());
  const catalogo = [];
  cli.on('request', (r) => { if (/\/rest\/v1\/products/.test(r.url())) catalogo.push(r.url()); });
  await cli.fill('input[placeholder="Buscar por loja ou produto..."]', 'queijo rech');
  await cli.waitForTimeout(1500);
  check('Busca: no servidor, com partes do nome, sem baixar o catálogo inteiro',
    await cli.getByText('Pão de queijo recheado').first().isVisible() && catalogo.length > 0 && catalogo.every((u) => /ilike/.test(decodeURIComponent(u)) && !/limit=1000/.test(u)),
    catalogo.map((u) => decodeURIComponent(u).split('?')[1]?.slice(0, 120)).join(' | '));
  await cli.fill('input[placeholder="Buscar por loja ou produto..."]', 'padaria volume');
  await cli.waitForTimeout(800);
  check('Busca: encontra a loja pelo nome', await cli.getByText('Padaria Volume').first().isVisible());
  await shot(cli, 'telas-05-busca');

  // ---------- Cliente: Favoritos
  await cli.goto(`${CLI}/loja/${store}`);
  await cli.waitForTimeout(2000);
  await cli.getByRole('button', { name: 'Favoritar' }).first().click();
  await cli.goto(`${CLI}/favoritos`);
  await cli.waitForTimeout(2000);
  check('Favoritos: produto favoritado aparece na lista', await cli.getByText(/Pão de queijo recheado|Café coado/).first().isVisible());
  const favDb = await one('select count(*)::int n from favorites where user_id = $1', [cust.id]);
  check('Favoritos: salvo na conta (banco), não só no navegador', favDb.n === 1, JSON.stringify(favDb));
  await cli.evaluate(() => localStorage.removeItem('perto_favorites'));
  await cli.reload(); await cli.waitForTimeout(2000);
  check('Favoritos: aparece de novo depois de limpar o navegador (veio da conta)', await cli.getByText(/Pão de queijo recheado|Café coado/).first().isVisible());
  await cli.getByRole('button', { name: 'Remover dos favoritos' }).first().click();
  await cli.waitForTimeout(500);
  check('Favoritos: remover tira da lista', (await cli.getByRole('button', { name: 'Remover dos favoritos' }).count()) === 0);
  await cli.waitForTimeout(800);
  check('Favoritos: remover também apaga da conta', (await one('select count(*)::int n from favorites where user_id = $1', [cust.id])).n === 0);
  await shot(cli, 'telas-06-favoritos');

  // ---------- Cliente: Indique uma loja
  await cli.goto(`${CLI}/indique-loja`);
  await cli.fill('input[placeholder="Ex.: Padaria do Bairro"]', 'Oficina do Zé');
  await cli.fill('input[placeholder="WhatsApp, telefone ou e-mail"]', '67999997777');
  await cli.getByRole('button', { name: /Enviar indicação/ }).click();
  await cli.waitForTimeout(1500);
  const indic = await one("select store_name, contact from store_referrals where store_name = 'Oficina do Zé'");
  check('Indique loja: indicação gravada e tela de agradecimento', !!indic && await cli.getByText('Obrigado pela indicação!').isVisible(), JSON.stringify(indic));
  await shot(cli, 'telas-07-indique');

  // ---------- Aviso com o painel fechado (Web Push): ligar na tela Alertas e o service worker mostrar o aviso
  await dono.context().grantPermissions(['notifications'], { origin: PAR });
  await dono.addInitScript(() => {
    // O Chromium de teste não alcança o serviço de push do Google: imita só a inscrição.
    let fake = null;
    if (window.PushManager) {
      PushManager.prototype.subscribe = async function () {
        fake = { endpoint: 'https://push.teste/painel', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; }, unsubscribe: async () => { fake = null; return true; } };
        return fake;
      };
      PushManager.prototype.getSubscription = async function () { return fake; };
    }
  });
  await dono.goto(`${PAR}/alertas`);
  await dono.waitForSelector('[data-push="off"]', { timeout: 10000 });
  await dono.locator('[data-push="off"]').getByRole('button', { name: 'Ligar' }).click();
  await dono.waitForSelector('[data-push="on"]', { timeout: 10000 }).catch(() => {});
  const pt = await one("select t.app, t.token from push_tokens t join auth.users u on u.id = t.user_id where u.email = 'dono@telas.test'");
  check('Alertas: liga o aviso com o painel fechado e guarda este aparelho na conta', pt?.app === 'partner' && pt.token.includes('push.teste/painel'), JSON.stringify(pt));
  const cdp = await dono.context().newCDPSession(dono);
  const regs = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await dono.waitForTimeout(800);
  const reg = regs.find((r) => r.scopeURL.startsWith(PAR) && !r.isDeleted);
  if (reg) await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(PAR).origin, registrationId: reg.registrationId, data: JSON.stringify({ title: 'Novo pedido!', body: 'VM-TESTE · Maria · R$ 30,00', tag: 't1', url: '/' }) });
  await dono.waitForTimeout(1200);
  const notifs = await dono.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title} | ${n.body}`));
  check('Service worker mostra o aviso quando chega o push', notifs.some((n) => n.startsWith('Novo pedido! | VM-TESTE')), notifs.join(' ; ') || (reg ? 'nenhum aviso' : 'service worker não registrado'));
  await dono.locator('[data-push="on"]').getByRole('button', { name: 'Desligar' }).click();
  await dono.waitForSelector('[data-push="off"]', { timeout: 10000 }).catch(() => {});
  check('Alertas: desligar tira o aparelho da conta', !(await one("select 1 x from push_tokens t join auth.users u on u.id = t.user_id where u.email = 'dono@telas.test'")));
  await shot(dono, 'telas-07a-alertas');

  // ---------- Equipe: dono convida atendente; atendente vê só pedidos, entregas e cardápio
  const atend = await person('atendente');
  await register(atend, 'atendente@telas.test', PAR);
  dono.on('dialog', (d) => d.accept());
  await dono.goto(`${PAR}/equipe`);
  await dono.waitForSelector('input[placeholder="e-mail do atendente"]', { timeout: 10000 });
  await dono.fill('input[placeholder="e-mail do atendente"]', 'atendente@telas.test');
  await dono.getByRole('button', { name: 'Convidar' }).click();
  await dono.getByText('atendente@telas.test agora é atendente da loja.').waitFor({ timeout: 10000 }).catch(() => {});
  const mem = await one("select m.role from store_members m join auth.users u on u.id = m.user_id where u.email = 'atendente@telas.test' and m.store_id = $1", [store]);
  check('Dono convida atendente pela tela Equipe', mem?.role === 'staff' && await dono.locator('[data-member="atendente@telas.test"]').isVisible(), JSON.stringify(mem));
  await shot(dono, 'telas-07b-equipe');
  await atend.goto(`${PAR}/`);
  await atend.waitForTimeout(2500);
  const menu = await atend.locator('nav').first().innerText();
  check('Atendente entra no painel da loja e vê só Pedidos, Entregas, Cardápio e Alertas',
    menu.includes('Pedidos') && menu.includes('Cardápio') && !menu.includes('Comissões') && !menu.includes('Relatórios') && !menu.includes('Minha loja') && !menu.includes('Equipe'), menu.replace(/\n/g, ' | '));
  await atend.goto(`${PAR}/financeiro`);
  await atend.waitForTimeout(1500);
  check('Atendente que abre Comissões volta para Pedidos', new URL(atend.url()).pathname === '/');
  await shot(atend, 'telas-07c-atendente');
  await dono.goto(`${PAR}/equipe`);
  await dono.waitForSelector('[data-member="atendente@telas.test"]', { timeout: 10000 });
  await dono.getByRole('button', { name: 'Remover atendente@telas.test' }).click();
  await dono.waitForTimeout(1500);
  check('Dono remove o atendente', !(await one("select 1 x from store_members m join auth.users u on u.id = m.user_id where u.email = 'atendente@telas.test'")));

  // ---------- Taxa por bairro: comerciante define, cliente escolhe o bairro no pedido
  const bairros = {};
  for (const n of ['Centro', 'Jardim Pindorama', 'Vila Nova']) bairros[n] = (await one('insert into neighborhoods (city_id, name) values ($1, $2) returning id', [city, n])).id;
  await dono.goto(`${PAR}/loja`);
  await dono.waitForSelector('[data-zones]', { timeout: 10000 });
  await dono.waitForSelector('[data-zone="Vila Nova"]', { timeout: 10000 });
  await dono.locator('[data-zone="Vila Nova"] input[type=checkbox]').check();
  await dono.locator('[data-zone="Vila Nova"] input[inputmode=decimal]').fill('6');
  await dono.locator('[data-zone="Jardim Pindorama"] input[type=checkbox]').check();
  await dono.locator('[data-zone="Jardim Pindorama"] input[inputmode=decimal]').fill('8,50');
  await dono.getByRole('button', { name: 'Salvar taxas por bairro' }).click();
  await dono.getByText('Taxas salvas para 2 bairro(s).').waitFor({ timeout: 10000 }).catch(() => {});
  const zs = (await db.query('select n.name, z.fee from delivery_zones z join neighborhoods n on n.id = z.neighborhood_id where z.store_id = $1 order by n.name', [store])).rows;
  check('Comerciante define taxa por bairro na tela (2 bairros)', zs.length === 2 && zs[0].fee === '8.50' && zs[1].fee === '6.00', JSON.stringify(zs));
  await shot(dono, 'telas-08-taxa-bairro');

  await cli.goto(`${CLI}/busca`);
  await cli.fill('input[placeholder="Buscar por loja ou produto..."]', 'padaria volume');
  await cli.waitForTimeout(1500);
  check('Vitrine mostra a faixa de taxa por bairro', await cli.getByText('Entrega R$ 6,00 a R$ 8,50 (conforme o bairro)').first().isVisible());
  await cli.goto(`${CLI}/loja/${store}`);
  await cli.waitForTimeout(1500);
  await cli.getByRole('button', { name: 'Adicionar' }).first().click();
  await cli.goto(`${CLI}/carrinho`);
  await cli.waitForTimeout(1000);
  await cli.fill('input[placeholder="Nome"]', 'Cliente Bairro');
  await cli.fill('input[placeholder="WhatsApp / telefone"]', '67988881111');
  await cli.fill('input[placeholder="Endereço completo (rua, número, bairro)"]', 'Rua das Palmeiras, 10');
  const pedirAntes = await cli.getByRole('button', { name: /Fazer pedido/ }).isDisabled();
  const opcoes = await cli.locator('select[aria-label="Bairro"] option').allTextContents();
  check('Carrinho exige o bairro e só lista os bairros atendidos', pedirAntes && opcoes.length === 3 && !opcoes.some((o) => o.includes('Centro')), opcoes.join(' | '));
  await cli.selectOption('select[aria-label="Bairro"]', { label: 'Vila Nova · entrega R$ 6,00' });
  await cli.getByRole('button', { name: /Fazer pedido/ }).click();
  await cli.waitForURL(/\/pedido\//, { timeout: 10000 }).catch(() => {});
  const ped = await one("select o.delivery_fee, n.name bairro from orders o left join neighborhoods n on n.id = o.neighborhood_id where o.customer_name = 'Cliente Bairro'");
  check('Pedido usa a taxa do bairro escolhido (Vila Nova, R$ 6)', ped?.delivery_fee === '6.00' && ped?.bairro === 'Vila Nova', JSON.stringify(ped));
  await shot(cli, 'telas-09-pedido-bairro');

  // ---------- Esqueci a senha: o link do e-mail abre a troca de senha (formato do Supabase: #access_token=...)
  const tok = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cliente@telas.test', password: 'SenhaForte123!' }) })).json();
  const rec = await person('recuperacao');
  await rec.goto(`${PAR}/reset-password#access_token=${tok.access_token}&refresh_token=${tok.refresh_token}&expires_in=3600&expires_at=${tok.expires_at}&token_type=bearer&type=recovery`);
  await rec.waitForSelector('#password', { timeout: 10000 }).catch(() => {});
  check('Link de "Esqueci a senha" abre a tela de nova senha', await rec.locator('#password').isVisible());
  await rec.fill('#password', 'SenhaNova12345');
  await rec.fill('#confirm', 'SenhaNova12345');
  await rec.getByRole('button', { name: 'Redefinir senha' }).click();
  await rec.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 }).catch(() => {});
  const relog = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cliente@telas.test', password: 'SenhaNova12345' }) });
  check('Senha nova vale e a pessoa entra no painel', relog.status === 200 && new URL(rec.url()).pathname === '/', `${relog.status} ${rec.url()}`);
  const rec2 = await person('link-vencido');
  await rec2.goto(`${PAR}/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  check('Link vencido mostra a orientação para pedir outro', await rec2.getByText('Este link venceu ou já foi usado').waitFor({ timeout: 8000 }).then(() => true, () => false));

  check('Nenhum erro de JavaScript nas telas', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Roteiro completo sem travar', false, e.message.split('\n')[0]);
  if (errors.length) console.log('erros:', errors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  await db.end();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} verificações passaram`);
  process.exit(passed === results.length ? 0 : 1);
}
