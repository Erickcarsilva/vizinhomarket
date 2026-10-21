-- =====================================================================================
-- VizinhoMarket — ZERAR o banco do projeto de TESTE para reinstalar do zero.
-- PERIGO: apaga TODAS as tabelas do VizinhoMarket e TODAS as contas de login do projeto.
-- NUNCA rode no projeto de produção.
--
-- Este script tem 3 travas e não apaga nada se qualquer uma falhar:
--   1. O projeto precisa estar marcado como teste. Rode UMA vez, só no projeto de teste:
--        insert into public.platform_settings (key, value) values ('ambiente', '"teste"')
--        on conflict (key) do update set value = excluded.value;
--   2. Troque 'NAO' por 'SIM-APAGAR-TUDO' na linha "v_confirmacao" abaixo.
--   3. Se o banco parecer ter uso real (mais de 30 contas ou mais de 50 pedidos entregues),
--      troque também v_mesmo_com_dados para true — só se tiver certeza de que é teste.
--
-- Depois de zerar, rode supabase/deploy/vizinhomarket_banco_completo.sql.
-- =====================================================================================

do $$
declare
  v_confirmacao     text    := 'NAO';     -- trava 2: troque para 'SIM-APAGAR-TUDO'
  v_mesmo_com_dados boolean := false;     -- trava 3: só se o banco tiver muitos dados de teste
  v_ambiente text;
  v_contas int;
  v_entregues int := 0;
begin
  -- trava 1: marcação de projeto de teste
  if to_regclass('public.platform_settings') is not null then
    execute $q$select value #>> '{}' from public.platform_settings where key = 'ambiente'$q$ into v_ambiente;
  end if;
  if coalesce(v_ambiente, '') <> 'teste' then
    raise exception 'RECUSADO: este projeto não está marcado como teste (platform_settings.ambiente). Nada foi apagado.';
  end if;

  -- trava 2: confirmação escrita
  if v_confirmacao <> 'SIM-APAGAR-TUDO' then
    raise exception 'RECUSADO: confirmação não preenchida (v_confirmacao). Nada foi apagado.';
  end if;

  -- trava 3: sinais de uso real
  select count(*) into v_contas from auth.users;
  if to_regclass('public.orders') is not null then
    execute $q$select count(*) from public.orders where status = 'DELIVERED'$q$ into v_entregues;
  end if;
  if (v_contas > 30 or v_entregues > 50) and not v_mesmo_com_dados then
    raise exception 'RECUSADO: o banco tem % contas e % pedidos entregues — parece uso real. Nada foi apagado.', v_contas, v_entregues;
  end if;

  -- agendamentos (se existirem)
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname like 'vm-%';
  end if;

  -- regras das fotos e gatilho de cadastro (ficam fora da área "public")
  if to_regclass('storage.objects') is not null then
    drop policy if exists "imagens: leitura pública" on storage.objects;
    drop policy if exists "imagens: envio na própria pasta" on storage.objects;
    drop policy if exists "imagens: apagar da própria pasta" on storage.objects;
  end if;
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

  raise notice 'Banco zerado (% contas apagadas). Agora rode vizinhomarket_banco_completo.sql.', v_contas;
end $$;
