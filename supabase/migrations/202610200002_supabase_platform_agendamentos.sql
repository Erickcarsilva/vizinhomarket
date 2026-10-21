-- VizinhoMarket — agendamentos que só existem no Supabase (pg_cron). Não roda nos testes locais.
create extension if not exists pg_cron;

-- A cada minuto: cancela pedidos que a loja não aceitou dentro do tempo limite (padrão 15 min).
select cron.schedule('vm-expira-pedidos', '* * * * *', $$select public.expire_stale_orders()$$);

-- Todo dia às 4h (UTC): apaga registros de erro com mais de 30 dias.
select cron.schedule('vm-limpa-erros', '0 4 * * *', $$delete from public.client_errors where created_at < now() - interval '30 days'$$);
