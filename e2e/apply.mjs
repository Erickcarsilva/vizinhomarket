// Aplica bootstrap + migrações num Postgres local (porta 54329) para o teste ponta a ponta.
// Uso: node apply.mjs <raiz do repositório vizinhomarket>
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const conn = (database) => new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database });

const c = conn('postgres');
await c.connect();
await c.query('drop database if exists vm with (force)');
await c.query('create database vm');
await c.end();

const d = conn('vm');
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
console.log('banco vm pronto');
