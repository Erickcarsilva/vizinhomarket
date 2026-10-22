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

## Fase 2 — Telas do Base44 ligadas ao backend novo (19/10/2026)

### Decisões
- 19/10: as telas do Base44 foram mantidas. Uma camada de compatibilidade (`apps/web/src/api/base44Client.js`) traduz as chamadas antigas para o Supabase.
- 19/10: mensalidade e teste de 30 dias removidos das telas. A antiga tela "Assinatura" agora leva a "Comissões e faturas".
- 19/10: bairro do endereço é opcional enquanto não houver lista oficial. Se a loja tiver zonas de entrega, o pedido exige bairro.
- 19/10: a taxa de comissão da loja não aparece para o público, só para o dono e o admin.
- 19/10: o vínculo avaliação→pedido só pode ser lido por quem está logado. A tela do pedido precisa dele.
- 19/10: a imagem padrão (sem foto) passou a vir de dentro do app. Antes vinha do servidor do Wix.

### Feito
- Login e cadastro com código por e-mail; papéis cliente, lojista e admin.
- Cadastro de loja: o horário em texto vira 7 dias estruturados, e o CPF/CNPJ fica em dados privados. A tela agora mostra o erro se o envio falhar.
- O admin aprova a loja, e o lojista cadastra e edita produtos (sem apagar o histórico).
- O pedido é calculado no servidor (proteção contra repetição do envio). Cliente vê o código de entrega; lojista avança os status e conclui com o código; comissão por pedido; avaliação.
- Tabela "Indique uma loja" (`store_referrals`).
- Migração de plataforma: tempo real e armazenamento de imagens (`202610190001_supabase_platform.sql`), não testada localmente.

### Testes executados
| Teste | Resultado |
|---|---|
| Bateria do banco (PGlite) | 96/96 passaram |
| Ponta a ponta pelas telas (`e2e/pedido-completo.mjs`): Postgres 17.5 + PostgREST 12.2.3 + login simulado + Chromium, tela de celular 390px | 19/19 passaram |
| Fraudes pela API com login de cliente: alterar total ou status, confirmar a própria entrega, ler CPF/CNPJ | Todas recusadas (HTTP 403 ou vazio) |
| Preço adulterado no carrinho do navegador (R$ 0,01) | Ignorado; servidor cobrou R$ 45,00 |

### Limites do teste ponta a ponta
- O login é simulado: aceita qualquer código, e o e-mail real do Supabase não foi testado.
- Tempo real, envio de imagem e app do entregador não foram testados.

### Problemas encontrados e corrigidos
- A tela do pedido falhava com "sem permissão" ao buscar a avaliação: faltava liberar `reviews.order_id`.
- O cadastro de loja não tinha tratamento de erro.

## Bloco 1 — Itens para o piloto (20/10/2026)

### Feito
- Supabase de teste criado pelo Erick (vizinhomarket-teste, região East US). Banco aplicado e conferido: 27 tabelas e 9 categorias.
- Tamanhos e adicionais: o lojista cadastra pela tela; o cliente escolhe num painel; o lojista vê o que foi escolhido no pedido. O servidor confere as regras e o preço.
- Perfil, telefone e endereços ficam salvos na conta, não só no aparelho. O checkout já vem preenchido.
- Botão "Entrar com Google" fica escondido até configurar (VITE_GOOGLE_LOGIN=1).
- O cliente cancela o pedido enquanto a loja ainda não aceitou.
- Pedido sem aceite em 15 minutos é cancelado sozinho (pg_cron, a cada minuto). O estoque volta.
- Chave Pix da loja: cadastrada pelo lojista e mostrada só ao cliente daquele pedido, quando ele paga com Pix.
- Alerta de pedido novo:
  - bipe repetindo a cada 5 s até o aceite;
  - notificação do sistema com o app em segundo plano;
  - tela sempre acesa;
  - conferência a cada 20 s caso o tempo real caia.
- Excluir conta: no perfil e na página pública /excluir-conta, como a Google Play exige. Dados pessoais são apagados e pedidos ficam anônimos. Dono de loja e quem tem pedido em andamento não conseguem excluir.
- Registro de erros do app (client_errors). O admin vê no painel; os registros são apagados depois de 30 dias.
- Backup diário: rotina pronta para o GitHub (.github/workflows/backup-banco.yml). Falta o repositório e o segredo SUPABASE_DB_URL.
- Termo do piloto (docs/VizinhoMarket_Termo_do_Piloto.docx e .pdf).
- Cadastro entra direto quando o Supabase não exige confirmação de e-mail.

