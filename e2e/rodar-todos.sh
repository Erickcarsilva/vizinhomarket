#!/bin/bash
# Roda todas as suítes ponta a ponta, cada uma num banco de teste recém-criado.
# Pré-requisitos: Postgres de teste no ar (VM_PG_*), sites gerados (build-e2e.sh) e servidos nas portas 4173/4174/4175,
# binário do PostgREST (VM_POSTGREST) e dependências instaladas (npm ci nesta pasta).
# Uso: bash e2e/rodar-todos.sh [pasta para prints]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
SHOTS=${1:-$HERE/prints}
mkdir -p "$SHOTS"
SUITES=${VM_SUITES:-"pedido-completo bloco1 admin telas"}
status=0
restart_api() {
  pkill -f "node $HERE/server.mjs" 2>/dev/null; pkill -x postgrest 2>/dev/null; sleep 1
  node "$HERE/apply.mjs" "$REPO" >/dev/null || { echo "falhou ao criar o banco de teste"; exit 1; }
  nohup node "$HERE/server.mjs" "${VM_POSTGREST:-postgrest}" > "$SHOTS/server.log" 2>&1 &
  for i in $(seq 1 30); do curl -sf "${VM_URL_API:-http://localhost:54321}/anon-key" >/dev/null && return 0; sleep 1; done
  echo "API de teste não respondeu"; cat "$SHOTS/server.log"; exit 1
}
for s in $SUITES; do
  echo "== $s"
  restart_api
  node "$HERE/$s.mjs" "$SHOTS" > "$SHOTS/$s.txt" 2>&1; rc=$?
  grep -E "FALHOU|verificações" "$SHOTS/$s.txt" || tail -5 "$SHOTS/$s.txt"
  [ $rc = 0 ] || status=1
done
echo "== travas do script de zerar"
restart_api
node "$HERE/zerar-trava.mjs" > "$SHOTS/zerar-trava.txt" 2>&1; rc=$?
grep -E "FALHOU|verificações" "$SHOTS/zerar-trava.txt" || tail -5 "$SHOTS/zerar-trava.txt"
[ $rc = 0 ] || status=1
pkill -f "node $HERE/server.mjs" 2>/dev/null; pkill -x postgrest 2>/dev/null
exit $status
