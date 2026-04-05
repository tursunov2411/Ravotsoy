create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  location_label text not null default 'Bizning manzilimiz',
  location_url text not null default 'https://yandex.com/maps/-/CHeC5WPL',
  maps_embed_url text,
  contacts_button_label text,
  contacts_button_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.site_settings
  add column if not exists location_label text not null default 'Bizning manzilimiz',
  add column if not exists location_url text not null default 'https://yandex.com/maps/-/CHeC5WPL',
  add column if not exists maps_embed_url text,
  add column if not exists contacts_button_label text,
  add column if not exists contacts_button_url text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.site_settings enable row level security;

drop policy if exists "Public site settings read" on public.site_settings;
create policy "Public site settings read"
on public.site_settings for select
using (true);

drop policy if exists "Admin site settings full access" on public.site_settings;
create policy "Admin site settings full access"
on public.site_settings for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute procedure public.set_updated_at();

insert into public.site_settings (
  id,
  location_label,
  location_url,
  maps_embed_url,
  contacts_button_label,
  contacts_button_url
)
values (
  1,
  'Bizning manzilimiz',
  'https://yandex.com/maps/-/CHeC5WPL',
  null,
  null,
  null
)
on conflict (id) do nothing;
