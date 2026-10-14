# VizinhoMarket — Registro do projeto

## Fase 1 — Preservação (13/10/2026)

### O que foi feito
- Código completo extraído do Base44 (app `6ab5ce0df5fa2cac604dde04`), somente leitura, pelo visualizador de código do editor. Nada foi alterado no Base44.
- 158 arquivos extraídos. Integridade conferida por SHA-256 do pacote inteiro (igual na origem e no destino): `16e85f3daf38de3a4857e0ea35efdb0c7a2bb7438f3f22aa8add792d8cbc9b5f`.
- Snapshot versionado em git (commit inicial "Snapshot original extraído do Base44").
- Histórico parcial do chat do Base44 (auditorias anteriores) salvo em `docs/historico-chat-base44-parcial.txt`.

### Testes executados
| Teste | Resultado |
|---|---|
| `npm install` | OK (488 pacotes) |
| `npx vite build` | EXIT=0, 2919 módulos, bundle JS de 1,33 MB (392 KB gzip) |

O build compila, mas o app não roda fora do Base44 sem `VITE_BASE44_APP_ID`: login e dados dependem do SDK `@base44/sdk`.

### Inventário
- 33 páginas, 88 componentes.
- Entidades: Order, Product, Store, StoreReferral, User (role só `admin`/`user`).
- Uso do SDK Base44: cerca de 17 chamadas de autenticação, 3 de upload de arquivo, cerca de 43 de dados (15 gravações diretas no banco, 3 assinaturas em tempo real).
- Dados no Base44 em 13/10: 7 lojas, 6 pedidos, 0 indicações (aparentam ser dados de teste). **Dados não exportados nesta fase.**

### Situação da conta Base44
- Plano gratuito, 0 créditos (renovação em 18 dias), edição manual de código bloqueada.
- Scan de segurança desatualizado (não executado nesta fase).
- App publicado como Público.

## Problemas comprovados (ainda não corrigidos)
| # | Gravidade | Problema | Evidência |
|---|---|---|---|
| P1 | Crítico | CPF/CNPJ e nome do dono de toda loja legíveis por qualquer pessoa | `base44/entities/Store.jsonc`: `rls.read = {}` e campo `cnpj_cpf` |
| P2 | Crítico | Entregador comum não consegue assumir entregas: `assume()` não grava `driver_id` e a RLS exige `driver_id = usuário` | `src/pages/Driver.jsx` + RLS de Order |
| P3 | Crítico | Preço, subtotal, total e `store_owner_id` definidos pelo navegador | `src/pages/Checkout.jsx` |
| P4 | Crítico | Lojista ativa a própria assinatura e altera `status`/`trial_ends_at` sem controle | `src/pages/Subscription.jsx` + RLS de Store sem proteção por campo |
| P5 | Alto | Lojista altera qualquer campo dos pedidos da própria loja | RLS de Order (update por `store_owner_id`) |
| P6 | Alto | Não existe papel de entregador | `base44/entities/User.jsonc` |
| P7 | Médio | Endereço do cliente enviado ao Nominatim (OpenStreetMap) | `src/pages/Driver.jsx` |

## Divergências com o plano de negócio
- App cobra mensalidade de R$ 99 após o trial; o plano é comissão sem mensalidade.
- Categorias no banco: alimentação, mercado, pet, autopeças, lojas. Faltam farmácia, eletrônicos e serviços.
- Pagamento só na entrega (Pix, cartão, dinheiro); não há pagamento online.

## Pendente de teste no app rodando
- Avaliação do cliente (provável falha por RLS).
- Fluxo completo cliente → lojista → entrega.

## Decisões
- 13/10: frontend do Base44 será preservado; backend sairá do Base44 (direção: Supabase). Decisão final sobre onde o frontend será editado (Base44 ou aqui) ainda em aberto.

## Fase 1 — Backend seguro (início em 13/10/2026)

### Decisões
- 13/10: produto principal são apps de loja (Cliente, Parceiro, Entregador) + painel Admin web + site de download. Mesmo código (monorepo), Capacitor, Android primeiro.
- 13/10: backend no Supabase. Regras de pedido, status, aceite e cancelamento em funções SQL (uma transação; se algo falha, nada é gravado). Edge Functions só para push, pagamento e integrações.
- 13/10: código de 4 dígitos obrigatório para concluir qualquer entrega ou retirada (protege cliente, loja e entregador).
- 13/10: produto não é apagado fisicamente (deleted_at), para preservar o histórico dos pedidos.
- 13/10: dados fiscais da loja (CPF/CNPJ, responsável, Pix) em tabela separada, visível só para o dono e o admin.
- 13/10: comissão padrão provisória de 8% (pendente de confirmação na tarefa 0.8). Prioridade: comissão da loja > regra da categoria > padrão.
- 13/10: bebidas alcoólicas exigem declaração de maioridade no app e ficam marcadas para conferência na entrega.

### Feito
- Repositório novo `vizinhomarket` com `supabase/` (4 migrações, testes, README).
- Banco multi-cidade e multicategoria: 26 tabelas.
- Corrige P1 (CPF/CNPJ público), P3 (preço no navegador), P4 (lojista se autoaprova/ativa assinatura), P5 (lojista altera valores do pedido), P6 (papel de entregador) e P2 (fluxo do entregador redesenhado com aceite atômico).
- Remove a mensalidade de R$ 99 do modelo (não existe tabela de assinatura; receita por comissão).

### Testes executados
| Teste | Resultado |
|---|---|
| Bateria `npm run test:db` (PGlite, Postgres 18) | 87/87 passaram |
| Teste de mutação: liberar coluna `status` para o lojista | 3 testes falharam, como esperado |
| Teste de mutação: retirar `courier_id is null` do aceite | Nenhum teste falhou: a condição `status = 'READY'` já impede o segundo aceite. A concorrência real é garantida pelo bloqueio de linha do Postgres; não é possível simular duas conexões simultâneas no PGlite |

### Pendências e riscos
- Exportar dados do Base44 (7 lojas, 6 pedidos de teste): exige baixar CSVs pelo botão Exportar, aguardando autorização.
- Bairros de Sidrolândia: cadastrar com lista oficial.
- Testes rodam em PGlite (Postgres 18); o Supabase usa Postgres 15/17. Rodar a bateria no projeto de teste do Supabase antes de produção.
- Ainda não implementado: faturas de comissão (Fase 5), repasse ao entregador, convite de atendente para a loja, notificações push, tempo real.

### Arquivos
- `supabase/migrations/202610140001_base.sql` a `202610140004_reference_data.sql`
- `supabase/tests/run.mjs`, `supabase/tests/shim_supabase_local.sql`, `supabase/README.md`

## Próxima tarefa recomendada
Erick: criar a conta e o projeto de teste no Supabase. Claude: aplicar as migrações no projeto de teste (com aprovação), rodar a bateria lá e iniciar a Fase 2 (monorepo e troca do login do Base44 pelo Supabase).
