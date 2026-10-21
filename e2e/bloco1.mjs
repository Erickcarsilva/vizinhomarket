// Teste ponta a ponta das novidades do Bloco 1, pelas telas:
// tamanhos e adicionais, chave Pix no pedido, cliente cancela, perfil salvo na conta,
// excluir conta, registro de erros e alerta de pedido do lojista.
// Uso: node bloco1.mjs <pasta para prints>   (rodar depois de reset.sh)
import { chromium } from 'playwright';
import pg from 'pg';

const APP = 'http://localhost:4173';
const shots = process.argv[2] || '.';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASSOU' : 'FALHOU'}  ${name}${detail ? '  →  ' + detail : ''}`); };
const db = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'vm' });
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
const errors = [];
const pages = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Campo_Grande' });
  const page = await ctx.newPage();
  pages.push([name, page]);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|WebSocket|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|fonts\.g|teste-e2e/i.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
  return page;
}
async function register(page, email) {
  await page.goto(`${APP}/register`);
  await page.fill('input[type=email]', email);
  for (const p of await page.locator('input[type=password]').all()) await p.fill('SenhaForte123!');
  await page.getByRole('checkbox').first().click();
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
}
const shot = (page, n) => page.screenshot({ path: `${shots}/b1-${n}.png`, fullPage: true });

