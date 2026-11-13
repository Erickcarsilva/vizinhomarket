// Testes de serviços profissionais, atributos por categoria e LGPD.
// Uso: node supabase/tests/servicos.mjs
import { setupDb, baseScenario } from './lib.mjs';

const t = await setupDb();
const { q, as, su, ok, fails, eq, mk } = t;
const { admin, city, bairro, mkStore } = await baseScenario(t);
const P = await mkStore('eletricista', 'Elétrica do Zé', 'servicos');
const E = await mkStore('donoEletro', 'Eletro Center', 'eletronicos');
const M = await mkStore('donoMercado', 'Mercado', 'mercado');
const cust = await mk('cliente'), outro = await mk('outro');
await as(cust);
const [{ id: addr }] = await q("insert into public.addresses (user_id, line, city_id, neighborhood_id) values ($1, 'Rua X, 1', $2, $3) returning id", [cust.id, city, bairro]);

// ---------- Atributos por categoria ----------
await as(E.owner);
await ok('Produto de eletrônicos com atributos válidos é salvo', async () => {
  await q(`insert into public.products (store_id, name, price, attributes) values ($1, 'Liquidificador', 150, '{"marca":"Arno","voltagem":"220V","garantia_meses":12}')`, [E.id]);
  return true;
});
await fails('Opção fora da lista é recusada', () => q(`insert into public.products (store_id, name, price, attributes) values ($1, 'X', 1, '{"voltagem":"380V"}')`, [E.id]), 'opção válida');
await fails('Número fora do limite é recusado', () => q(`insert into public.products (store_id, name, price, attributes) values ($1, 'X', 1, '{"garantia_meses":999}')`, [E.id]), 'fora do permitido');
await fails('Atributo que não existe na categoria é recusado', () => q(`insert into public.products (store_id, name, price, attributes) values ($1, 'X', 1, '{"cor":"azul"}')`, [E.id]), 'não existe');
await fails('Tipo errado é recusado', () => q(`insert into public.products (store_id, name, price, attributes) values ($1, 'X', 1, '{"marca":123}')`, [E.id]), 'inválido');
await as(M.owner);
await ok('Categoria sem atributos aceita produto sem atributos', async () => { await q("insert into public.products (store_id, name, price) values ($1, 'Arroz', 20)", [M.id]); return true; });
await as(E.owner);
await fails('Lojista não altera o esquema da categoria', () => q(`select public.admin_upsert_category('{"name":"Hack"}'::jsonb)`), 'administrador');
await as(admin);
await ok('Admin cria categoria nova com atributo obrigatório', async () => {
  await q(`select public.admin_upsert_category($1::jsonb)`, [JSON.stringify({ name: 'Ótica', active: true, attributes_schema: [{ key: 'grau', label: 'Grau', type: 'text', required: true }] })]);
  return eq((await q("select count(*) c from public.categories where slug = 'otica'"))[0].c, 1);
});
await fails('Admin não cadastra atributo malformado', () => q(`select public.admin_upsert_category($1::jsonb)`, [JSON.stringify({ name: 'Y', attributes_schema: [{ key: 'X Y', label: '', type: 'foo' }] })]), 'Atributo inválido');
await as(null);
await ok('Configuração pública disponível sem login e sem dados sensíveis', async () => {
  const [{ r }] = await q('select public.public_config() r');
  return r.online_payments_enabled === false && !('cron_secret' in r) && r.refund_window_days === 7;
});

