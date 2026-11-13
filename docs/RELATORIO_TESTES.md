# Relatório de testes (13/11/2026)

Todos os números abaixo vieram de execuções reais (no ambiente de desenvolvimento e no GitHub Actions). Nada foi testado contra
o Supabase real, gateways reais ou aparelhos físicos — isso está listado no fim como **não verificado**.

## 1. Banco de dados (PGlite, Postgres 18) — `npm run test:db`
| Suíte | O que cobre | Resultado |
|---|---|---|
| `run.mjs` | Segurança base, RLS, pedido no servidor, estoque, idade, entregas, faturas, admin, LGPD (exclusão) | **206/206** |
| `financeiro.mjs` | Pagamento online, webhooks (assinatura, valor divergente, duplicado), razão imutável, estornos automáticos e pedidos, cupons (limites, vencido, loja errada, total esperado), offline, repasses, ajustes, conciliação, suporte, isolamento entre lojas | **81/81** |
| `gateway.mjs` | Regras reais das Edge Functions contra o banco: Pix sandbox ponta a ponta, reaproveitar cobrança, sem login, outro usuário, assinatura inválida, webhook duplicado, pagamento recusado, gateway fora do ar (502), falha temporária (500), estorno com nova tentativa, sandbox bloqueado em produção, Mercado Pago e Asaas com HTTP simulado (idempotência, assinatura HMAC, split), logs sem dados pessoais | **24/24** |
| `logistica.mjs` | Online/offline, privacidade da posição, ofertas, distância real, recusa, aceite, retirada, liberação, problema, reatribuição, monitor, ganhos, entregador da loja, chave geral, retenção | **40/40** |
| `servicos.mjs` | Atributos por categoria (tipos, opções, obrigatórios), categorias pelo admin, configuração pública, fluxo de serviço completo com isolamento, contato só após aceite, comissão no razão e na fatura, proposta vencida, LGPD (exportação, consentimento, exclusão), chaves de operação | **45/45** |
| **Total** | | **396/396** |

## 2. Concorrência real (Postgres 16, conexões paralelas) — `e2e/concorrencia.mjs`
| Cenário | Resultado |
|---|---|
| 20 compras simultâneas com 5 unidades em estoque | exatamente 5 pedidos; estoque 0 |
| 10 envios simultâneos do mesmo pedido | 1 pedido |
| 12 pedidos simultâneos com cupom de 3 usos | exatamente 3 |
| 10 entregadores aceitando a mesma corrida | 1 aceite; 9 recebem "já foi assumida" |
| 8 entregas simultâneas do mesmo webhook | 1 lançamento; nenhum erro |
| 4 processadores de estorno simultâneos | cada estorno pego uma vez |
| Razão ao final | soma zero |
| **Total** | **11/11** (local e no CI) |

## 3. Ponta a ponta pelas telas (Chromium, celular 390 px; Postgres 17 + PostgREST 12.2.3) — GitHub Actions
| Suíte | Resultado no CI |
|---|---|
| `pedido-completo` (cadastro de loja → aprovação → produto → pedido → entrega com código → avaliação; fraudes pela API) | **23/23** |
| `bloco1` (alarme, cancelamento automático, telefone, exclusão de conta) | **22/22** |
| `admin` (painel administrativo) | **30/30** |
| `telas` (volume de 600+ pedidos, busca, favoritos, bairros) | **43/43** |
| `push` (aviso de pedido novo, Web Push com serviço falso) | **10/10** |
| `marketplace` (cupom + Pix pelo app em sandbox → loja só vê depois do "banco" → preparo → entregador: cadastro, online, oferta sem dados do cliente, aceite, retirada, posição registrada, código, ganhos → razão fecha em zero e loja com R$ 29,44 a receber → orçamento de serviço → 6 telas novas do admin → acessibilidade axe e celular sem rolagem lateral em 6 telas) | **44/44** (execuções 24 e 25 do CI) |
| Travas do script de zerar | **4/4** |
| Arquivos de instalação (`validar-deploy.mjs`: completo do zero, 03→04→05→06→07→08→**09**) | **10/10** (local) |
| PWA (`pwa-check.mjs`: manifest, service worker, offline, POST não atendido pelo cache) | **4/4** (local) |

Execução final do CI depois das correções: ver a seção 6.

## 4. Build, lint e dependências (CI)
- Lint e build dos 4 produtos (cliente, parceiro, admin, entregador): **OK**.
- `npm audit --omit=dev` (o que vai para o navegador): **0 vulnerabilidades**.

