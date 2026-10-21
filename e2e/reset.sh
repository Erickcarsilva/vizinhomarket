#!/bin/bash
# Prepara o ambiente de teste ponta a ponta: Postgres, banco zerado, API simulada e app.
cd /srv/vm-e2e
PGBIN=/srv/vm-e2e/node_modules/@embedded-postgres/linux-x64/native/bin
if ! su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D /srv/vm-e2e/pgdata status" >/dev/null 2>&1; then
  rm -f pgdata/postmaster.pid
  su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D /srv/vm-e2e/pgdata -o '-p 54329 -k /tmp' -l /srv/vm-e2e/pg.log start" >/dev/null
  sleep 3
fi
ps aux | grep -E "node server.mjs|/postgrest" | grep -v grep | awk '{print $2}' | xargs -r kill
sleep 1
node apply.mjs /home/claude/vizinhomarket >/dev/null
nohup node server.mjs /srv/vm-e2e/postgrest > server.log 2>&1 &
if ! ps aux | grep -q "[v]ite preview"; then
  (cd /home/claude/vizinhomarket/apps/web && nohup npx vite preview --outDir /srv/vm-e2e/dist --port 4173 --host > /srv/vm-e2e/preview.log 2>&1 &)
fi
sleep 4
rm -f shots/*.png
