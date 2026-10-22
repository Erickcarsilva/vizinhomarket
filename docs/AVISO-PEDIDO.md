# Aviso de pedido novo com o painel fechado (Web Push)

O comerciante recebe uma notificação no celular ou no computador quando chega pedido, mesmo com o painel
fechado. Tocar no aviso abre o painel.

## Como funciona
1. No Painel do Comerciante → **Alertas** → "Aviso com o painel fechado" → **Ligar** (ou ao tocar em
   "ativar alertas" na tela de pedidos). O aparelho fica guardado na conta (tabela `push_tokens`).
2. Quando entra um pedido, o banco chama a função `novo-pedido` (gatilho `orders_notify_new`, via pg_net).
3. A função confere o pedido (existe, ainda não aceito, menos de 15 min) e manda o aviso para os aparelhos
   do dono e dos atendentes daquela loja. Aparelho que cancelou a inscrição é removido.
4. Sair da conta no painel desliga o aviso naquele aparelho.

## Onde funciona
| Aparelho | Funciona? |
|---|---|
| Android (Chrome) | Sim |
| Computador (Chrome, Edge, Firefox) | Sim |
| iPhone (iOS 16.4 ou mais novo) | Só se o painel for adicionado à Tela de Início (Compartilhar → Adicionar à Tela de Início) e aberto pelo ícone |

Mesmo com o aviso, o alarme com som que repete só toca com o painel aberto. Para o balcão, o ideal é um
celular ou tablet com o painel aberto e carregando.

## Como ligar na plataforma (uma vez)
1. **Chaves**: no Git Bash, `npx web-push generate-vapid-keys`. Aparecem uma Public Key e uma Private Key.
2. **GitHub** → Settings → Secrets and variables → Actions:
   - Secrets: `SUPABASE_ACCESS_TOKEN` (Supabase → foto do perfil → Access Tokens → Generate new token),
     `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
   - Variables: `SUPABASE_PROJECT_REF` = `ehmgvgzeiqhsjhkzvzsj`, `VAPID_SUBJECT` = `mailto:seu-email`.
3. **GitHub** → Actions → "Publicar funções do Supabase" → Run workflow (fica verde).
4. **Supabase** → SQL Editor → rodar `supabase/deploy/06_aviso_pedido_novo.sql`.
5. **Netlify** → site `vizinhomarket-parceiro` → Environment variables → `VITE_VAPID_PUBLIC_KEY` = a Public Key
   → Deploys → Trigger deploy.

A Private Key nunca vai no Netlify nem no código: só no segredo do GitHub (que passa para o Supabase).

## Testes
`e2e/push.mjs` (regra, envio cifrado de verdade para um serviço de push local, gatilho do banco) e
`e2e/telas.mjs` (ligar/desligar na tela e o service worker mostrar o aviso).
O envio pelo serviço de push real (Google/Apple/Mozilla) só é conferido no aparelho de verdade.
