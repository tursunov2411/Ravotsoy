alter table public.media
  add column if not exists resource_type text;

update public.media
set resource_type = nullif(split_part(storage_path, '/', 2), '')
where type = 'service'
  and resource_type is null
  and storage_path like 'services/%/%';

alter table public.media
  drop constraint if exists media_type_check;

alter table public.media
  add constraint media_type_check
  check (type in ('hero', 'gallery', 'package', 'service'));

alter table public.media
  drop constraint if exists media_resource_type_check;

alter table public.media
  add constraint media_resource_type_check
  check (
    resource_type is null
    or resource_type in (
      'room_small',
      'room_big',
      'tapchan_small',
      'tapchan_big',
      'tapchan_very_big'
    )
  );

create index if not exists media_resource_type_idx
  on public.media (resource_type);
