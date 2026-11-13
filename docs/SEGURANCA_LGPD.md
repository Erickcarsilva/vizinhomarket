# Segurança e LGPD (13/11/2026)

## Modelo de ameaças (resumo)

| Ameaça | Exemplo | Controle | Evidência |
|---|---|---|---|
| Fraude de valor pelo cliente | Mudar preço/total/desconto no navegador | Valores só calculados em `create_order`; cliente sem escrita em `orders`; total visto conferido (VMPRC) | `run.mjs` (preço adulterado R$ 0,01 ignorado), `financeiro.mjs` |
| Marcar pedido como pago | Chamar API para `payment_status = paid` | Coluna sem permissão; funções `svc_*` só para `service_role` | `financeiro.mjs` (3 testes) |
| Webhook falso | POST no endpoint com "pago" | Assinatura HMAC/token; status consultado na API do provedor; valor comparado | `gateway.mjs` (assinatura inválida → 401) |
| Webhook repetido / em paralelo | Reenvio do provedor | Idempotência por `(provider, event_id)` + índice único no razão | `financeiro.mjs`, `e2e/concorrencia.mjs` (8 em paralelo → 1 lançamento) |
| Pedido duplicado | Duplo clique, rede instável | Chave de idempotência por tentativa + índice único | `e2e/concorrencia.mjs` (10 em paralelo → 1 pedido) |
| Estoque negativo / venda acima do estoque | Compras simultâneas | `update ... where stock >= qtd` com bloqueio de linha | `e2e/concorrencia.mjs` (20 compras, 5 unidades → 5 pedidos) |
| Cupom além do limite | Uso simultâneo | `select ... for update` no cupom | `e2e/concorrencia.mjs` (12 em paralelo, limite 3 → 3) |
| Dois entregadores na mesma corrida | Aceite simultâneo | `update ... where courier_id is null` atômico | `e2e/concorrencia.mjs` (10 → 1) |
| Lojista vendo outra loja | Ler pedidos, CPF, saldo, cupons | RLS por `is_store_member`/`is_store_owner`; dados fiscais em tabela separada | `run.mjs`, `financeiro.mjs` |
| Vazamento de dados pessoais | CPF de loja/entregador, telefone/endereço do cliente | Colunas sem `select` público; endereço do cliente só depois do aceite (entregador e prestador) | `run.mjs`, `logistica.mjs`, `servicos.mjs` |
| Rastreamento indevido do entregador | GPS com app offline | Posição só por função, só online, histórico só durante a entrega; offline apaga a última posição; retenção de 30 dias | `logistica.mjs` |
| Escalada de privilégio | Virar admin, aprovar a própria loja | `user_roles` sem escrita; funções `admin_*` conferem papel; auditoria | `run.mjs`, todas as suítes |
| Alteração do histórico financeiro | Editar/apagar lançamento | Gatilho bloqueia update/delete (até superusuário); ajuste = lançamento novo com justificativa | `financeiro.mjs` |
| Abuso (spam) | Muitos atendimentos/orçamentos | Limites por usuário/dia nas funções; limite do Supabase Auth para login | `servicos.mjs` |
| XSS | Texto do usuário em telas | React escapa por padrão; sem `dangerouslySetInnerHTML` com dado de usuário | revisão de código |
| CSRF | — | API usa token Bearer (não cookie); CSRF clássico não se aplica | — |
| SQL injection | — | PostgREST parametrizado; funções sem SQL dinâmico com dado do usuário | revisão |
| Segredos no código | Chaves de gateway | Só em segredos das Edge Functions/GitHub; a chave anon é pública por desenho | `.gitignore`, revisão |

### Bugs de segurança encontrados e corrigidos nesta etapa
1. **Comparação com NULL em checagem de permissão** (`open_ticket`): `courier_id = usuário` com `courier_id` nulo deixava passar.
   Corrigido com comparações nulo-seguras; o mesmo padrão em `rate_order` (pedido anonimizado podia ser avaliado por terceiros) também foi corrigido.
2. **Gatilho de "entrega pela plataforma" nunca disparava**: em gatilho `SECURITY DEFINER`, `current_user` é o dono. Corrigido.

### Riscos restantes (sem mitigação completa)
| Risco | Situação | Recomendação |
|---|---|---|
| Rate limiting na API REST | Depende dos limites do Supabase; funções sensíveis têm limites próprios | Ativar proteção/limites do Supabase (Auth rate limits, CAPTCHA no cadastro) antes de abrir ao público |
| 8 avisos `npm audit` em ferramentas de build (Tailwind 3) | Não vão para o navegador (`npm audit --omit=dev` = 0) | Migrar para Tailwind 4 depois do piloto |
| Pentest externo | Não realizado | Contratar antes da escala |
| MFA para admin | Não exigido | Ativar TOTP do Supabase para contas admin |

## LGPD

| Direito/obrigação | Implementação |
|---|---|
| Acesso e portabilidade (art. 18, II e V) | `export_my_data()`; botão "Baixar meus dados" no perfil (JSON) |
| Eliminação (art. 18, VI) | `delete_my_account()`: apaga conta, perfil, endereços, consentimentos; anonimiza pedidos, serviços e mensagens (mantidos por obrigação contábil); bloqueia se houver pedido/serviço em andamento ou ganhos a receber |
| Consentimento | `user_consents` com tipo, versão e data; `record_consent()` |
| Minimização | Data de nascimento não é guardada (só a confirmação de 18+); posição do entregador só durante a entrega |
| Retenção | Erros do app: 30 dias; posições de entrega: 30 dias (configurável); auditoria e razão: permanentes (obrigação legal/contábil) |
| Segurança | RLS, permissões por coluna, auditoria, backups com permissões (ver `RESTAURAR.md`) |
| Logs sem dados pessoais | Funções de pagamento registram só ids e códigos (testado em `gateway.mjs`) |

### Pontos que exigem validação jurídica especializada
- Termos de uso, política de privacidade, contrato do lojista e **termos do entregador** (relação de trabalho, seguro, responsabilidade em acidentes).
- Base legal e prazos de retenção (fiscal: 5 anos; consumidor; Marco Civil: registros de acesso por 6 meses).
- Papel da plataforma como intermediadora de pagamento (regras do Banco Central para subcredenciamento/split; responsabilidade em estornos e chargebacks).
- Categorias reguladas: farmácia (Anvisa/RDC 44), bebidas alcoólicas (venda a menores), agrotóxicos/medicamentos veterinários (receituário), armas/munições (não permitir).
- Código de Defesa do Consumidor: direito de arrependimento em compras a distância, prazos de reembolso.
- Nota fiscal da comissão e reforma tributária (split tributário a partir de 2026–2027).
- Encarregado (DPO) e canal do titular.
