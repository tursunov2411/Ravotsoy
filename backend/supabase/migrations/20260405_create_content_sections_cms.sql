create extension if not exists pgcrypto;

alter table public.site_settings
  add column if not exists hotel_name text not null default 'Ravotsoy Dam Olish Maskani',
  add column if not exists description text not null default 'Tabiat manzarasi, shinam muhit va oilaviy hordiq uchun mo''ljallangan tunab qolish hamda kunlik dam olish paketlari.',
  add column if not exists about_text text not null default 'Ravotsoy Dam olish Maskani mehmonlarga sokin muhit, keng hudud va sifatli hordiq tajribasini taqdim etadi. Oilaviy sayohat, do''stlar davrasi yoki qisqa kunlik dam olish uchun qulay yechimlar tayyorlangan.',
  add column if not exists hero_images jsonb not null default '[]'::jsonb;

create table if not exists public.content_sections (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  section_type text not null,
  eyebrow text not null default '',
  title text not null default '',
  description text not null default '',
  content jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.content_sections
  add constraint content_sections_page_check check (page in ('home'));

alter table public.content_sections
  add constraint content_sections_type_check check (section_type in ('about', 'highlights', 'packages', 'gallery', 'sightseeing', 'contacts'));

create index if not exists content_sections_page_sort_idx on public.content_sections (page, sort_order);

alter table public.content_sections enable row level security;

drop policy if exists "Public content sections read" on public.content_sections;
create policy "Public content sections read"
on public.content_sections for select
using (true);

drop policy if exists "Admin content sections full access" on public.content_sections;
create policy "Admin content sections full access"
on public.content_sections for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop trigger if exists content_sections_set_updated_at on public.content_sections;
create trigger content_sections_set_updated_at
before update on public.content_sections
for each row execute procedure public.set_updated_at();

insert into public.content_sections (page, section_type, eyebrow, title, description, content, sort_order, is_enabled)
values
  (
    'home',
    'about',
    'Biz haqimizda',
    'Ravotsoyda tabiiy tinchlik va qulay dam olish birlashadi',
    '',
    '{}'::jsonb,
    10,
    true
  ),
  (
    'home',
    'highlights',
    'Afzalliklar',
    'Mehmonlarga yoqadigan asosiy jihatlar',
    '',
    jsonb_build_object(
      'cards',
      jsonb_build_array(
        jsonb_build_object('id', 'nature', 'title', 'Tabiat', 'description', 'Ochiq havo, manzara va osoyishta muhit.', 'icon', 'trees'),
        jsonb_build_object('id', 'comfort', 'title', 'Qulaylik', 'description', 'Toza, shinam va mehmonlar uchun mos tayyor joylar.', 'icon', 'sparkles'),
        jsonb_build_object('id', 'contact', 'title', 'Aloqa', 'description', 'Telegram orqali tezkor javob va bron bo''yicha yordam.', 'icon', 'message-circle')
      )
    ),
    20,
    true
  ),
  (
    'home',
    'packages',
    'Paketlar',
    'Tanlangan paketlar',
    '',
    '{}'::jsonb,
    30,
    true
  ),
  (
    'home',
    'sightseeing',
    'Atrofdagi maskanlar',
    'Ravotsoy atrofida ko''rish mumkin bo''lgan joylar',
    'Dam olish davomida yaqin hududdagi manzarali joylar va sayr uchun qiziqarli nuqtalarni ham ko''rib chiqishingiz mumkin.',
    jsonb_build_object(
      'places',
      jsonb_build_array(
        jsonb_build_object('id', 'ravotsoy-view', 'name', 'Ravotsoy manzarali hududi', 'description', 'Tonggi sayr va sokin manzara uchun mos ochiq hudud.'),
        jsonb_build_object('id', 'family-picnic', 'name', 'Oilaviy piknik joylari', 'description', 'Qisqa dam olish va suratga tushish uchun qulay joylar.')
      )
    ),
    40,
    true
  ),
  (
    'home',
    'gallery',
    'Galereya',
    'Hudud va muhit',
    '',
    '{}'::jsonb,
    50,
    true
  ),
  (
    'home',
    'contacts',
    'Aloqa',
    'Biz bilan bog''laning',
    'Bron, bo''sh joylar va qo''shimcha ma''lumot uchun xodimlarimiz bilan to''g''ridan-to''g''ri gaplashing.',
    '{}'::jsonb,
    60,
    true
  )
on conflict do nothing;
