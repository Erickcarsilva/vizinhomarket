-- VizinhoMarket — favoritos salvos na conta (antes ficavam só no navegador).
-- Cada pessoa vê, adiciona e remove só os próprios. Somem junto com a conta ou com o produto.

create table public.favorites (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index on public.favorites (product_id);

alter table public.favorites enable row level security;
revoke all on public.favorites from public, anon, authenticated;
grant select, delete on public.favorites to authenticated;
grant insert (product_id) on public.favorites to authenticated;

create policy favorites_read   on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated using (user_id = auth.uid());
