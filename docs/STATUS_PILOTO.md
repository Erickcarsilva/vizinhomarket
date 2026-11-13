# Situação para o piloto comercial em Sidrolândia (13/11/2026)

**Classificação honesta: NÃO está "pronto para piloto comercial" ainda.** O software dos módulos essenciais está implementado e
testado automaticamente; faltam itens que dependem de terceiros e de decisões do Erick (lista no fim). O piloto pode começar no
**modo atual (pagamento na entrega/Pix direto à loja, entrega pela própria loja)** assim que o 09 for aplicado e validado no
Supabase de teste — esse modo não depende de gateway.

Legenda: **I** implementado · **T** testado automaticamente · **S** validado em sandbox · **P** validado em produção ·
**3º** depende de terceiros · **E** depende de decisão/ação do Erick.

## Matriz por área

| Área | I | T | S | P | Pendência |
|---|:-:|:-:|:-:|:-:|---|
| Cliente: cadastro, login, recuperação, perfil, endereços | ✔ | ✔ e2e | — | — | E-mail real do Supabase (SMTP próprio) — 3º |
| Cliente: vitrine multicategoria, busca, loja, carrinho, favoritos | ✔ | ✔ e2e | — | — | |
| Cliente: cupom (servidor) | ✔ | ✔ banco + concorrência + e2e* | — | — | |
| Cliente: pagamento pelo app (Pix/cartão) | ✔ | ✔ banco + integração + e2e* | ✔ (sandbox interno) | — | Conta no gateway, CPF do pagador — 3º/E |
| Cliente: acompanhamento, código de entrega, entregador e posição | ✔ | ✔ banco + e2e* | — | — | Realtime no Supabase real |
| Cliente: avaliações, reembolso, atendimento, exportar/excluir dados | ✔ | ✔ banco + e2e | — | — | |
| Cliente: serviços (orçamento, aceite, conversa, avaliação) | ✔ | ✔ banco + e2e* | — | — | |
| Lojista: cadastro/aprovação, catálogo, variações, adicionais, estoque, horários, bairros/taxas | ✔ | ✔ e2e | — | — | |
| Lojista: atributos por categoria | ✔ | ✔ banco | — | — | |
| Lojista: pedidos, alarme, entrega própria, confirmação de recebimento offline | ✔ | ✔ e2e | — | — | |
| Lojista: equipe e entregadores da loja | ✔ | ✔ banco | — | — | |
| Lojista: promoções, saldo, faturas, relatórios | ✔ | ✔ banco + e2e | — | — | |
| Prestador: serviços oferecidos, propostas, agenda, conclusão | ✔ | ✔ banco + e2e* | — | — | |
| Entregador: cadastro, aprovação, online/offline, ofertas, aceite atômico, retirada, código, problema, ganhos, histórico | ✔ | ✔ banco + concorrência + e2e* | — | — | Termos do entregador (jurídico) — E |
| Admin: visão geral, lojas, pedidos, usuários, entregadores, entregas (reatribuição) | ✔ | ✔ e2e | — | — | |
| Admin: pagamentos, conciliação, saldos/repasses, reembolsos, atendimento, cupons, categorias, chaves de operação | ✔ | ✔ banco + e2e* | — | — | |
| Admin: cidades (expansão) e equipe interna por área (financeiro, atendimento, operação) | ✔ | ✔ banco + e2e* | — | — | MFA para admin — E |
| Avisos no celular: cliente (andamento do pedido) e entregador (corrida nova) | ✔ | ✔ banco + função | — | — | Chaves VAPID e função `avisos` publicada — E |
| Planilha (CSV) de pedidos para lojista e admin | ✔ | ✔ e2e* | — | — | |
| CPF do pagador no pagamento online (quando o gateway exige) | ✔ | ✔ banco | — | — | |
| Teste de carga (25 usuários simultâneos) | ✔ | ✔ CI | — | — | Carga em ambiente real |
| Financeiro: razão imutável, idempotência, estornos, conciliação | ✔ | ✔ banco + concorrência | ✔ interno | — | Extrato real do gateway — 3º |
| PWA (cliente e entregador): manifest, ícones, service worker, offline seguro | ✔ | ✔ (`pwa-check` 4/4) | — | — | Instalação testada em aparelho real — E |
| Segurança e LGPD | ✔ | ✔ (autorização em todas as suítes) | — | — | Revisão jurídica, MFA admin, pentest — 3º/E |
| Infra: CI, deploy gerado e validado, backups, rollback | ✔ | ✔ CI + `validar-deploy` 10/10 | — | — | Segredo do backup no GitHub; produção no Supabase — E |

