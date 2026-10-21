// Servidor de teste ponta a ponta que imita a API do Supabase em http://localhost:54321
//   /rest/v1/*  → PostgREST (o mesmo motor que o Supabase usa) sobre o Postgres local
//   /auth/v1/*  → login simulado (só para testes: aceita qualquer código de verificação)
// Uso: node server.mjs <caminho do binário postgrest>
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const SECRET = 'segredo-de-teste-local-com-mais-de-32-caracteres';
const PGRST_PORT = 3001;
const PORT = 54321;

export const anonKey = jwt.sign({ role: 'anon', iss: 'vm-e2e' }, SECRET, { expiresIn: '10y' });

const pgrst = spawn(process.argv[2], [], {
  env: {
    ...process.env,
    PGRST_DB_URI: 'postgres://authenticator:authpass@localhost:54329/vm',
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: SECRET,
    PGRST_SERVER_PORT: String(PGRST_PORT),
    PGRST_DB_CHANNEL_ENABLED: 'false',
  },
  stdio: 'inherit',
});
process.on('exit', () => pgrst.kill());

const db = new pg.Pool({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'vm' });
const users = new Map(); // email -> { id, password, data }

const userObj = (u, email) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(),
  user_metadata: u.data || {}, app_metadata: { provider: 'email', providers: ['email'] }, created_at: new Date().toISOString(),
});
const session = (email) => {
  const u = users.get(email);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: jwt.sign({ sub: u.id, role: 'authenticated', email, aud: 'authenticated', exp }, SECRET),
    token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${email}`, user: userObj(u, email),
  };
};
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok({}); } }); });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, x-supabase-api-version, range',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range, content-location',
};
const send = (res, code, obj) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
const authErr = (res, msg, code = 400) => send(res, code, { code, error_code: 'bad_request', msg, message: msg });

async function auth(req, res, path) {
  const url = new URL(req.url, 'http://x');
  const b = req.method === 'GET' ? {} : await body(req);
  if (path === '/signup') {
    if (users.has(b.email)) return authErr(res, 'User already registered', 422);
    const { rows } = await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [b.email, b.data || {}]);
    users.set(b.email, { id: rows[0].id, password: b.password, data: b.data || {} });
    return send(res, 200, session(b.email));
  }
  if (path === '/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = users.get(b.email);
      if (!u || u.password !== b.password) return authErr(res, 'Invalid login credentials');
      const { rows: [ban] } = await db.query('select banned_until > now() as banned from auth.users where id = $1', [u.id]);
      if (ban?.banned) return authErr(res, 'User is banned', 400);
      await db.query('update auth.users set last_sign_in_at = now() where id = $1', [u.id]);
      return send(res, 200, session(b.email));
    }
    if (grant === 'refresh_token') return send(res, 200, session(String(b.refresh_token).slice(2)));
  }
  if (path === '/verify') return users.has(b.email) ? send(res, 200, session(b.email)) : authErr(res, 'Token has expired or is invalid');
  if (path === '/user') {
    try {
      const t = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
      if (!t.sub) throw new Error('anon');
      const email = t.email;
      if (req.method === 'PUT') { if (b.password) users.get(email).password = b.password; }
      return send(res, 200, userObj(users.get(email), email));
    } catch { return authErr(res, 'invalid JWT', 401); }
  }
  if (['/logout', '/recover', '/resend', '/otp'].includes(path)) return send(res, path === '/logout' ? 204 : 200, path === '/logout' ? undefined : {});
  return authErr(res, `não implementado no teste: ${path}`, 404);
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/auth/v1')) return auth(req, res, u.pathname.slice('/auth/v1'.length)).catch((e) => authErr(res, e.message, 500));
  if (u.pathname.startsWith('/rest/v1')) {
    const headers = { ...req.headers, host: `localhost:${PGRST_PORT}` };
    const p = http.request({ host: 'localhost', port: PGRST_PORT, method: req.method, path: req.url.replace('/rest/v1', '') || '/', headers }, (r) => {
      const h = { ...r.headers };
      for (const k of Object.keys(h)) if (k.startsWith('access-control-')) delete h[k];
      res.writeHead(r.statusCode, { ...h, ...cors });
      r.pipe(res);
    });
    p.on('error', (e) => send(res, 502, { message: e.message }));
    return req.pipe(p);
  }
  if (u.pathname === '/anon-key') return send(res, 200, { anonKey });
  send(res, 404, { message: 'não encontrado' });
}).listen(PORT, () => console.log(`API de teste em http://localhost:${PORT}  anonKey=${anonKey}`));
