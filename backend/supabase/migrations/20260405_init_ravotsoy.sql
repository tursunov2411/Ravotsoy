create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'package_type') then
    create type public.package_type as enum ('stay', 'day');
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'staff');
  end if;

  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('hero', 'gallery');
  end if;

  if not exists (select 1 from pg_type where typname = 'media_type') then
    create type public.media_type as enum ('image', 'video');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  type public.package_type not null,
  base_price numeric(12, 2) not null default 0,
  price_per_guest numeric(12, 2) not null default 0,
  max_guests integer not null default 1 check (max_guests > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.package_images (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete restrict,
  customer_name text not null,
  phone text not null,
  email text,
  guests integer not null check (guests > 0),
  date_from date not null,
  date_to date,
  total_price numeric(12, 2) not null default 0,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind public.media_kind not null,
  title text not null,
  media_type public.media_type not null default 'image',
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.package_images enable row level security;
alter table public.bookings enable row level security;
alter table public.media_assets enable row level security;

drop policy if exists "Public packages read" on public.packages;
create policy "Public packages read"
on public.packages for select
using (true);

drop policy if exists "Admin packages manage" on public.packages;
create policy "Admin packages manage"
on public.packages for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public package images read" on public.package_images;
create policy "Public package images read"
on public.package_images for select
using (true);

drop policy if exists "Admin package images manage" on public.package_images;
create policy "Admin package images manage"
on public.package_images for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public media read" on public.media_assets;
create policy "Public media read"
on public.media_assets for select
using (true);

drop policy if exists "Admin media manage" on public.media_assets;
create policy "Admin media manage"
on public.media_assets for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Anyone can create bookings" on public.bookings;
create policy "Anyone can create bookings"
on public.bookings for insert
to anon, authenticated
with check (true);

drop policy if exists "Admin bookings read" on public.bookings;
create policy "Admin bookings read"
on public.bookings for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admin bookings manage" on public.bookings;
create policy "Admin bookings manage"
on public.bookings for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admin bookings delete" on public.bookings;
create policy "Admin bookings delete"
on public.bookings for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
before update on public.packages
for each row execute procedure public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Public storage read" on storage.objects;
create policy "Public storage read"
on storage.objects for select
using (bucket_id = 'media');

drop policy if exists "Admin storage insert" on storage.objects;
create policy "Admin storage insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media' and public.is_admin(auth.uid()));

drop policy if exists "Admin storage update" on storage.objects;
create policy "Admin storage update"
on storage.objects for update
to authenticated
using (bucket_id = 'media' and public.is_admin(auth.uid()))
with check (bucket_id = 'media' and public.is_admin(auth.uid()));

drop policy if exists "Admin storage delete" on storage.objects;
create policy "Admin storage delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'media' and public.is_admin(auth.uid()));