### Testes
| Teste | Resultado |
|---|---|
| Bateria do banco (PGlite) | 114/114 |
| Ponta a ponta do pedido (e2e/pedido-completo.mjs) | 19/19 |
| Ponta a ponta do Bloco 1 (e2e/bloco1.mjs) | 22/22 |
| Atualização 02_atualizacao_bloco1.sql aplicada sobre o banco de 19/10 (Postgres 17, simulando o Supabase) | OK |

### Problemas encontrados pelos testes e corrigidos
- Uma tabela nova ficava legível por visitantes, porque o padrão do banco libera tabelas novas. Corrigido com revoke explícito.
- Telefone obrigatório impedia anonimizar o pedido. Agora o telefone só pode ficar vazio quando o pedido não tem mais cliente vinculado.
- O alarme não tocaria no primeiro pedido de uma loja nova.

### Precisa testar no Supabase real
- A exclusão da conta apaga o usuário do login (auth.users): depende da permissão do Supabase.
- pg_cron ativado.
- Notificação e tela acesa no Android.

## Bloco 2, parte 1 — Painel administrativo (21/10/2026)

### Feito
- Painel único em /admin com 8 abas. O antigo /admin-dashboard redireciona para lá.
  - **Visão geral:** números do período e avisos de pendências.
  - **Lojas:** aprovar, suspender e reativar; ver dados privados; comissão negociada; WhatsApp do dono.
  - **Pedidos:** filtros, detalhes, cancelamento com motivo e WhatsApp do cliente.
  - **Usuários:** busca, bloqueio e permissão de admin.
  - **Entregadores:** aprovar e suspender cadastros.
  - **Comissões:** faturas do mês, marcar como paga, anular e enviar cobrança pelo WhatsApp.
  - **Configurações:** comissão padrão, comissão por categoria, tempo limite e Pix da plataforma.
  - **Erros e histórico.**
- Funções novas no banco: admin_list_users, admin_set_user_banned, admin_set_admin, admin_list_couriers, admin_generate_invoices, admin_set_invoice_status, admin_overview, admin_store_rates e admin_set_store_commission. Toda ação do admin fica no audit_log.
- Versão do app aparece no menu e no rodapé (lib/version.js), e os arquivos de entrega passam a ter a versão no nome.

### Testes
| Teste | Resultado |
|---|---|
| Bateria do banco | 139/139 |
| e2e pedido completo | 19/19 |
| e2e Bloco 1 | 22/22 |
| e2e painel admin (e2e/admin.mjs) | 27/27 |
| 03_atualizacao_bloco2_admin.sql aplicado sobre o banco de 20/10 | OK |

### Pendências observadas
- O nome da categoria difere entre a tela ("Alimentação") e o banco ("Restaurantes e lanches"). Padronizar.
- O bloqueio de usuário altera auth.users.banned_until. Confirmar no Supabase real que o login é recusado.

## Separação em 3 produtos (21/10/2026)

### Decisão (Erick)
- O App do Cliente é só para comprar.
- A área do comerciante e a área do admin são **sites (painéis)**, não apps. Cada um tem endereço, login e menu próprios.
- O app do entregador fica para depois.

### Feito
- O mesmo código gera 3 sites (`--mode cliente|parceiro|admin`), cada um só com as suas telas:
  - **Cliente**, porta 5173: vitrine, loja, carrinho, pedidos, perfil e favoritos. Os endereços antigos de lojista e admin levam para os painéis.
  - **Parceiro**, porta 5174: menu lateral com Pedidos (alarme em todas as telas), Entregas, Pedidos entregues, Cardápio e preços, Comissões e faturas, Relatórios, Minha loja e Alertas. Quem ainda não tem loja vai direto para o cadastro.
  - **Admin**, porta 5175: menu lateral com as 8 seções. Não tem cadastro aberto; quem não é admin vê "Acesso restrito".
- Cada site tem título e manifesto próprios. Links entre eles ficam em lib/appConfig.js: produção em vizinhomarket-teste, vizinhomarket-parceiro e vizinhomarket-admin .netlify.app.
- Removidos: App.jsx, Partner.jsx, ManageProducts.jsx, Finance.jsx, Driver.jsx, AdminPanel.jsx.

