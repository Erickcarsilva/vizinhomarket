# Testes ponta a ponta

Simulam pessoas usando as telas de verdade (Chromium), contra um Postgres de teste com o mesmo motor de API do
Supabase (PostgREST). **Nunca tocam no Supabase real.**

| Suíte | O que cobre |
|---|---|
| `pedido-completo.mjs` | cadastro de loja → aprovação → produto → pedido → entrega com código → avaliação; fraudes pela API |
| `bloco1.mjs` | alarme de pedido, cancelamento automático, telefone, exclusão de conta |
| `admin.mjs` | painel admin: lojas, comissão, pedidos, faturas, usuários, entregadores, configurações, bloqueio |
| `telas.mjs` | Histórico/Entregas/Relatórios/Comissões com 600+ pedidos (confere com o banco), Busca, Favoritos, Indique loja |
| `zerar-trava.mjs` | as 3 travas do script `supabase/deploy/perigoso/00_zerar_banco_teste.sql` |
| `backup-restauracao.sh` | ensaio de backup e restauração com permissões (precisa de Postgres 16 ou 17 instalado) |

## Rodar
No GitHub isso roda sozinho a cada envio (`.github/workflows/ci.yml`). Para rodar num computador Linux:

1. Postgres 17 na porta 54329 com senha `postgres` (ex.: `docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:17`).
2. Binário do PostgREST 12.2.3 (`VM_POSTGREST=/caminho/postgrest`).
3. `cd e2e && npm ci && npx playwright install chromium`
4. Banco e chave de teste: `node e2e/apply.mjs . && node e2e/server.mjs $VM_POSTGREST` (em outro terminal) e
   `curl localhost:54321/anon-key`.
5. `VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=<chave> VM_E2E_OUT=/tmp/vm bash e2e/build-e2e.sh`
6. Servir os sites: em `apps/web`, `npx vite preview --mode cliente --outDir /tmp/vm/dist-cliente` (e parceiro, admin).
7. `bash e2e/rodar-todos.sh` — cada suíte começa com o banco de teste zerado.

Variáveis (todas opcionais): `VM_PG_HOST`, `VM_PG_PORT`, `VM_PG_PASSWORD`, `VM_DB`, `VM_URL_CLIENTE`, `VM_URL_PARCEIRO`,
`VM_URL_ADMIN`, `VM_URL_API`, `VM_CHROMIUM`, `VM_POSTGREST`, `VM_E2E_OUT`, `VM_SUITES`.

`reset.sh` é o atalho do ambiente de teste usado no desenvolvimento (Postgres embutido em `/srv/vm-e2e`).
