// Confere os arquivos de instalação (supabase/deploy) num Postgres LOCAL, com imitações mínimas do Supabase
// (área storage e publicação de tempo real). Não toca no Supabase real. O pg_cron (Parte 2) não é rodado aqui.
//   1. banco completo do zero;
//   2. banco como estava no 03 (commit 9924fd3) + atualização 04;
//   3. rodar o 04 duas vezes: a segunda falha inteira, sem gravar nada pela metade.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { PG } from './config.mjs';

const root = process.env.VM_REPO || new URL('..', import.meta.url).pathname;
const dep = (f) => readFileSync(join(root, 'supabase/deploy', f), 'utf8');
const part1 = (sql) => sql.split('-- PARTE 2')[0];
const boot = readFileSync(join(root, 'e2e/bootstrap.sql'), 'utf8').replace(/create role (\w+) ([^;]+);/g, (m, r, rest) =>
  `do $$ begin if not exists (select 1 from pg_roles where rolname = '${r}') then create role ${r} ${rest}; end if; end $$;`);
const stubs = `
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql as $f$ select string_to_array(name, '/') $f$;
  do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;`;
const admin = new pg.Client({ ...PG, database: 'postgres' });
await admin.connect();
async function fresh(name) {
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  const c = new pg.Client({ ...PG, database: name });
  await c.connect();
  await c.query(boot); await c.query(stubs);
  return c;
}
const conf = `select (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE')::int tabelas,
  (select count(*) from public.categories)::int categorias,
  (select count(*) from pg_proc where proname in ('store_summary','store_daily','store_top_products'))::int funcoes_totais,
  (select active from public.categories where slug = 'farmacia') farmacia_ativa,
  (select count(*) from pg_policies where schemaname = 'public')::int politicas,
  (to_regclass('public.favorites') is not null) favoritos,
  (select count(*) from pg_proc where proname in ('admin_add_neighborhoods','admin_set_neighborhood_active','store_set_delivery_zones',
     'store_list_members','store_add_staff','store_remove_staff'))::int funcoes_novas`;
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${n}${d ? '  →  ' + d : ''}`); };
const expected = (r) => r.tabelas === 28 && r.categorias === 9 && r.funcoes_totais === 3 && r.farmacia_ativa === false;
const expected05 = (r) => r.tabelas === 29 && r.categorias === 9 && r.funcoes_totais === 3 && r.farmacia_ativa === false && r.favoritos && r.funcoes_novas === 6;

let c = await fresh('deploy_completo');
try { await c.query(part1(dep('vizinhomarket_banco_completo.sql'))); const r = (await c.query(conf)).rows[0]; check('Banco completo instala do zero', expected05(r), JSON.stringify(r)); }
catch (e) { check('Banco completo instala do zero', false, e.message); }
await c.end();

c = await fresh('deploy_04');
const antigo = execSync(`git show ${process.env.VM_BASE_03 || '9924fd3'}:supabase/deploy/vizinhomarket_banco_completo.sql`, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
await c.query(part1(antigo));
const antes = (await c.query(conf)).rows[0];
check('Banco como estava no 03 (commit 9924fd3) não tem os totais', antes.funcoes_totais === 0 && antes.farmacia_ativa === true, JSON.stringify(antes));
try { await c.query(dep('04_atualizacao_totais_farmacia.sql')); const r = (await c.query(conf)).rows[0]; check('Atualização 04 aplicada sobre o 03', expected(r) && r.politicas === antes.politicas, JSON.stringify(r)); }
catch (e) { check('Atualização 04 aplicada sobre o 03', false, e.message); }
let segunda = null;
try { await c.query(dep('04_atualizacao_totais_farmacia.sql')); } catch (e) { segunda = e.message; await c.query('rollback').catch(() => {}); }
const depois = (await c.query(conf)).rows[0];
check('Rodar o 04 de novo falha sem estragar nada', !!segunda && expected(depois), segunda || 'não falhou');
try { await c.query(dep('05_atualizacao_favoritos_bairros_equipe.sql')); const r = (await c.query(conf)).rows[0]; check('Atualização 05 aplicada sobre o 04', expected05(r), JSON.stringify(r)); }
catch (e) { check('Atualização 05 aplicada sobre o 04', false, e.message); }
const c05 = (await c.query(conf)).rows[0];
let seg05 = null;
try { await c.query(dep('05_atualizacao_favoritos_bairros_equipe.sql')); } catch (e) { seg05 = e.message; await c.query('rollback').catch(() => {}); }
check('Rodar o 05 de novo falha sem estragar nada', !!seg05 && JSON.stringify((await c.query(conf)).rows[0]) === JSON.stringify(c05), seg05 || 'não falhou');
await c.end();
for (const d of ['deploy_completo', 'deploy_04']) await admin.query(`drop database if exists ${d} with (force)`);
await admin.end();
console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(results.every(Boolean) ? 0 : 1);
