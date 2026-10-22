#!/bin/bash
# Gera os três sites apontando para a API de teste local (server.mjs, porta 54321).
# Variáveis: VM_E2E_OUT (pasta de saída, padrão /srv/vm-e2e), VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
# (se não vierem do ambiente, são lidas de apps/web/.env.e2e.local).
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT=${VM_E2E_OUT:-/srv/vm-e2e}
cd "$REPO/apps/web"
if [ -z "${VITE_SUPABASE_ANON_KEY:-}" ] && [ -f .env.e2e.local ]; then set -a; source .env.e2e.local; set +a; fi
: "${VITE_SUPABASE_URL:?defina VITE_SUPABASE_URL (ex.: http://localhost:54321)}"
: "${VITE_SUPABASE_ANON_KEY:?defina VITE_SUPABASE_ANON_KEY (a chave de teste do server.mjs: curl localhost:54321/anon-key)}"
# Chave pública VAPID de teste (só a pública; o aviso real usa outra, cadastrada no Netlify).
VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY:-BD9kKJ7dHwaZI0w9jrAgX83W_ixa0hiAKjOzWG8xOFy8z3Ajqh5lVW-3rUE1UrudFzf-tIZITN9C7AEorY-5qNg}
export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_VAPID_PUBLIC_KEY
for m in cliente parceiro admin; do
  npx vite build --mode $m --outDir "$OUT/dist-$m" --emptyOutDir 2>&1 | grep -E "built|rror"
done
