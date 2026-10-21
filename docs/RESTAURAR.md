# Como restaurar o banco a partir do backup

O backup é feito todo dia pelo GitHub (`.github/workflows/backup-banco.yml`) com o método oficial do Supabase.
Cada backup tem 3 arquivos e uma lista de conferência:

| Arquivo | O que tem |
|---|---|
| `roles.sql` | papéis próprios do banco (o VizinhoMarket hoje não cria nenhum; o arquivo pode vir quase vazio) |
| `schema.sql` | tabelas, funções, **permissões (GRANT)** e **regras de acesso (RLS)** |
| `data.sql` | os dados, inclusive as contas de login (`auth.users`) |
| `SHA256SUMS` | conferência de que os arquivos não foram corrompidos |

> Antes (até 21/10/2026) o backup usava `--no-privileges`, que **jogava fora as permissões**: restaurado, o app
> não mostraria nem as categorias. Ensaio que prova a diferença: `e2e/backup-restauracao.sh`.

## Quando usar
- O banco foi apagado ou corrompido.
- Um script rodou no projeto errado.
- Mudança de projeto (por exemplo, sair de East US para São Paulo).

**Nunca restaure por cima do banco que está funcionando.** Restaure num projeto novo, confira, e só então troque
as variáveis dos sites para o projeto novo.

## Passo a passo (cerca de 30 minutos)

### 1. Baixar o backup
GitHub → Actions → "Backup diário do banco" → escolha a execução do dia → Artifacts → `backup-banco-...`.
Descompacte. Confira os arquivos (no terminal, dentro da pasta): `sha256sum -c SHA256SUMS` — todos devem dar `OK`.

### 2. Criar o projeto novo no Supabase
- Região: **South America (São Paulo)**.
- Anote a senha do banco num lugar seguro (gerenciador de senhas).
- Em Database → Extensions, ligue **pg_cron** (usado pelos cancelamentos automáticos).

### 3. Restaurar (precisa do `psql`; no Windows, instale o PostgreSQL 17 só com "Command Line Tools")
Use a connection string do projeto **novo** (Connect → Session pooler):

```
psql --single-transaction --variable ON_ERROR_STOP=1 ^
  --file roles.sql --file schema.sql ^
  --command "SET session_replication_role = replica" ^
  --file data.sql ^
  --dbname "CONNECTION_STRING_DO_PROJETO_NOVO"
```
(No Linux/Mac, troque `^` por `\`.) Se aparecer erro, nada é gravado (é uma única transação): leia a mensagem,
veja "Erros comuns" abaixo e rode de novo.

### 4. Recriar o que fica fora da área `public`
O dump do Supabase não leva o que foi criado nas áreas `auth` e `storage`. No SQL Editor do projeto novo, rode
nesta ordem:
1. O gatilho que cria o perfil de quem se cadastra (sem ele, contas novas ficam sem perfil):
   ```sql
   create trigger on_auth_user_created after insert on auth.users
     for each row execute function public.handle_new_user();
   ```
2. `supabase/migrations/202610190001_supabase_platform.sql` (tempo real, bucket e regras das fotos)
3. `supabase/migrations/202610200002_supabase_platform_agendamentos.sql` (agendamentos do pg_cron)

### 5. Fotos (Storage) — não estão no backup do banco
O backup guarda só os endereços das fotos, não os arquivos. Para não perder as fotos:
- O bucket `public-images` é recriado no passo 4.
- Copie os arquivos do projeto antigo, se ele ainda existir, com o script da página oficial
  "Backup and restore using the CLI" do Supabase (seção Storage).
- Se o projeto antigo não existir mais, as fotos precisam ser enviadas de novo pelas lojas.
  **Por isso, recomenda-se baixar uma cópia do bucket uma vez por mês** (Storage → public-images → baixar).

### 6. Conferir antes de usar
No SQL Editor do projeto novo:
```sql
select (select count(*) from auth.users) contas, (select count(*) from public.stores) lojas,
       (select count(*) from public.orders) pedidos, (select count(*) from pg_policies where schemaname = 'public') regras;
```
Compare com os números do projeto antigo (ou do último relatório). `regras` deve ser 40 ou mais.
Depois abra o app logado como cliente, comerciante e admin e faça um pedido de teste.

### 7. Apontar os sites para o projeto novo
No Netlify, nos 3 sites, troque `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e faça um novo deploy.
No Supabase novo, cadastre as Redirect URLs (Authentication → URL Configuration) e o e-mail (SMTP).

## Erros comuns (da documentação do Supabase)
- `permission denied to grant role "postgres"`: em `roles.sql`, comente a linha `GRANT "postgres" TO "cli_login_postgres"...`.
- Erros com `supabase_admin` em `schema.sql`: comente as linhas `ALTER ... OWNER TO "supabase_admin"`.
- `role "postgres" is a member of role "cli_login_postgres"`: rode `DROP ROLE IF EXISTS cli_login_postgres;` e repita.

## Limitações conhecidas
- Os backups ficam 30 dias no GitHub. Para guardar mais tempo, baixe um por semana para o seu Drive.
- O workflow só foi ensaiado localmente (com Postgres 16, método equivalente). O primeiro backup real só acontece
  quando o segredo `SUPABASE_DB_URL` for cadastrado; faça uma restauração de teste num projeto descartável
  logo na primeira semana.
