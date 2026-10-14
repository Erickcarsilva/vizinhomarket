-- VizinhoMarket — dados de referência (não são dados de teste)

insert into public.cities (name, state, slug, timezone, active)
values ('Sidrolândia', 'MS', 'sidrolandia-ms', 'America/Campo_Grande', true);
-- Bairros de Sidrolândia: cadastrar pelo painel Admin com a lista oficial (pendente).

insert into public.categories (slug, name, icon, sort, active, age_restricted, needs_review) values
  ('alimentacao', 'Restaurantes e lanches', 'utensils',     10, true,  false, false),
  ('mercado',     'Mercado',                'shopping-cart',20, true,  false, false),
  ('farmacia',    'Farmácia e saúde',       'pill',         30, true,  false, true),
  ('pet',         'Pet shop',               'paw-print',    40, true,  false, false),
  ('bebidas',     'Bebidas',                'wine',         50, true,  true,  false),
  ('autopecas',   'Autopeças',              'wrench',       60, true,  false, false),
  ('eletronicos', 'Eletrônicos',            'smartphone',   70, true,  false, false),
  ('lojas',       'Lojas e variedades',     'store',        80, true,  false, false),
  ('servicos',    'Serviços',               'briefcase',    90, false, false, false);  -- V2 (agendamento)

-- Comissão padrão PROVISÓRIA (8%). Confirmar na tarefa 0.8 e ajustar por categoria com admin_set_commission_rule.
insert into public.platform_settings (key, value) values
  ('default_commission_rate', '0.08'::jsonb);
