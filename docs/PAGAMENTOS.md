# Pagamentos — desenho, provedores e ativação (13/11/2026)

## Como funciona hoje

| Peça | Onde | O que faz |
|---|---|---|
| Pedido | `create_order` (SQL) | Calcula subtotal, taxa, cupom, comissão e total no servidor. Online nasce `awaiting_payment`; offline nasce `pending`. |
| Simulação | `quote_order` (SQL) | Roda `create_order` de verdade e desfaz: a tela mostra exatamente o que será cobrado. |
| Cobrança | Edge Function `pagamentos` → `svc_payment_begin` / `svc_payment_attach` | O valor vem do pedido no banco. Reaproveita a cobrança pendente (não gera dois Pix). Gateway fora do ar: 502 com mensagem clara e tentativa marcada como falha. |
| Confirmação | Edge Function `pagamentos-webhook` → `svc_payment_apply` | Confere a assinatura do provedor, **consulta o status na API do provedor** (o corpo do webhook não é fonte de verdade), compara o valor pago com o cobrado e é idempotente pelo id do evento. |
| Estornos | gatilho no cancelamento + `pagamentos-estornos` (a cada 5 min via pg_cron) | Cancelado e pago → estorno integral automático. Pago depois de cancelado → estorno automático. Reembolso pedido pelo cliente → admin decide com justificativa e define quem arca. |
| Razão | `ledger_entries` | Lançamentos que somam zero, imutáveis (gatilho bloqueia update/delete até para o superusuário). |
| Conciliação | `admin_import_settlement` + `admin_reconciliation` | Importa o extrato do gateway, lança a tarifa e lista 10 tipos de divergência. |
| Offline | `confirm_offline_payment` | A loja confirma que recebeu Pix direto/dinheiro/cartão na maquininha. Entregue sem confirmação em 24 h aparece na conciliação. |

O navegador nunca define valores nem marca pagamento: o cliente não tem permissão de escrita em `orders`, `payments` ou no razão (testado).

### Regras do razão (por pedido entregue)
- **Online** (o dinheiro está com a plataforma): `customer_prepaid` → loja recebe `subtotal − desconto da loja − comissão (+ taxa, se a entrega é da loja)`; plataforma fica com a comissão e a parte dela da taxa de entrega; entregador fica com `courier_fee`; desconto bancado pela plataforma vira despesa.
- **Offline** (o dinheiro ficou com a loja): a loja passa a dever `comissão + taxa da entrega da plataforma − desconto bancado pela plataforma`. Esse valor entra na fatura mensal; fatura paga baixa o saldo.
- **Serviços**: concluído → comissão sobre o valor aceito, a receber do prestador (pagamento direto ao prestador no piloto).

## Comparação de provedores (pesquisa de 13/11/2026)

| Critério | Asaas | Mercado Pago | Pagar.me (Stone) |
|---|---|---|---|
| Pix | Tarifa fixa por Pix recebido (agregador cita R$ 1,99; promoções de R$ 0,99) — **confirmar na tabela vigente** | Página oficial do link de pagamento: 0,99% com recebimento na hora | Negociado (proposta comercial) |
| Cartão | ~1,99% + R$ 0,49 em promoção citada por agregador; confirmar | Link oficial: crédito 4,98% na hora / 3,99% em 30 dias | Negociado (fontes antigas citam ~3,8%) |
| Split nativo | Sim, por `walletId` (só pela API) — **implementado no adaptador** | Sim, modelo Marketplace com OAuth de cada vendedor (não implementado; a plataforma recebe e repassa) | Sim, recebedores com KYC e conta bancária |
| Exigência do pagador | **CPF obrigatório** para criar cliente | E-mail | CPF/CNPJ |
| Sandbox | Sim (api-sandbox.asaas.com) | Sim (credenciais de teste) | Sim |
| Webhook | Token no header `asaas-access-token` | Assinatura HMAC `x-signature` | Assinatura/HTTP básico |
| Mensalidade | Não | Não | Não (proposta) |

