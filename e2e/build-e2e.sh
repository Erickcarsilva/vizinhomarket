#!/bin/bash
# Gera os três sites apontando para a API de teste local (porta 54321).
set -e
cd /home/claude/vizinhomarket/apps/web
set -a; source .env.e2e.local; set +a
for m in cliente parceiro admin; do
  npx vite build --mode $m --outDir /srv/vm-e2e/dist-$m --emptyOutDir 2>&1 | grep -E "built|rror"
done
