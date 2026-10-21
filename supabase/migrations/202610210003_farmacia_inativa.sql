-- VizinhoMarket — Farmácia fora do piloto.
-- Medicamentos têm regras sanitárias próprias (Anvisa, farmacêutico responsável, receita).
-- A categoria fica inativa: some do app e register_store já recusa categoria inativa ("Categoria inválida").
-- Para reativar no futuro, depois da análise jurídica: update public.categories set active = true where slug = 'farmacia';

update public.categories set active = false where slug = 'farmacia';

do $$
declare n int;
begin
  select count(*) into n from public.stores s join public.categories c on c.id = s.category_id
  where c.slug = 'farmacia';
  if n > 0 then
    raise notice 'Atenção: % loja(s) cadastrada(s) na categoria Farmácia. Revise no painel admin.', n;
  end if;
end $$;
