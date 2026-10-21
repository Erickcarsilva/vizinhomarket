#!/bin/bash
# Ensaio de backup e restauração com permissões, num Postgres LOCAL descartável (não toca no Supabase).
# 1) cria um banco "origem" com todas as migrações e alguns dados;
# 2) faz o backup como o workflow faz (papéis + estrutura com permissões + dados);
# 3) restaura num servidor novo ("projeto novo") e compara permissões, regras (RLS) e dados;
# 4) repete com o método antigo (--no-privileges) para mostrar o que se perdia.
# Uso: bash e2e/backup-restauracao.sh   (variáveis: PGBIN, VM_REPO, WORK)
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
REPO=${VM_REPO:-$(cd "$(dirname "$0")/.." && pwd)}
WORK=${WORK:-/srv/vm-e2e/ensaio-backup}
P1=54401; P2=54402; P3=54403
as_pg() { su postgres -s /bin/bash -c "$*"; }
q() { psql -h /tmp -p "$1" -U postgres -d "$2" -v ON_ERROR_STOP=1 -Atq -c "$3"; }

for p in $P1 $P2 $P3; do as_pg "$PGBIN/pg_ctl -D $WORK/c$p stop -m fast" >/dev/null 2>&1 || true; done
rm -rf "$WORK"; mkdir -p "$WORK/out"; chown -R postgres "$WORK"
for p in $P1 $P2 $P3; do
  as_pg "$PGBIN/initdb -D $WORK/c$p -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
  as_pg "$PGBIN/pg_ctl -D $WORK/c$p -o '-p $p -k /tmp' -l $WORK/c$p.log -w start" >/dev/null
done

# ---------- 1. Origem ----------
q $P1 postgres "create database vm"
psql -h /tmp -p $P1 -U postgres -d vm -v ON_ERROR_STOP=1 -q -f "$REPO/e2e/bootstrap.sql" >/dev/null
for f in $(ls "$REPO"/supabase/migrations/*.sql | grep -v supabase_platform | sort); do
  psql -h /tmp -p $P1 -U postgres -d vm -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
q $P1 vm "insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'dono@teste.local'), ('00000000-0000-0000-0000-000000000002', 'cliente@teste.local');
  insert into public.stores (city_id, category_id, name, slug, created_by, status)
  select c.id, k.id, 'Loja Ensaio', 'loja-ensaio', '00000000-0000-0000-0000-000000000001', 'approved'
  from public.cities c, public.categories k where k.slug = 'mercado';
  insert into public.products (store_id, name, price, stock) select id, 'Arroz 5kg', 25.9, 10 from public.stores;"

# ---------- 2. Backup (igual ao workflow: papéis, estrutura com permissões, dados) ----------
as_pg "$PGBIN/pg_dumpall -h /tmp -p $P1 -U postgres --roles-only" > "$WORK/out/roles.sql"
as_pg "$PGBIN/pg_dump -h /tmp -p $P1 -U postgres -d vm --schema-only --schema=public" > "$WORK/out/schema.sql"
as_pg "$PGBIN/pg_dump -h /tmp -p $P1 -U postgres -d vm --data-only --schema=public --schema=auth" > "$WORK/out/data.sql"
as_pg "$PGBIN/pg_dump -h /tmp -p $P1 -U postgres -d vm --schema-only --schema=public --no-owner --no-privileges" > "$WORK/out/schema_metodo_antigo.sql"
ls -l "$WORK/out" | awk 'NR>1{print "  backup:", $9, $5, "bytes"}'

# ---------- 3. Restauração num "projeto novo" ----------
# Um projeto novo do Supabase já vem com os papéis e os esquemas auth/storage; aqui o bootstrap faz esse papel.
restore() { # porta, arquivo de estrutura
  q $1 postgres "create database vm"
  psql -h /tmp -p $1 -U postgres -d vm -v ON_ERROR_STOP=1 -q -f "$REPO/e2e/bootstrap.sql" >/dev/null
  psql -h /tmp -p $1 -U postgres -d vm -q -c "drop schema public cascade;" >/dev/null
  psql -h /tmp -p $1 -U postgres -d vm --single-transaction -v ON_ERROR_STOP=1 -q \
    -f "$2" -c "set session_replication_role = replica" -f "$WORK/out/data.sql" >/dev/null 2>"$WORK/restore-$1.err" || { echo "  restauração falhou:"; head "$WORK/restore-$1.err"; }
}
restore $P2 "$WORK/out/schema.sql"
restore $P3 "$WORK/out/schema_metodo_antigo.sql"

# ---------- 4. Comparação ----------
GR="select count(*)||'/'||md5(string_agg(x, ',' order by x)) from (select format('%s:%s:%s', table_name, grantee, privilege_type) x from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')) t"
CG="select count(*) from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated')"
FN="select count(*) from information_schema.routine_privileges where routine_schema='public' and grantee in ('anon','authenticated')"
POL="select count(*) from pg_policies where schemaname='public'"
RLS="select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity"
DATA="select (select count(*) from public.stores)||'/'||(select count(*) from public.products)||'/'||(select count(*) from public.categories)||'/'||(select count(*) from auth.users)"
ANON="set role anon; select count(*) from public.orders"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASSOU  $1"; pass=$((pass+1)); else echo "FALHOU  $1  →  esperado [$2], obtido [$3]"; fail=$((fail+1)); fi; }
check "Permissões por tabela iguais (anon/authenticated)" "$(q $P1 vm "$GR")" "$(q $P2 vm "$GR")"
check "Permissões por coluna iguais ($(q $P1 vm "$CG") regras)" "$(q $P1 vm "$CG")" "$(q $P2 vm "$CG")"
check "Permissões de funções iguais ($(q $P1 vm "$FN") regras)" "$(q $P1 vm "$FN")" "$(q $P2 vm "$FN")"
check "Regras de acesso (RLS) iguais ($(q $P1 vm "$POL") políticas)" "$(q $P1 vm "$POL")" "$(q $P2 vm "$POL")"
check "RLS ligado nas mesmas tabelas ($(q $P1 vm "$RLS"))" "$(q $P1 vm "$RLS")" "$(q $P2 vm "$RLS")"
check "Dados iguais (lojas/produtos/categorias/contas)" "$(q $P1 vm "$DATA")" "$(q $P2 vm "$DATA")"
check "Visitante continua sem ver pedidos" "ERRO" "$(q $P2 vm "$ANON" >/dev/null 2>&1 && echo LIBERADO || echo ERRO)"
check "Visitante continua sem ver dados pessoais da loja (coluna)" "ERRO" "$(q $P2 vm "set role anon; select owner_phone from public.stores" >/dev/null 2>&1 && echo LIBERADO || echo ERRO)"
check "Visitante vê as categorias ativas (vitrine funciona)" "7" "$(q $P2 vm "set role anon; select count(*) from public.categories")"
echo "-- método antigo (--no-privileges), só para comparação:"
echo "   permissões por coluna: $(q $P3 vm "$CG") (origem: $(q $P1 vm "$CG"))  ·  funções liberadas: $(q $P3 vm "$FN") (origem: $(q $P1 vm "$FN"))"
echo "   visitante vê categorias: $(q $P3 vm "set role anon; select count(*) from public.categories" >/dev/null 2>&1 && echo sim || echo 'NÃO (permissão negada: a vitrine quebraria)')"
for p in $P1 $P2 $P3; do as_pg "$PGBIN/pg_ctl -D $WORK/c$p stop -m fast" >/dev/null 2>&1 || true; done
echo; echo "$pass/$((pass+fail)) verificações passaram"
[ $fail = 0 ]
