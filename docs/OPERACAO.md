# Instalação, operação e manutenção (13/11/2026)

## Rodar no computador
```bash
npm ci && npm run test:db              # 5 suítes do banco (PGlite): segurança, financeiro, gateway, logística, serviços
cd apps/web && npm ci
cp .env.example .env.local             # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do projeto de teste
npm run dev:cliente                    # 5173  (também dev:parceiro 5174, dev:admin 5175, dev:entregador 5176)
```
Testes ponta a ponta e de concorrência (Postgres 16/17 na porta 54329 + PostgREST 12.2.3): ver `e2e/README.md`.
`node e2e/concorrencia.mjs` só precisa do Postgres. No GitHub, tudo roda sozinho a cada envio (`.github/workflows/ci.yml`).

## Colocar uma versão no ar
1. **Banco** (Supabase → SQL Editor):
   - instalação nova: `supabase/deploy/vizinhomarket_banco_completo.sql` (Partes 1 a 4);
   - quem já está no 08: `supabase/deploy/09_atualizacao_marketplace.sql`.
   Os arquivos são gerados por `node supabase/deploy/gerar.mjs` e conferidos no CI (`validar-deploy.mjs`: 10/10).
2. **Funções** (Edge Functions): `novo-pedido`, `pagamentos`, `pagamentos-webhook`, `pagamentos-estornos`.
   O workflow "Publicar funções do Supabase" publica `novo-pedido`; as de pagamento seguem `docs/PAGAMENTOS.md`.
3. **Sites** (Netlify, um site por produto, mesmo repositório): variável `PRODUTO` = `cliente`, `parceiro`, `admin`, `entregador`;
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_URL_*` (endereços dos outros produtos), `VITE_SUPPORT_*`.
4. **Ligar recursos** no Admin → Configurações → Operação (pagamento pelo app, entrega pela plataforma, gateway).

Nada muda para os usuários ao aplicar o 09: pagamento online e entrega pela plataforma ficam desligados até o admin ligar.

## Rotina da operação (painel admin)
| Frequência | Onde | O quê |
|---|---|---|
| Contínuo | Pedidos, Entregas | Pedidos parados, "pronto sem entregador", "entregador sem sinal" → reatribuir |
| Diário | Atendimento, Reembolsos | Responder; decidir reembolsos com justificativa |
| Diário | Pagamentos e conciliação | Zerar pendências; importar o extrato do gateway |
| Semanal | Saldos e repasses | Pagar lojas/entregadores (Pix) e registrar o repasse com o identificador |
| Mensal | Comissões e faturas | Gerar faturas (pedidos pagos na entrega + serviços), cobrar e marcar como pagas |
| Mensal | Erros e histórico | Ler erros do app e a auditoria de ações administrativas |

## Monitoramento e alertas
- **Erros do app**: tabela `client_errors` (tela "Erros e histórico"), apagados em 30 dias.
- **Funções**: logs JSON estruturados (sem dados pessoais) no painel do Supabase → Edge Functions → Logs.
- **Conciliação** é o alarme financeiro: qualquer linha "crítica" (entregue sem lançamento, razão desbalanceado) deve ser investigada no dia.
- **Backup**: o workflow `backup-banco.yml` abre uma *issue* no GitHub se falhar.
- Recomendado ao abrir para o público (não contratado): monitor de disponibilidade (UptimeRobot/Better Stack, plano grátis) nas 4 URLs e
  no endpoint `.../rest/v1/` e alertas de uso do Supabase.

## Backups e recuperação
- Diário pelo GitHub Actions (`backup-banco.yml`, com permissões e SHA256) + backups automáticos do Supabase (plano Pro: 7 dias).
- Procedimento e ensaio: `docs/RESTAURAR.md` e `e2e/backup-restauracao.sh` (9/9 no último ensaio).
- **Pendente**: cadastrar o segredo `SUPABASE_DB_URL` no GitHub para o backup diário rodar; fazer um ensaio de restauração no Supabase real.

## Rollback
- **Sites**: Netlify → Deploys → "Publish deploy" na versão anterior (instantâneo).
- **Funções**: publicar de novo a partir do commit anterior.
- **Banco**: as migrações não apagam dados; funções são substituídas por `create or replace`. Para voltar uma regra, reaplicar a
  definição anterior da função (está no arquivo de migração anterior). Em último caso: restaurar o backup (`RESTAURAR.md`).
- **Chaves de operação**: desligar "Pagamento pelo app" ou "Entrega pela plataforma" no admin volta ao modo anterior na hora.

## Custos estimados (piloto em Sidrolândia) — estimativa, sem contratação feita
| Item | Plano | Custo/mês |
|---|---|---|
| Supabase | Free para homologação; **Pro** para produção (backups, sem pausa) | US$ 25 (~R$ 140) |
| Netlify (4 sites) | Free (100 GB de tráfego) | R$ 0 |
| Domínio .com.br | Registro.br | ~R$ 40/ano |
| E-mail transacional (login/recuperação) | SMTP próprio (ex.: Resend/SES, plano inicial) | R$ 0–60 |
| Gateway | Por transação (ver PAGAMENTOS.md) | variável |
| Mapas | Links para o app de mapas do celular; sem API paga | R$ 0 |
| GitHub (repositório privado + Actions) | Free | R$ 0 |
| **Total fixo** | | **~R$ 150–250/mês** |

Crescimento: Supabase Pro inclui 8 GB de banco e 250 GB de tráfego; a primeira cidade cabe com folga. Próximos degraus: compute maior no
Supabase (US$ 50–100), CDN/Netlify Pro (US$ 19), monitoramento pago.
