// Aplica bootstrap + migrações num Postgres local para o teste ponta a ponta.
// Uso: node apply.mjs <raiz do repositório vizinhomarket>
// Variáveis opcionais: VM_PG_HOST (localhost), VM_PG_PORT (54329), VM_PG_PASSWORD (postgres), VM_DB (vm).
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || process.env.VM_REPO || '.';
const DB = process.env.VM_DB || 'vm';
const conn = (database) => new pg.Client({ host: process.env.VM_PG_HOST || 'localhost', port: Number(process.env.VM_PG_PORT || 54329), user: 'postgres', password: process.env.VM_PG_PASSWORD || 'postgres', database });

const c = conn('postgres');
await c.connect();
await c.query(`drop database if exists ${DB} with (force)`);
await c.query(`create database ${DB}`);
await c.end();

const d = conn(DB);
await d.connect();
const boot = readFileSync(join(root, 'e2e/bootstrap.sql'), 'utf8')
  .replace(/create role (\w+) ([^;]+);/g, (m, r, rest) =>
    `do $$ begin if not exists (select 1 from pg_roles where rolname = '${r}') then create role ${r} ${rest}; end if; end $$;`);
await d.query(boot);
const mig = join(root, 'supabase/migrations');
for (const f of readdirSync(mig).filter((f) => f.endsWith('.sql') && !f.includes('supabase_platform')).sort()) {
  await d.query(readFileSync(join(mig, f), 'utf8'));
  console.log('migração', f);
}
await d.end();
console.log(`banco ${DB} pronto`);
