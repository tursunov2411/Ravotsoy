alter function public.set_updated_at()
set search_path = public;

alter function public.notify_booking_to_telegram()
set search_path = public;

drop policy if exists "Anyone can create bookings" on public.bookings;
drop policy if exists "Public can insert bookings" on public.bookings;
create policy "Public can insert bookings"
on public.bookings for insert
to anon, authenticated
with check (
  status = 'pending'
  and nullif(btrim(name), '') is not null
  and nullif(btrim(phone), '') is not null
  and guests > 0
  and estimated_price >= 0
  and (email is null or nullif(btrim(email), '') is not null)
  and (date_end is null or date_end >= date_start)
);

drop policy if exists "Admin bookings read" on public.bookings;
drop policy if exists "Admin bookings manage" on public.bookings;
drop policy if exists "Admin bookings delete" on public.bookings;

drop policy if exists "Admin packages manage" on public.packages;

drop policy if exists "Admin storage insert" on storage.objects;
drop policy if exists "Admin storage update" on storage.objects;
drop policy if exists "Admin storage delete" on storage.objects;

drop table if exists public.media_assets cascade;
drop table if exists public.package_images cascade;
