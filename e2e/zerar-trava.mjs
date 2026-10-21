// Confere as 3 travas do script perigoso/00_zerar_banco_teste.sql no banco LOCAL de teste (porta 54329).
// Depois rode reset.sh para reinstalar o banco local.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.VM_REPO || '/home/claude/vizinhomarket';
const base = readFileSync(join(root, 'supabase/deploy/perigoso/00_zerar_banco_teste.sql'), 'utf8');
const c = new pg.Client({ host: 'localhost', port: Number(process.env.VM_PG_PORT || 54329), user: 'postgres', password: 'postgres', database: 'vm' });
await c.connect();
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };
const counts = async () => (await c.query("select (select count(*) from auth.users)::int u, (select count(*) from information_schema.tables where table_schema='public')::int t")).rows[0];
const run = (sql) => c.query(sql).then(() => null, (e) => e.message);
const before = await counts();
if (before.t === 0) throw new Error('banco local vazio: rode reset.sh antes');

await check('Sem marcação de teste: recusa e não apaga nada', async () => {
  await c.query("delete from public.platform_settings where key = 'ambiente'");
  const err = await run(base.replace(":= 'NAO';", ":= 'SIM-APAGAR-TUDO';"));
  if (!/não está marcado como teste/.test(err || '')) throw new Error('não recusou: ' + err);
  const now = await counts(); if (now.t !== before.t || now.u !== before.u) throw new Error('apagou algo');
});
await c.query(`insert into public.platform_settings (key, value) values ('ambiente', '"teste"') on conflict (key) do update set value = excluded.value`);
await check('Marcado como teste mas sem confirmação: recusa', async () => {
  const err = await run(base);
  if (!/confirmação não preenchida/.test(err || '')) throw new Error('não recusou: ' + err);
  if ((await counts()).t !== before.t) throw new Error('apagou algo');
});
await check('Banco com sinais de uso real: recusa sem a 3ª trava', async () => {
  // simula o limite atingido (0 pedidos > -1) sem precisar criar 50 pedidos
  const err = await run(base.replace(":= 'NAO';", ":= 'SIM-APAGAR-TUDO';").replace('v_entregues > 50', 'v_entregues > -1'));
  if (!/parece uso real/.test(err || '')) throw new Error('não recusou: ' + err);
  if ((await counts()).t !== before.t) throw new Error('apagou algo');
});
await check('Com as travas liberadas: zera tabelas e contas', async () => {
  const err = await run(base.replace(":= 'NAO';", ":= 'SIM-APAGAR-TUDO';").replace(':= false;     -- trava 3', ':= true;     -- trava 3'));
  if (err) throw new Error(err);
  const now = await counts(); if (now.t !== 0 || now.u !== 0) throw new Error(JSON.stringify(now));
});
await c.end();
for (const [ok, n, d] of results) console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${n}${ok ? '' : '  →  ' + d}`);
console.log(`\n${results.filter((r) => r[0]).length}/${results.length} verificações passaram`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
