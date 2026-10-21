-- VizinhoMarket — ZERAR o banco do projeto de TESTE para reinstalar do zero.
-- ATENÇÃO: apaga TODAS as tabelas do VizinhoMarket e TODAS as contas de login deste projeto.
-- Use só no projeto vizinhomarket-teste. Depois rode o arquivo vizinhomarket_banco_completo.sql.

-- agendamentos (se existirem)
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname like 'vm-%';
  end if;
end $$;

-- regras das fotos e gatilho de cadastro (ficam fora da área "public")
drop policy if exists "imagens: leitura pública" on storage.objects;
drop policy if exists "imagens: envio na própria pasta" on storage.objects;
drop policy if exists "imagens: apagar da própria pasta" on storage.objects;
drop trigger if exists on_auth_user_created on auth.users;

-- contas de teste (sem o banco, elas ficariam sem perfil)
delete from auth.users;

-- área "public" inteira: tabelas, funções e tipos do VizinhoMarket
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;

select 'banco zerado — agora rode vizinhomarket_banco_completo.sql' as proximo_passo;