**Recomendação para o piloto:** começar com **Asaas** (split nativo simples por `walletId`, Pix com custo fixo baixo para tíquete de delivery, onboarding de subcontas das lojas pela própria API) e manter o **Mercado Pago** como segunda opção (marca conhecida pelo consumidor, bom checkout de cartão). Pagar.me faz sentido quando o volume justificar negociação. A troca é uma configuração (`payment_provider`), não uma reescrita: os três passam pela mesma interface (`supabase/functions/_shared/pagamentos/providers.mjs`).

Atenção: tarifas acima vêm de páginas públicas e comparadores; nenhuma foi negociada. **Pedir proposta formal** com o volume previsto antes de decidir.

Fontes: [Asaas — preços](https://www.asaas.com/precos-e-taxas), [Blog Asaas — Pix e tarifas](https://blog.asaas.com/pix-cobra-taxa), [comparativo Asaas/iugu](https://quasa.io/pt/media/asaas-ou-iugu-tarifa-publicada-vence-ate-o-volume-pedir-proposta), [Mercado Pago — link de pagamento](https://www.mercadopago.com.br/ferramentas-para-vender/link-de-pagamento?code=BARWY), [Pagar.me split (Stays)](https://academy.stays.net/en/support/solutions/articles/36000160242-what-is-the-pagar-me-marketplace-payments-split-), [Nuvemshop — Pagar.me](https://www.nuvemshop.com.br/blog/o-que-e-pagar-me/).

## Para ativar de verdade (pendências do Erick)

1. **Escolher o provedor e abrir a conta PJ** da plataforma (exige CNPJ e análise do provedor). Para Asaas: habilitar a API e o split; para cada loja, criar a subconta e anotar o `walletId`.
2. **CPF do pagador** (exigência do Asaas): já implementado — com o gateway Asaas, a finalização pede o CPF (validado, guardado só na conta da pessoa) e a função de pagamento o envia ao banco.
3. **Cadastrar os segredos** no Supabase (Edge Functions → Secrets). Nunca no código:
   - Asaas: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` (sandbox: `https://api-sandbox.asaas.com/v3`; produção: `https://api.asaas.com/v3`).
   - Mercado Pago: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`.
   - Estornos: `CRON_SECRET` (o mesmo valor em `platform_settings.cron_secret`).
   - `APP_ORIGINS` (endereços do app do cliente, separados por vírgula) para o CORS.
   - Sandbox local/homologação: `PAYMENTS_ALLOW_SANDBOX=1` e `SANDBOX_WEBHOOK_SECRET`. **Não** definir em produção.
4. **Publicar as funções**: `supabase functions deploy pagamentos`, `supabase functions deploy pagamentos-webhook --no-verify-jwt`, `supabase functions deploy pagamentos-estornos --no-verify-jwt`.
5. **Cadastrar o webhook** no painel do provedor: `https://<projeto>.supabase.co/functions/v1/pagamentos-webhook?provider=asaas` (ou `mercadopago`).
6. Em `platform_settings`: `refunds_function_url` = `https://<projeto>.supabase.co/functions/v1/pagamentos-estornos`.
7. No painel admin → Configurações → Operação: escolher o gateway e ligar "Pagamento pelo app". Em Lojas, ligar "pagamento pelo app" para cada loja (com o `walletId`).
8. **Validar em sandbox do provedor** (Pix pago, Pix vencido, cartão recusado, estorno total e parcial, webhook repetido) antes de ligar em produção. O que já foi validado está em `docs/RELATORIO_TESTES.md`; **nenhum teste com o provedor real foi feito** porque não há credenciais.

## O que não está pronto para dinheiro real
- Integração com o provedor real **não validada** (sem credenciais). Os adaptadores foram testados com respostas HTTP simuladas no formato documentado.
- Split do Mercado Pago (modelo Marketplace/OAuth) não implementado.
- Antecipação de recebíveis, chargeback (contestação de cartão) e nota fiscal de serviço da comissão: não implementados.
- Repasse às lojas/entregadores é registrado manualmente (Pix/TED feito fora e lançado no painel) quando não há split.
