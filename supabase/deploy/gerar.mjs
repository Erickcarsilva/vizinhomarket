// Gera os arquivos de instalação a partir de supabase/migrations (fonte única).
//   vizinhomarket_banco_completo.sql  → instalação do zero
//   04_atualizacao_totais_farmacia.sql → atualização de quem já rodou o 03 (21/10)
// Uso: node supabase/deploy/gerar.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mig = join(here, '..', 'migrations');
const files = readdirSync(mig).filter((f) => f.endsWith('.sql')).sort();
const CRON = '202610200002_supabase_platform_agendamentos.sql';
const AVISO = '202610220004_supabase_platform_aviso_pedido.sql'; // usa pg_net: fica na Parte 2, como o pg_cron
const read = (f) => readFileSync(join(mig, f), 'utf8').trimEnd();
const block = (f) => `-- ================= migrations/${f} =================\n${read(f)}\n`;
const hoje = '22/10/2026';
const geradoEm = '23/10/2026'; // banco completo e 08

const completo = `-- VizinhoMarket — banco COMPLETO (instalação do zero), com Blocos 1 e 2, totais no servidor, Farmácia inativa, favoritos, bairros, atendentes e correções de 23/10. Gerado em ${geradoEm}.
-- Gerado por supabase/deploy/gerar.mjs a partir de supabase/migrations (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run.

-- PARTE 1 (tudo ou nada)
begin;

${files.filter((f) => f !== CRON && f !== AVISO).map(block).join('\n')}
commit;

-- PARTE 2: agendamentos (pg_cron). Se der erro aqui, a Parte 1 já está salva:
-- ative 'pg_cron' em Database → Extensions e rode só estas 3 linhas de novo.
${read(CRON).split('\n').filter((l) => !l.startsWith('--')).join('\n').trim()}

-- PARTE 3: aviso de pedido novo com o painel fechado (pg_net). Se der erro, ative 'pg_net' em Database → Extensions
-- e rode só esta parte de novo. Depois cadastre o endereço da função (veja 06_aviso_pedido_novo.sql).
${read(AVISO).trim()}

-- Conferência: tabelas = 29, categorias = 9, agendamentos = 2, funcoes_totais = 3, farmacia_ativa = false
select (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tabelas,
       (select count(*) from public.categories) as categorias,
       (select count(*) from cron.job where jobname like 'vm-%') as agendamentos,
       (select count(*) from pg_proc where proname in ('store_summary','store_daily','store_top_products')) as funcoes_totais,
       (select active from public.categories where slug = 'farmacia') as farmacia_ativa;
`;
writeFileSync(join(here, 'vizinhomarket_banco_completo.sql'), completo);

const novos = ['202610210002_totais_no_servidor.sql', '202610210003_farmacia_inativa.sql'];
const atualizacao = `-- VizinhoMarket — ATUALIZAÇÃO 04: totais do comerciante no servidor e Farmácia fora do piloto (21/10/2026).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run. Pré-requisito: atualização 03 (painel admin) já aplicada.
-- Tudo ou nada: se der erro, nada é gravado.
begin;

${novos.map(block).join('\n')}
commit;

-- Conferência: deve mostrar funcoes_totais = 3 e farmacia_ativa = false
select (select count(*) from pg_proc where proname in ('store_summary','store_daily','store_top_products')) as funcoes_totais,
       (select active from public.categories where slug = 'farmacia') as farmacia_ativa;
`;
writeFileSync(join(here, '04_atualizacao_totais_farmacia.sql'), atualizacao);

const novos05 = ['202610220001_favoritos.sql', '202610220002_bairros_taxa.sql', '202610220003_atendentes.sql', '202610220005_ajustes_seguranca.sql'];
const at05 = `-- VizinhoMarket — ATUALIZAÇÃO 05: favoritos na conta, bairros com taxa por bairro e atendentes da loja (${hoje}).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run. Pré-requisito: atualização 04 já aplicada (funcoes_totais = 3).
-- Não apaga nada. Tudo ou nada: se der erro, nada é gravado.
begin;

${novos05.map(block).join('\n')}
commit;

-- Conferência: deve mostrar favoritos = true, funcoes_novas = 6
select (to_regclass('public.favorites') is not null) as favoritos,
       (select count(*) from pg_proc where proname in ('admin_add_neighborhoods','admin_set_neighborhood_active','store_set_delivery_zones',
                                                     'store_list_members','store_add_staff','store_remove_staff')) as funcoes_novas;
`;
writeFileSync(join(here, '05_atualizacao_favoritos_bairros_equipe.sql'), at05);

// 06: gatilho do aviso + endereço da função no projeto de TESTE (para o de produção, troque o código do projeto).
const REF = 'ehmgvgzeiqhsjhkzvzsj';
const at06 = `-- VizinhoMarket — ATUALIZAÇÃO 06: aviso de pedido novo com o painel fechado (${hoje}).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Pré-requisitos: 05 aplicado e a função novo-pedido publicada (GitHub → Actions → "Publicar funções do Supabase").
-- Projeto: ${REF} (vizinhomarket-teste). Para outro projeto, troque o código na linha do endereço, no fim.
begin;

${block(AVISO)}
insert into public.platform_settings (key, value)
values ('push_function_url', '"https://${REF}.supabase.co/functions/v1/novo-pedido"')
on conflict (key) do update set value = excluded.value;
commit;

-- Conferência: gatilho = true e endereço preenchido
select exists (select 1 from pg_trigger where tgname = 'orders_notify_new') as gatilho,
       (select value #>> '{}' from public.platform_settings where key = 'push_function_url') as endereco;
`;
writeFileSync(join(here, '06_aviso_pedido_novo.sql'), at06);
// 08: correções do servidor (pedido vazio, preço que mudou, Pix guardado no pedido, idade, faturas).
const CORR = '202610230001_correcoes_servidor.sql';
const at08 = `-- VizinhoMarket — ATUALIZAÇÃO 08: correções do servidor (23/10/2026).
-- Gerado por supabase/deploy/gerar.mjs (não edite à mão).
-- Pré-requisito: 07 aplicado. Não apaga dados. Pode rodar de novo sem problema. Tudo ou nada: se der erro, nada é gravado.
begin;

${block(CORR)}
commit;

-- Conferência: deve mostrar pix_no_pedido = true, idade_com_data = true, entrega_com_documento = true
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'pix_key') as pix_no_pedido,
       exists (select 1 from pg_proc where proname = 'confirm_age' and pronargs = 1) as idade_com_data,
       exists (select 1 from pg_proc where proname = 'confirm_delivery' and pronargs = 3) as entrega_com_documento;
`;
writeFileSync(join(here, '08_correcoes_servidor.sql'), at08);
console.log('gerados: vizinhomarket_banco_completo.sql, 04_atualizacao_totais_farmacia.sql, 05_atualizacao_favoritos_bairros_equipe.sql, 06_aviso_pedido_novo.sql, 08_correcoes_servidor.sql');
