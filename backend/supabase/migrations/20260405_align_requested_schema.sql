create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'staff');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default timezone('utc', now())
);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  type text not null,
  base_price numeric(12, 2) not null default 0,
  price_per_guest numeric(12, 2) not null default 0,
  max_guests integer not null default 1,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists packages_set_updated_at on public.packages;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'packages'
      and column_name = 'updated_at'
  ) then
    alter table public.packages drop column updated_at;
  end if;
end $$;

alter table public.packages
  alter column type type text using type::text,
  alter column base_price type numeric(12, 2) using base_price::numeric,
  alter column price_per_guest type numeric(12, 2) using price_per_guest::numeric;

alter table public.packages
  alter column name set not null,
  alter column description set not null,
  alter column type set not null,
  alter column base_price set not null,
  alter column price_per_guest set not null,
  alter column max_guests set not null,
  alter column created_at set not null;

alter table public.packages drop constraint if exists packages_type_check;
alter table public.packages add constraint packages_type_check check (type in ('stay', 'day'));
alter table public.packages drop constraint if exists packages_max_guests_check;
alter table public.packages add constraint packages_max_guests_check check (max_guests > 0);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  guests integer not null,
  date_start date not null,
  date_end date,
  package_id uuid not null references public.packages(id) on delete restrict,
  estimated_price numeric(12, 2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'customer_name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'name'
  ) then
    alter table public.bookings rename column customer_name to name;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'date_from'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'date_start'
  ) then
    alter table public.bookings rename column date_from to date_start;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'date_to'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'date_end'
  ) then
    alter table public.bookings rename column date_to to date_end;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'total_price'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'estimated_price'
  ) then
    alter table public.bookings rename column total_price to estimated_price;
  end if;
end $$;

alter table public.bookings
  alter column status type text using status::text,
  alter column estimated_price type numeric(12, 2) using estimated_price::numeric;

alter table public.bookings
  alter column name set not null,
  alter column phone set not null,
  alter column guests set not null,
  alter column date_start set not null,
  alter column package_id set not null,
  alter column estimated_price set not null,
  alter column status set not null,
  alter column created_at set not null;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('pending', 'approved', 'rejected'));
alter table public.bookings drop constraint if exists bookings_guests_check;
alter table public.bookings add constraint bookings_guests_check check (guests > 0);
alter table public.bookings drop constraint if exists bookings_date_order_check;
alter table public.bookings add constraint bookings_date_order_check check (date_end is null or date_end >= date_start);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  url text not null,
  package_id uuid references public.packages(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.media
  alter column type set not null,
  alter column url set not null,
  alter column created_at set not null;

alter table public.media drop constraint if exists media_type_check;
alter table public.media add constraint media_type_check check (type in ('hero', 'gallery', 'package'));

create index if not exists bookings_package_id_idx on public.bookings (package_id);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists media_package_id_idx on public.media (package_id);
create index if not exists media_type_idx on public.media (type);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'media_assets'
  ) then
    insert into public.media (type, url, package_id, created_at)
    select
      kind::text,
      public_url,
      null,
      created_at
    from public.media_assets source
    where not exists (
      select 1
      from public.media target
      where target.type = source.kind::text
        and target.url = source.public_url
        and target.package_id is null
    );
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'package_images'
  ) then
    insert into public.media (type, url, package_id, created_at)
    select
      'package',
      public_url,
      package_id,
      created_at
    from public.package_images source
    where not exists (
      select 1
      from public.media target
      where target.type = 'package'
        and target.url = source.public_url
        and target.package_id is not distinct from source.package_id
    );
  end if;
end $$;

drop table if exists public.media_assets cascade;
drop table if exists public.package_images cascade;

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
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.bookings enable row level security;
alter table public.media enable row level security;

drop policy if exists "Admin profiles full access" on public.profiles;
create policy "Admin profiles full access"
on public.profiles for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public packages read" on public.packages;
create policy "Public packages read"
on public.packages for select
using (true);

drop policy if exists "Admin packages full access" on public.packages;
create policy "Admin packages full access"
on public.packages for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public can insert bookings" on public.bookings;
create policy "Public can insert bookings"
on public.bookings for insert
to anon, authenticated
with check (true);

drop policy if exists "Admin bookings full access" on public.bookings;
create policy "Admin bookings full access"
on public.bookings for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public media read" on public.media;
create policy "Public media read"
on public.media for select
using (true);

drop policy if exists "Admin media full access" on public.media;
create policy "Admin media full access"
on public.media for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Public storage read" on storage.objects;
create policy "Public storage read"
on storage.objects for select
using (bucket_id = 'media');

drop policy if exists "Admin storage full access" on storage.objects;
create policy "Admin storage full access"
on storage.objects for all
to authenticated
using (bucket_id = 'media' and public.is_admin(auth.uid()))
with check (bucket_id = 'media' and public.is_admin(auth.uid()));
