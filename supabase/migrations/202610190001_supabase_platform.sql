-- VizinhoMarket — recursos que só existem no Supabase (tempo real e armazenamento de imagens).
-- Não roda nos testes locais (PGlite), que não têm os schemas storage e supabase_realtime.

-- Tempo real: lojas recebem pedido novo na hora; cliente acompanha o status.
-- As regras de leitura (RLS) continuam valendo: cada um só recebe eventos dos pedidos que pode ver.
alter publication supabase_realtime add table public.orders, public.order_events;

-- Imagens públicas (logo, capa e fotos de produto). Cada usuário só grava na própria pasta: <user_id>/arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-images', 'public-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "imagens: leitura pública" on storage.objects for select using (bucket_id = 'public-images');
create policy "imagens: envio na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "imagens: apagar da própria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);
