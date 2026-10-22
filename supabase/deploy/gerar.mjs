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
const read = (f) => readFileSync(join(mig, f), 'utf8').trimEnd();
const block = (f) => `-- ================= migrations/${f} =================\n${read(f)}\n`;
const hoje = '22/10/2026';

const completo = `-- VizinhoMarket — banco COMPLETO (instalação do zero), com Blocos 1 e 2, totais no servidor, Farmácia inativa, favoritos, bairros e atendentes. Gerado em ${hoje}.
-- Gerado por supabase/deploy/gerar.mjs a partir de supabase/migrations (não edite à mão).
-- Colar no SQL Editor do Supabase e clicar em Run.

-- PARTE 1 (tudo ou nada)
begin;

${files.filter((f) => f !== CRON).map(block).join('\n')}
commit;

-- PARTE 2: agendamentos (pg_cron). Se der erro aqui, a Parte 1 já está salva:
-- ative 'pg_cron' em Database → Extensions e rode só estas 3 linhas de novo.
${read(CRON).split('\n').filter((l) => !l.startsWith('--')).join('\n').trim()}

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

const novos05 = ['202610220001_favoritos.sql', '202610220002_bairros_taxa.sql', '202610220003_atendentes.sql'];
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
console.log('gerados: vizinhomarket_banco_completo.sql, 04_atualizacao_totais_farmacia.sql, 05_atualizacao_favoritos_bairros_equipe.sql');