### Testes (os 3 sites rodando ao mesmo tempo)
| Teste | Resultado |
|---|---|
| Banco | 139/139 |
| e2e pedido completo (cliente + parceiro + admin) | 19/19 |
| e2e Bloco 1 | 22/22 |
| e2e painel admin | 28/28 |

## Correções pré-piloto (21/10/2026) — ramo `correcoes-pre-piloto`

Autorizado por Erick: itens 1 a 8 de uma vez, um commit por item, revisão no fim. Nada no banco real, nada publicado, sem push.

| Item | O que mudou | Evidência |
|---|---|---|
| 1 | Totais do comerciante calculados no servidor (`store_summary`, `store_daily`, `store_top_products`); listas com "Carregar mais" (Histórico, Comissões, Pedidos do admin). Fim do limite de 500 pedidos. | banco 148/148 (seção 14, 1.350 pedidos); `telas.mjs` com 623 entregues bate com o banco |
| 2 | Farmácia inativa (migração 202610210003) e fora das telas; cadastro não cai mais na primeira categoria. | banco 151/151 (seção 15) |
| 3 | Suporte sem contatos inventados (VITE_SUPPORT_*); Sobre/FAQ/Ajuda sem teste grátis de 30 dias, sem 7,99% fixo, sem entrega pela plataforma; comerciante não escolhe mais "Entrega pela plataforma". | revisão de texto; e2e |
| 4 | 43 pacotes sem uso removidos, 35 componentes de interface e 2 arquivos mortos; React Router 7.18.4. | `npm audit --omit=dev` = 0; docs/DEPENDENCIAS.md |
| 5 | `00_zerar` movido para `deploy/perigoso/` com 3 travas. | `zerar-trava.mjs` 4/4 |
| 6 | Backup pelo método oficial (com permissões), conferência, SHA256SUMS e issue em caso de falha; docs/RESTAURAR.md. | `backup-restauracao.sh` 9/9 (o método antigo perdia 473 permissões por coluna) |
| 7 | Testes sem caminhos fixos, `rodar-todos.sh`, CI no GitHub, nova suíte `telas.mjs`. | `telas.mjs` 16/16 |
| 8 | SQL gerado das migrações (`deploy/gerar.mjs`): banco completo e `04_atualizacao_totais_farmacia.sql`. | `validar-deploy.mjs` 4/4 |

### Testes finais (clone limpo do ramo, 21/10)
| Teste | Resultado |
|---|---|
| Banco (PGlite) | 151/151 |
| Lint e build dos 3 produtos | OK |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| e2e pedido completo | 19/19 |
| e2e Bloco 1 | 22/22 |
| e2e painel admin | 28/28 |
| e2e telas (volume) | 16/16 |
| Travas do zerar | 4/4 |
| Arquivos de instalação | 4/4 |
| Ensaio de backup e restauração | 9/9 |

### Não verificado ainda (depende do Supabase real, GitHub e Netlify)
- CI e backup rodando no GitHub; e-mail, fotos, tempo real, bloqueio de login, exclusão de conta e pg_cron no Supabase real.

### Decisões em aberto
- Percentual de comissão: o banco usa 8% (provisório); os textos antigos diziam 7,99%. Os textos agora não citam número.
- Contatos reais de suporte (WhatsApp, e-mail, horário) para cadastrar no Netlify.
- Migrar para o Tailwind 4 depois do piloto (elimina os 8 avisos de ferramentas de build).

## Depois da revisão (21/10/2026, noite)
- Ramo `correcoes-pre-piloto` juntado ao master (só local, sem push).
- `netlify.toml`: os 3 sites usam o mesmo arquivo; só muda a variável PRODUTO (cliente, parceiro, admin).
- Nomes das categorias nas telas iguais aos do banco.
- Busca de produtos feita no servidor (antes baixava até 1.000 produtos).
- Entregues: guia "Colocar no ar", rascunhos jurídicos (Termos, Privacidade, Contrato do Lojista) e checklist de lançamento.
- Testes: banco 151/151; e2e 19/19, 22/22, 28/28, 17/17; travas 4/4; instalação 4/4.

## Próxima tarefa recomendada
Erick revisa o relatório de 21/10 e autoriza juntar o ramo `correcoes-pre-piloto` ao principal. Depois: GitHub privado, atualização 04 no Supabase de teste, Netlify com os 3 sites e validação real (calendário no relatório).