try {
  // ---------- Preparação: loja aprovada com chave Pix
  const dono = await person('lojista');
  await register(dono, 'dono@marmitaria.test');
  await dono.goto(`${APP}/cadastrar-loja`);
  await dono.waitForSelector('input[placeholder="Nome da loja"]');
  await dono.fill('input[placeholder="Nome da loja"]', 'Marmitaria Bloco Um');
  await dono.fill('input[placeholder="Responsável (nome completo)"]', 'Dona Teste');
  await dono.fill('input[placeholder="CNPJ ou CPF"]', '11.444.777/0001-61');
  await dono.fill('input[placeholder="Telefone / WhatsApp"]', '67999998888');
  await dono.fill('input[placeholder="Endereço"]', 'Rua Teste, 1');
  await dono.fill('input[placeholder="Horário (ex: Seg–Sáb, 8h–18h)"]', 'Todos os dias 0h-23h59');
  await dono.fill('input[placeholder="Taxa de entrega (R$)"]', '4');
  await dono.fill('input[placeholder="Chave Pix da loja (opcional)"]', 'pix@marmitaria.test');
  await dono.getByRole('button', { name: 'Enviar cadastro' }).click();
  await dono.waitForTimeout(2000);
  const st = await one("select s.id, sp.pix_key from stores s join store_private sp on sp.store_id = s.id where s.name = 'Marmitaria Bloco Um'");
  check('Chave Pix do cadastro fica nos dados privados da loja', st?.pix_key === 'pix@marmitaria.test', JSON.stringify(st));
  await db.query("update stores set status = 'approved', approved_at = now() where id = $1", [st.id]);

  // ---------- Lojista cadastra produto com tamanhos e adicionais pela tela
  await dono.goto(`${APP}/gerenciar-produtos`);
  await dono.waitForTimeout(1500);
  await dono.getByRole('button', { name: /Novo produto/ }).click();
  await dono.fill('input[placeholder="Nome"]', 'Marmita');
  await dono.fill('input[placeholder="Seção (ex: Lanches)"]', 'Marmitas');
  await dono.getByRole('button', { name: 'Adicionar tamanho' }).click();
  await dono.getByRole('button', { name: 'Adicionar tamanho' }).click();
  const tam = dono.locator('input[placeholder="Tamanho (ex: Grande)"]');
  const tamPreco = dono.locator('input[placeholder="R$"]');
  await tam.nth(0).fill('Pequena'); await tamPreco.nth(0).fill('18');
  await tam.nth(1).fill('Grande'); await tamPreco.nth(1).fill('25');
  await dono.getByRole('button', { name: 'Adicionar grupo' }).click();
  await dono.getByRole('button', { name: 'Adicionar opção' }).click();
  const op = dono.locator('input[placeholder="Opção (ex: Bacon)"]');
  const opPreco = dono.locator('input[placeholder="+R$"]');
  await op.nth(0).fill('Ovo'); await opPreco.nth(0).fill('3');
  await op.nth(1).fill('Bacon'); await opPreco.nth(1).fill('5');
  await shot(dono, '01-form-tamanhos');
  await dono.getByRole('button', { name: 'Salvar', exact: true }).click();
  await dono.waitForTimeout(2000);
  const prod = await one("select p.id, p.price, (select count(*) from product_variants v where v.product_id = p.id) tamanhos, (select count(*) from product_addons a join product_addon_groups g on g.id = a.group_id where g.product_id = p.id) adicionais from products p where name = 'Marmita'");
  check('Produto salvo com 2 tamanhos e 2 adicionais', Number(prod?.tamanhos) === 2 && Number(prod?.adicionais) === 2, JSON.stringify(prod));
  check('Preço "a partir de" é o menor tamanho', prod?.price === '18.00');
  await db.query("insert into products (store_id, name, price, section) values ($1, 'Refrigerante', 6, 'Bebidas')", [st.id]);

  // ---------- Cliente escolhe tamanho e adicional
  const cli = await person('cliente');
  await register(cli, 'maria@cliente.test');
  await cli.goto(`${APP}/loja/${st.id}`);
  await cli.waitForTimeout(1500);
  check('Vitrine mostra "a partir de" no produto com tamanhos', await cli.getByText('a partir de').first().isVisible());
  await cli.locator('div.flex.gap-5', { has: cli.locator('h4', { hasText: /^Marmita$/ }) }).getByRole('button', { name: 'Adicionar' }).click();
  await cli.waitForTimeout(500);
  await cli.getByRole('button', { name: /Grande/ }).click();
  await cli.getByRole('button', { name: /Bacon/ }).click();
  await cli.getByRole('button', { name: 'Aumentar' }).click();
  await shot(cli, '02-opcoes');
  const addBtnText = await cli.locator('button', { hasText: 'Adicionar' }).filter({ hasText: 'R$' }).innerText();
  check('Painel mostra o total da escolha (2 × (25 + 5) = R$ 60)', /60,00/.test(addBtnText), addBtnText.replace(/\s+/g, ' '));
  await cli.locator('button', { hasText: 'Adicionar' }).filter({ hasText: 'R$' }).click();
  await cli.goto(`${APP}/carrinho`);
  await cli.waitForTimeout(800);
  check('Carrinho mostra tamanho e adicional', await cli.getByText('Marmita (Grande)').isVisible() && await cli.getByText('+ Bacon').isVisible());
  await cli.fill('input[placeholder="Nome"]', 'Maria Cliente');
  await cli.fill('input[placeholder="WhatsApp / telefone"]', '67977776666');
  await cli.fill('input[placeholder="Endereço completo (rua, número, bairro)"]', 'Rua das Palmeiras, 80, Centro');
  await shot(cli, '03-carrinho');
  await cli.getByRole('button', { name: /Fazer pedido/ }).click();
  await cli.waitForURL(/\/pedido\//, { timeout: 10000 });
  await cli.waitForTimeout(1500);
  const o1 = await one("select o.id, o.subtotal, o.total, i.variant_name, i.addons from orders o join order_items i on i.order_id = o.id where o.customer_name = 'Maria Cliente' order by o.created_at desc limit 1");
  check('Servidor cobra tamanho + adicional (subtotal R$ 60)', o1?.subtotal === '60.00', JSON.stringify(o1));
  check('Pedido grava o tamanho e o adicional escolhidos', o1?.variant_name === 'Grande' && JSON.stringify(o1?.addons).includes('Bacon'));
  check('Cliente vê a chave Pix da loja no pedido', await cli.getByText('pix@marmitaria.test').isVisible());
  await shot(cli, '04-pedido-pix');

  // ---------- Lojista vê o adicional e o alerta
  await dono.goto(`${APP}/lojista`);
  await dono.waitForTimeout(2000);
  check('Painel do lojista pede para ativar os alertas', await dono.getByText('Toque aqui para ativar os alertas').isVisible());
  check('Lojista vê o adicional no pedido (cozinha não erra)', await dono.getByText('+ Bacon').first().isVisible());
  await shot(dono, '05-lojista');

  // ---------- Cliente cancela um pedido ainda não aceito
  await cli.goto(`${APP}/loja/${st.id}`);
  await cli.waitForTimeout(1200);
  await cli.locator('div.flex.gap-5', { has: cli.locator('h4', { hasText: /^Refrigerante$/ }) }).getByRole('button', { name: 'Adicionar' }).click();
  await cli.goto(`${APP}/carrinho`);
  await cli.waitForTimeout(1200);
  check('Checkout já vem com nome e telefone salvos na conta', (await cli.inputValue('input[placeholder="Nome"]')) === 'Maria Cliente' && (await cli.inputValue('input[placeholder="WhatsApp / telefone"]')) === '67977776666');
  check('Checkout já vem com o endereço salvo', (await cli.inputValue('input[placeholder="Endereço completo (rua, número, bairro)"]')).includes('Palmeiras'));
  await cli.getByRole('button', { name: /Fazer pedido/ }).click();
  await cli.waitForURL(/\/pedido\//, { timeout: 10000 });
  await cli.waitForTimeout(1200);
  cli.once('dialog', (d) => d.accept());
  await cli.getByRole('button', { name: 'Cancelar pedido' }).click();
  await cli.waitForTimeout(1500);
  const o2 = await one("select status from orders where customer_name = 'Maria Cliente' order by created_at desc limit 1");
  check('Cliente cancela o pedido antes do aceite', o2?.status === 'CANCELLED', JSON.stringify(o2));

  // ---------- Perfil salvo na conta
  await cli.goto(`${APP}/perfil`);
  await cli.waitForTimeout(1500);
  check('Perfil mostra o endereço usado no pedido', await cli.getByText('Rua das Palmeiras, 80, Centro').isVisible());
  await cli.fill('input[inputmode="tel"]', '67900001111');
  await cli.getByRole('button', { name: 'Salvar dados' }).click();
  await cli.waitForTimeout(1200);
  const prof = await one("select p.phone from profiles p join auth.users u on u.id = p.id where u.email = 'maria@cliente.test'");
  check('Telefone do perfil fica salvo no sistema, não só no celular', prof?.phone === '67900001111', JSON.stringify(prof));
  await shot(cli, '06-perfil');

  // ---------- Registro de erros
  await cli.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { error: new Error('teste-e2e: erro de propósito'), message: 'teste-e2e' })));
  await cli.waitForTimeout(1500);
  const err = await one("select message from client_errors where message like 'teste-e2e%'");
  check('Erro no celular do cliente fica registrado', !!err, JSON.stringify(err));
  const adm = await person('admin');
  await register(adm, 'admin@vizinho.test');
  await db.query("insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = 'admin@vizinho.test'");
  await adm.goto(`${APP}/admin-dashboard`);
  await adm.waitForTimeout(2000);
  check('Admin vê o erro no painel', await adm.getByText('teste-e2e: erro de propósito').isVisible());

  // ---------- Excluir conta pela página web
  const sai = await person('quer-sair');
  await register(sai, 'sair@cliente.test');
  await sai.goto(`${APP}/excluir-conta`);
  await sai.waitForTimeout(1200);
  await shot(sai, '07-excluir');
  const btn = sai.getByRole('button', { name: 'Excluir minha conta' });
  check('Botão de excluir só libera depois de digitar EXCLUIR', await btn.isDisabled());
  await sai.fill('input[placeholder="EXCLUIR"]', 'excluir');
  await btn.click();
  await sai.waitForTimeout(1500);
  check('Conta excluída de verdade', Number((await one("select count(*) c from auth.users where email = 'sair@cliente.test'")).c) === 0);
  check('Tela confirma a exclusão', await sai.getByText('Conta excluída').isVisible());
} catch (e) {
  check('Roteiro completo sem travar', false, e.message.split('\n').slice(0, 3).join(' / '));
  for (const [n, p] of pages) { await p.screenshot({ path: `${shots}/b1-falha-${n}.png`, fullPage: true }).catch(() => {}); console.log('url', n, p.url()); }
}

check('Nenhum erro de JavaScript nas telas', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); await db.end();
const ok = results.filter((r) => r.pass).length;
console.log(`\n${ok}/${results.length} verificações passaram`);
process.exit(ok === results.length ? 0 : 1);
