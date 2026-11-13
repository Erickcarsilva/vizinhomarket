// Base compartilhada das suítes do banco: monta um Postgres local (PGlite) com as migrações e simula os papéis do Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'migrations');

export async function setupDb() {
  const db = new PGlite();
  const results = [];
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;

  const as = async (user) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user && user.id ? user.id : '']);
    if (user === 'service') { await db.exec('set role service_role'); return; }
    await db.exec(user ? 'set role authenticated' : 'set role anon');
  };
  const su = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); };

  const ok = async (name, fn) => {
    try { const r = await fn(); results.push({ name, pass: r !== false, detail: r === false ? 'condição falsa' : '' }); }
    catch (e) { results.push({ name, pass: false, detail: e.message }); }
  };
  const fails = async (name, fn, match) => {
    try { await fn(); results.push({ name, pass: false, detail: 'deveria ter falhado e passou' }); }
    catch (e) {
      const pass = !match || new RegExp(match, 'i').test(e.message) || new RegExp(match, 'i').test(e.code || '');
      results.push({ name, pass, detail: pass ? e.message : `erro diferente: ${e.message}` });
    }
  };
  const eq = (a, b) => { if (String(a) !== String(b)) throw new Error(`esperado ${b}, obtido ${a}`); return true; };

  await db.exec(readFileSync(join(here, 'shim_supabase_local.sql'), 'utf8'));
  for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql') && !f.includes('supabase_platform')).sort()) {
    await db.exec(readFileSync(join(migDir, f), 'utf8'));
  }

  const mk = async (name) => {
    const [r] = await q("insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id", [`${name}@teste.local`, name]);
    return { id: r.id, name };
  };

  const report = () => {
    const passed = results.filter((r) => r.pass).length;
    for (const r of results) console.log(`${r.pass ? 'PASSOU' : 'FALHOU'}  ${r.name}${r.pass ? '' : '  →  ' + r.detail}`);
    console.log(`\n${passed}/${results.length} testes passaram`);
    return passed === results.length;
  };

  return { db, q, as, su, ok, fails, eq, mk, report, results };
}

// Cenário comum: cidade, bairro, admin, 2 lojas aprovadas abertas 24 h, clientes.
export async function baseScenario(t) {
  const { q, as, su, mk } = t;
  await q("update public.platform_settings set value = 'true' where key = 'platform_delivery_enabled'");
  const admin = await mk('admin');
  await q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [admin.id]);
  const [{ id: city }] = await q("select id from public.cities where slug = 'sidrolandia-ms'");
  const [{ id: bairro }] = await q("insert into public.neighborhoods (city_id, name) values ($1, 'Centro') returning id", [city]);
  const cat = Object.fromEntries((await q('select slug, id from public.categories')).map((r) => [r.slug, r.id]));

  const mkStore = async (ownerName, name, category = 'mercado') => {
    const owner = await mk(ownerName);
    await as(owner);
    const [{ id }] = await q("select public.register_store($1, $2, $3, 'Dono', '67999990000', '12.345.678/0001-90', 'Razão LTDA', null, null, 'Rua A, 1', $4) id", [name, cat[category], city, bairro]);
    await as(admin);
    await q("select public.admin_set_store_status($1, 'approved', 0.10)", [id]);
    await su();
    for (let d = 0; d < 7; d++) await q("insert into public.store_hours (store_id, weekday, opens, closes) values ($1, $2, '00:00', '12:00'), ($1, $2, '12:00', '00:00')", [id, d]);
    await q('update public.stores set accepts_platform_delivery = true, delivery_fee_default = 6 where id = $1', [id]);
    await q("update public.store_private set pix_key = 'chave@loja' where store_id = $1", [id]);
    return { id, owner };
  };
  return { admin, city, bairro, cat, mkStore };
}