// ---------- Serviços ----------
let off, req;
await as(P.owner);
await ok('Prestador cadastra serviço', async () => {
  off = (await q("insert into public.service_offerings (store_id, name, price_from, price_unit) values ($1, 'Instalação de chuveiro', 80, 'visita') returning id", [P.id]))[0].id;
  return true;
});
await as(E.owner);
await fails('Outra loja não cadastra serviço no prestador', () => q("insert into public.service_offerings (store_id, name) values ($1, 'Invasão')", [P.id]), 'row-level security');
await as(null);
await ok('Visitante vê os serviços do prestador aprovado', async () => eq((await q('select count(*) c from public.service_offerings'))[0].c, 1));
await as(cust);
await fails('Carrinho não vale para prestador de serviço', async () => {
  return q("select public.create_order($1, '[]'::jsonb, 'pickup', 'pix', 'svc-cart-0001', 'Cliente', '67999990000')", [P.id]);
}, 'orçamento|fechada|itens');
await fails('Pedido de orçamento sem descrição suficiente é recusado', () => q("select public.request_service($1, $2, 'curto', null, 'Cliente', '67999990000', $3)", [P.id, off, addr]), '10 letras');
await fails('Loja de produtos não recebe pedido de orçamento', () => q("select public.request_service($1, null, 'Preciso de algo grande aqui', null, 'Cliente', '67999990000', null)", [M.id]), 'carrinho');
await ok('Cliente pede orçamento com endereço', async () => {
  req = (await q("select public.request_service($1, $2, 'Trocar chuveiro queimado no banheiro', 'Sábado de manhã', 'Cliente', '67999990000', $3) id", [P.id, off, addr]))[0].id;
  return true;
});
await as(P.owner);
await ok('Prestador vê o pedido, mas não o telefone nem o endereço antes do aceite', async () => {
  const [r] = await q('select id, status, description from public.service_requests where id = $1', [req]);
  eq(r.status, 'REQUESTED');
  try { await q('select address_line from public.service_requests'); return false; } catch (e) { return /permission denied/.test(e.message); }
});
await fails('Prestador não lê o telefone direto na tabela', () => q('select customer_phone from public.service_requests'), 'permission denied');
await fails('Contato só depois do aceite', () => q('select public.service_customer_contact($1)', [req]), 'depois que o cliente aceitar');
await as(E.owner);
await ok('Outra loja não vê o pedido de serviço', async () => eq((await q('select count(*) c from public.service_requests'))[0].c, 0));
await fails('Outra loja não manda proposta', () => q("select public.service_quote($1, 10, null)", [req]), 'não encontrado');
await as(P.owner);
await fails('Proposta com valor inválido é recusada', () => q("select public.service_quote($1, 0, null)", [req]), 'inválido');
await ok('Prestador envia proposta', async () => { await q("select public.service_quote($1, 150, 'Inclui mão de obra', 3)", [req]); return true; });
await as(outro);
await fails('Outro cliente não aceita a proposta alheia', () => q('select public.service_accept_quote($1)', [req]), 'não encontrado');
await fails('Outro cliente não manda mensagem na conversa alheia', () => q("select public.service_message($1, 'oi')", [req]), 'não encontrado');
await as(cust);
await ok('Cliente conversa com o prestador', async () => { await q("select public.service_message($1, 'Pode trazer o chuveiro?')", [req]); return true; });
await ok('Cliente aceita: comissão congelada sobre o valor da proposta', async () => {
  await q('select public.service_accept_quote($1)', [req]);
  await su();
  const [r] = await q('select status, commission_amount from public.service_requests where id = $1', [req]);
  eq(r.status, 'ACCEPTED'); return eq(r.commission_amount, '15.00');
});
await as(P.owner);
await ok('Depois do aceite o prestador vê o contato', async () => { const [{ r }] = await q('select public.service_customer_contact($1) r', [req]); return eq(r.phone, '67999990000'); });
await fails('Agendamento em data absurda é recusado', () => q("select public.service_schedule($1, now() + interval '2 years')", [req]), 'Data inválida');
await ok('Prestador agenda e conclui; comissão vai para o razão', async () => {
  await q("select public.service_schedule($1, now() + interval '2 days')", [req]);
  await q('select public.service_complete($1)', [req]);
  await su();
  const [{ s }] = await q("select sum(amount) s from public.ledger_entries where service_request_id = $1 and account = 'store_receivable'", [req]);
  eq(s, '15.00');
  return eq((await q('select coalesce(sum(amount),0) s from public.ledger_entries'))[0].s, '0.00');
});
await fails('Concluir de novo é recusado', async () => { await as(P.owner); return q('select public.service_complete($1)', [req]); }, 'Só serviços aceitos');
await as(cust);
await ok('Cliente avalia o serviço e a nota da loja é atualizada', async () => {
  await q("select public.service_rate($1, 5, 'Rápido e limpo')", [req]);
  await su(); return eq((await q('select rating_avg from public.stores where id = $1', [P.id]))[0].rating_avg, '5.00');
});
await fails('Não avalia duas vezes', async () => { await as(cust); return q('select public.service_rate($1, 1)', [req]); }, 'já avaliado');
await as(admin);
await ok('Fatura do prestador inclui a comissão do serviço', async () => {
  await q("select public.admin_generate_invoices('2000-01-01', (now() + interval '1 day')::date)");
  return eq((await q('select commission_total from public.invoices where store_id = $1', [P.id]))[0].commission_total, '15.00');
});
await ok('Proposta vencida expira e não pode ser aceita', async () => {
  await as(cust);
  const [{ id }] = await q("select public.request_service($1, null, 'Instalar ventilador de teto', null, 'Cliente', '67999990000') id", [P.id]);
  await as(P.owner); await q("select public.service_quote($1, 90, null, 1)", [id]);
  await su(); await q("update public.service_requests set quote_valid_until = now() - interval '1 hour' where id = $1", [id]);
  await as(cust);
  try { await q('select public.service_accept_quote($1)', [id]); return false; } catch (e) { return /venceu/.test(e.message); }
});

// ---------- LGPD ----------
await as(cust);
await ok('Titular registra consentimento e exporta os próprios dados', async () => {
  await q("select public.record_consent('privacy', '2026-11', true)");
  const [{ r }] = await q('select public.export_my_data() r');
  eq(r.account.email, 'cliente@teste.local'); eq(r.service_requests.length, 2); eq(r.addresses.length, 1);
  return r.consents.length === 1;
});
await as(outro);
await ok('Exportação de outra pessoa não traz dados do cliente', async () => {
  const [{ r }] = await q('select public.export_my_data() r');
  return r.service_requests.length === 0 && r.addresses.length === 0 && r.account.email === 'outro@teste.local';
});
await as(null);
await fails('Visitante não exporta dados', () => q('select public.export_my_data()'), 'permission denied');
await as(cust);
await ok('Exclusão da conta anonimiza pedidos de serviço e mensagens', async () => {
  await q('select public.delete_my_account()');
  await su();
  const [r] = await q('select customer_id, customer_phone, description from public.service_requests where id = $1', [req]);
  eq(r.customer_id, null); eq(r.customer_phone, null);
  eq((await q("select count(*) c from public.service_messages where request_id = $1 and body = 'Pode trazer o chuveiro?'", [req]))[0].c, 0);
  return eq((await q("select count(*) c from auth.users where email = 'cliente@teste.local'"))[0].c, 0);
});

process.exit(t.report() ? 0 : 1);