## 5. Falhas encontradas pelos testes e corrigidas
| Falha | Onde | Correção |
|---|---|---|
| Permissão com comparação a NULL deixava terceiro abrir atendimento sobre pedido alheio | `open_ticket` | comparação nulo-segura (+ `rate_order`) |
| Trava "entrega pela plataforma" nunca disparava | gatilho `SECURITY DEFINER` | gatilho com direitos de quem chama |
| `CASE … THEN` dentro de `IF` quebrava a função de configurações | `admin_set_setting` | variável auxiliar |
| `alter type … add value` antes de o tipo existir no banco completo | gerador de deploy | dentro da transação, depois da criação |
| `.env.entregador` ignorado pelo git: o build do entregador virava o app do cliente | `apps/web/.gitignore` | exceção adicionada |
| Página recarregava na primeira visita (service worker) | `lib/pwa.js` | só recarrega em troca de versão |
| GPS parava ao abrir a corrida e não reenviava parado | app do entregador | GPS no layout + reenvio a cada 20 s |
| Contraste insuficiente no app do entregador | cabeçalho/menu | cores ajustadas |

## 6. Execução final
- **Execução 24 do CI** (commit `8c36787`, todas as correções de código): os dois trabalhos **verdes** — banco 396/396, deploy em dia,
  lint/build dos 4 produtos, auditoria 0; ponta a ponta 23/23, 22/22, 30/30, 43/43, 10/10, **44/44**, concorrência 11/11, travas 4/4.
- **Execução 25** (só documentação): `telas` 42/43 — a tela de favoritos registrou um "409 Conflict" no console. Causa: duas
  sincronizações de favoritos simultâneas no login gravando o mesmo item (o app já tratava o erro, mas o navegador registrava).
  Corrigido deixando a sincronização com uma execução por vez (`lib/favorites.js`). Resultado da execução seguinte: ver a seção 8.

## 7. Não verificado (depende de ambiente real)
- Aplicação do `09` no Supabase real; pg_cron, pg_net, realtime e storage reais.
- Pagamentos com gateway real (sandbox do provedor) — sem credenciais.
- E-mail real de cadastro/recuperação; Web Push em aparelhos reais; instalação do PWA em Android/iOS físicos.
- Restauração de backup no Supabase real (ensaio local 9/9 em 21/10).

## 8. Execução depois da correção dos favoritos
**Execução 26 do CI** (commit `4540c9a`): **verde** nos dois trabalhos (banco/build e ponta a ponta com todas as suítes).

## 9. Rodada final (execução 31 do CI, commit `73e519d`) — verde
| Suíte | Resultado |
|---|---|
| Banco (7 suítes: + `equipe.mjs` — cidades, equipe por área, CPF, avisos) | 206 + 81 + 24 + 40 + 45 + 30 = **426/426** |
| `pedido-completo`, `bloco1`, `admin`, `telas`, `push` | 23/23, 22/22, 30/30, 43/43, 10/10 |
| `marketplace` (agora com reembolso, atendimento, planilha CSV, equipe por área e cidades pelas telas) | **53/53** |
| `concorrencia` | 11/11 |
| `carga` (25 usuários × 30 s pela API real de teste) | **4/4** — 24.108 requisições (804/s), 4.068 pedidos; p95: leitura 58 ms, simulação 79 ms, pedido 78 ms; 0 erros; estoque nunca vendido além do disponível |
| Travas do zerar | 4/4 |

Revisão visual: 14 telas do marketplace revisadas (miniaturas geradas no CI). Ajustes feitos: banner de alerta de pedido escondido para
prestadores de serviço, descrição do orçamento sem duplicar, rótulo "Forma de pagamento" na finalização, versão do app atualizada.
A carga roda num servidor do GitHub (2 vCPUs), não no Supabase: serve como referência de capacidade das regras, não do plano contratado.


## 10. Depois do reposicionamento visual (execução 36 do CI, commit `4f2dcdb`) — verde
- Banco (PGlite): todas as suítes passaram; lint e build dos 4 produtos; auditoria de pacotes sem vulnerabilidades.
- Ponta a ponta (Postgres 17 + PostgREST + Chromium, com axe): pedido-completo 23/23, bloco1 22/22, admin 30/30, telas 43/43,
  push 10/10, marketplace 53/53, concorrência 11/11, carga 4/4, travas do script de zerar 4/4.
- Falha encontrada e corrigida no caminho (execução 34): axe `aria-required-children` — vitrine horizontal da página inicial
  marcada como lista com links diretos; virou grupo.
- Revisão visual com dados fictícios (sem banco): cliente em 360, 390 e 1280 px; painéis do lojista e do admin em 1280 px;
  entregador em 390 px. Telas reais do teste ponta a ponta (sacola, Pix, acompanhamento, orçamento, atendimento, entregador) conferidas nas miniaturas do CI.
