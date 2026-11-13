# Arquitetura do VizinhoMarket (13/11/2026)

## Visão geral

```
 App do Cliente (PWA)   Painel do Comerciante   Painel Admin   App do Entregador (PWA)
        \                       |                    |                 /
         \______ mesmo código React (apps/web), 4 builds: --mode cliente|parceiro|admin|entregador
                                |
                     supabase-js (HTTPS, token do usuário)
                                |
      ┌─────────────────────── Supabase (gerenciado) ─────────────────────────┐
      │ Auth (login)   PostgREST (API automática)   Realtime   Storage (fotos) │
      │                                                                      │
      │ PostgreSQL 15/17: tabelas + RLS (quem vê o quê) + funções SQL        │
      │   pedidos, estoque, cupons, razão financeiro, logística, serviços    │
      │ pg_cron: tempo limite de pedidos, estornos, limpezas                 │
      │ Edge Functions (Deno/TypeScript): pagamentos, webhook, estornos, push│
      └──────────────────────────────────────────────────────────────────────┘
                                |
          Gateways (Asaas / Mercado Pago / sandbox)   Web Push (VAPID)
```

## Decisão: backend em PostgreSQL + funções, não um servidor Node próprio

A especificação sugeria "Node.js + TypeScript". O projeto já tinha um backend independente da Base44 no Supabase, com 205 testes,
e mantivemos essa direção porque:

1. **Integridade financeira em uma transação.** Pedido, baixa de estoque, cupom, comissão e lançamento no razão acontecem dentro de
   uma única transação do Postgres, com bloqueio de linha. Se algo falha, nada é gravado. Num servidor Node isso exigiria a mesma lógica
   em SQL transacional de qualquer forma — com uma camada a mais para errar.
2. **Autorização no banco.** RLS + permissões por coluna valem para qualquer cliente (web, app nativo futuro, integrações). Não dá para
   "esquecer o middleware" numa rota nova.
3. **Custo e operação de startup.** Sem servidor para manter, escalar ou corrigir; o plano gratuito/Pro do Supabase cobre o piloto.
4. **Sem aprisionamento.** É PostgreSQL padrão + PostgREST (open source). As migrações rodam em qualquer Postgres 15+ (testado em
   PGlite e Postgres 16/17). Dá para migrar para RDS/Neon + PostgREST próprio, ou colocar um serviço Node na frente, sem reescrever regras.
5. **TypeScript onde há integração externa.** Pagamentos, webhooks e push são Edge Functions em TypeScript/Deno; a regra delas fica em
   módulos `.mjs` sem dependência de Deno, testados em Node contra o banco real.

Quando um serviço próprio fará sentido: roteirização com otimização (muitos entregadores), motor de recomendação, filas pesadas de
notificação. Ele entraria como serviço adicional, chamando as mesmas funções do banco.

### Frontend em JavaScript (JSX), não TypeScript
O código de telas herdado já tinha centenas de componentes em JSX com `jsconfig`/typecheck. Converter para TS agora não muda a
segurança (que está no servidor) e atrasaria o piloto. Recomendação: migrar gradualmente, começando por `src/api/data`.

## Módulos (domínios) e onde estão

| Domínio | Migrações | Testes |
|---|---|---|
| Base: cidades, categorias, lojas, produtos, pedidos, avaliações | `202610140001..4` | `supabase/tests/run.mjs` |
| Segurança (RLS, colunas, funções) | `202610140002`, `202610220005` | `run.mjs` |
| Pedido no servidor, totais, Pix no pedido, idade | `202610230001`, `202611130002` | `run.mjs`, `financeiro.mjs` |
| Financeiro: pagamentos, webhooks, razão, cupons, estornos, repasses, conciliação, suporte | `202611130001..2` | `financeiro.mjs`, `gateway.mjs`, `e2e/concorrencia.mjs` |
| Logística e entregadores | `202611130004` | `logistica.mjs`, `e2e/concorrencia.mjs` |
| Serviços, atributos por categoria, LGPD | `202611130005` | `servicos.mjs` |
| Chaves de operação do admin | `202611130006` | `servicos.mjs` |
| Só Supabase (pg_cron, pg_net, realtime, storage) | `*_supabase_platform_*` | `e2e/validar-deploy.mjs` (parcial) |

## Estados

**Pedido:** `CREATED → ACCEPTED → PREPARING → READY → IN_TRANSIT → DELIVERED`, ou `CANCELLED`. Transições só por função
(`advance_order_status`, `claim_delivery`/`confirm_pickup`, `confirm_delivery` com código, `cancel_order`, `expire_stale_orders`).

**Pagamento (separado do pedido):** `pending` (offline) · `awaiting_payment → paid | failed | expired` (online) · `refunded | partially_refunded`.
Pedido online só pode ser aceito pela loja depois de `paid`.

**Entrega da plataforma:** pedido aceito pela loja vira oferta → entregador aceita (atômico) → loja marca pronto → entregador confirma retirada
(`IN_TRANSIT`) → código do cliente (`DELIVERED`). Problema → atendimento; admin reatribui.

**Serviço:** `REQUESTED → QUOTED → ACCEPTED → SCHEDULED → COMPLETED`, ou `DECLINED | CANCELLED | EXPIRED`.

## Ambientes
| Ambiente | Banco | Sites | Pagamento |
|---|---|---|---|
| Desenvolvimento | PGlite (testes) / Postgres local | `npm run dev:*` (5173–5176) | sandbox |
| Homologação | Supabase `vizinhomarket-teste` | Netlify (4 sites, `PRODUTO=...`) | sandbox do provedor |
| Produção | Supabase de produção (a criar) | Netlify/Cloudflare Pages | provedor real |

Os 4 sites saem do mesmo `netlify.toml`, mudando só a variável `PRODUTO` (cliente, parceiro, admin, entregador).

## Apps nativos no futuro
O backend não muda: um app React Native/Capacitor usa o mesmo supabase-js, as mesmas funções e a mesma RLS. O PWA do entregador
já usa só APIs de navegador (geolocalização com permissão, sem rastreio em segundo plano).