\* "e2e*" = suíte `e2e/marketplace.mjs` (navegador real contra Postgres + PostgREST, gateway de simulação). Resultado em `RELATORIO_TESTES.md`.

## O que falta para "pronto para piloto comercial" (ação do Erick ou de terceiros)

1. **Aplicar o `09_atualizacao_marketplace.sql` no Supabase de teste** e rodar o roteiro manual (abaixo) em celulares reais.
2. **Decisões comerciais**: percentual de comissão (hoje 8% provisório), parte da taxa de entrega do entregador (hoje 100%),
   prazo de reembolso (7 dias), pedido mínimo de cupons de lançamento, contatos de suporte (`VITE_SUPPORT_*`).
3. **Gateway**: escolher (recomendação: Asaas), abrir conta PJ, sandbox → cadastrar segredos → validar os cenários de `PAGAMENTOS.md`.
   Até lá, manter "Pagamento pelo app" **desligado** (o app funciona com pagamento na entrega).
4. **Entregadores da plataforma**: decidir se o piloto terá entregadores próprios ou só entrega das lojas; contrato e seguro.
   Até lá, manter "Entrega pela plataforma" **desligada**.
5. **Jurídico**: termos de uso, privacidade, contrato do lojista, termos do entregador, regras de categorias reguladas (ver `SEGURANCA_LGPD.md`).
6. **Infra de produção**: projeto Supabase de produção (plano Pro), domínio, SMTP próprio, segredo `SUPABASE_DB_URL` do backup, MFA dos admins.
7. **Lista oficial de bairros** de Sidrolândia (Admin → Configurações → Bairros).

## Roteiro de homologação manual (celular real)
1. Instalar o app do cliente (Android: "Instalar app"; iPhone: Compartilhar → "Adicionar à Tela de Início").
2. Cliente faz pedido com cupom e pagamento na entrega; loja recebe alarme, aceita, prepara, entrega com código; loja confirma o recebimento.
3. Ligar "Pagamento pelo app" com gateway de simulação: pedido com Pix; "pagar" pelo admin/sandbox; conferir a conciliação.
4. Entregador: instalar o app, cadastrar, aprovar no admin, ficar online, aceitar, retirar, entregar; cliente acompanha.
5. Serviço: pedir orçamento, propor, aceitar, agendar, concluir; ver a comissão na fatura.
6. Reembolso: cliente pede; admin decide; ver o lançamento no razão.
7. Exportar dados e excluir conta de um cliente de teste.

## Plano do piloto em Sidrolândia
| Semana | Meta |
|---|---|
| 0 | Homologação acima; ajustes; treinar 3–5 lojas parceiras (restaurante, mercado, farmácia **não**, pet, bebidas com regra de idade) |
| 1–2 | Piloto fechado: lojas parceiras + 30–50 clientes convidados; pagamento na entrega; entrega pelas lojas; cupom de boas-vindas da plataforma |
| 3–4 | Abrir para a cidade; ligar Pix pelo app (se o gateway estiver validado); medir tempo de aceite, cancelamentos, NPS |
| 5–8 | Entregadores da plataforma (2–4) em horário de pico, se houver demanda; primeiros prestadores de serviço |
| Indicadores | Pedidos/semana, recompra em 30 dias, tempo médio de aceite (< 3 min), cancelamento (< 5%), reclamações por 100 pedidos, divergências na conciliação (= 0) |

## Evolução e expansão
- **Curto prazo**: e-mail de status para o cliente; impressão de pedidos na loja; MFA admin; bairros por cidade na tela de Configurações.
- **Médio prazo**: split do Mercado Pago; antecipação; chargebacks; nota fiscal da comissão; mapa com rotas (OSRM/Mapbox) quando o volume
  justificar; despacho automático de corridas por proximidade; app nativo (Capacitor) com rastreio em segundo plano consentido.
- **Expansão**: o banco já é multicidade (cidades, bairros, fuso, coberturas). Nova cidade = cadastrar cidade/bairros, ativar, onboarding de
  lojas. Comissão por cidade/categoria e cupons por cidade já existem.
