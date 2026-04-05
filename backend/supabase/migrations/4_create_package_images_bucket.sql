insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'package-images',
  'package-images',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Public package images read" on storage.objects;
create policy "Public package images read"
on storage.objects for select
using (bucket_id = 'package-images');

drop policy if exists "Admin package images insert" on storage.objects;
create policy "Admin package images insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'package-images' and public.is_admin(auth.uid()));

drop policy if exists "Admin package images update" on storage.objects;
create policy "Admin package images update"
on storage.objects for update
to authenticated
using (bucket_id = 'package-images' and public.is_admin(auth.uid()))
with check (bucket_id = 'package-images' and public.is_admin(auth.uid()));

drop policy if exists "Admin package images delete" on storage.objects;
create policy "Admin package images delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'package-images' and public.is_admin(auth.uid()));
