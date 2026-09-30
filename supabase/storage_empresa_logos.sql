-- =====================================================================
-- GestorPro · Espacio de archivos para el logo de la empresa
-- =====================================================================
-- Qué hace: crea en Supabase Storage el bucket "empresa_logos", que usa
-- Configuración → Datos de la empresa para subir, mostrar y reemplazar el logo.
-- Sin este bucket, al guardar un logo aparece el error "Bucket not found".
--
-- Cómo usarlo:
--   1. Entra a tu proyecto en https://supabase.com
--   2. Menú izquierdo → SQL Editor → New query
--   3. Pega todo este archivo y pulsa "Run"
--
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- 1. Bucket público: el logo se muestra en el login, el menú y los tickets.
--    Límite de 5 MB por archivo y solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empresa_logos',
  'empresa_logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Permisos, solo dentro de este bucket.
--    La app sube el logo nuevo, lo lee por su dirección pública
--    y borra el anterior cada vez que se cambia.
drop policy if exists "empresa_logos: leer" on storage.objects;
drop policy if exists "empresa_logos: subir" on storage.objects;
drop policy if exists "empresa_logos: borrar" on storage.objects;

create policy "empresa_logos: leer"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'empresa_logos');

create policy "empresa_logos: subir"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'empresa_logos');

create policy "empresa_logos: borrar"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'empresa_logos');

-- 3. Comprobación: debe mostrar el bucket y sus 3 permisos.
select id, public, file_size_limit from storage.buckets where id = 'empresa_logos';
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'empresa_logos:%';
