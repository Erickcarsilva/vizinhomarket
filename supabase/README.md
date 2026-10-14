# Backend VizinhoMarket (Supabase)

## Conteúdo
| Arquivo | O que faz |
|---|---|
| `migrations/202610140001_base.sql` | Tabelas: cidades, bairros, categorias, lojas, produtos (variações, adicionais, peso, estoque), endereços, entregadores, pedidos, avaliações, financeiro, push, auditoria |
| `migrations/202610140002_security.sql` | Permissões: RLS em todas as tabelas, permissões por coluna, dados fiscais separados |
| `migrations/202610140003_functions.sql` | Regras no servidor: criar pedido, avançar status, aceite de entrega, confirmação por código, cancelamento, avaliação, cadastro de loja e de entregador, funções do admin |
| `migrations/202610140004_reference_data.sql` | Sidrolândia, categorias e comissão padrão provisória (8%) |
| `tests/run.mjs` | 87 testes de segurança e regras de negócio num Postgres local |

## Rodar os testes
```bash
npm install
npm run test:db
```

## Aplicar no Supabase (só com aprovação do Erick)
1. Criar o projeto de **teste** no Supabase.
2. No painel, abrir **SQL Editor** e rodar os arquivos de `migrations/` na ordem do nome.
   (Ou, com a CLI: `supabase link` e `supabase db push`.)
3. **Não** rodar `tests/shim_supabase_local.sql` no Supabase: ele só imita o ambiente para os testes locais.
4. Criar o primeiro admin pelo SQL Editor, depois que você tiver feito login no app uma vez:
   `insert into public.user_roles (user_id, role) values ('<seu id em auth.users>', 'admin');`
5. Cadastrar os bairros de Sidrolândia pelo SQL Editor ou, depois, pelo painel Admin.

## Regra para migrações futuras
O Supabase concede acesso total às roles `anon` e `authenticated` em todo objeto novo.
Toda migração que criar tabela ou função precisa terminar retirando esse acesso e devolvendo só o necessário
(ver o bloco final de `202610140002_security.sql` e `202610140003_functions.sql`).

## Decisão: regras em funções do Postgres, não em Edge Functions
Pedido, status, aceite e cancelamento são funções SQL (`rpc`) porque rodam numa única transação:
se qualquer validação falhar, nada é gravado (nem baixa de estoque). Edge Functions ficam para o que
precisa sair do banco: notificações push, pagamento online e integrações.
