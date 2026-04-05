alter table public.site_settings
  add column if not exists contact_people jsonb not null default '[]'::jsonb;

update public.site_settings
set contact_people = '[]'::jsonb
where contact_people is null;
