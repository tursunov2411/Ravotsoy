drop trigger if exists packages_set_updated_at on public.packages;

alter table public.packages
  add column if not exists capacity integer;

update public.packages
set capacity = 1
where capacity is null;

alter table public.packages
  alter column capacity set default 1,
  alter column capacity set not null;

alter table public.packages
  drop constraint if exists packages_capacity_check;

alter table public.packages
  add constraint packages_capacity_check check (capacity > 0);

create or replace function public.get_available_booking_dates(
  p_package_id uuid,
  p_days integer default 7
)
returns table(date_start date)
language sql
security definer
set search_path = public
as $$
  with package_capacity as (
    select capacity
    from public.packages
    where id = p_package_id
  ),
  candidate_dates as (
    select generate_series(
      current_date,
      current_date + greatest(coalesce(p_days, 7) - 1, 0),
      interval '1 day'
    )::date as candidate_date
  ),
  booking_counts as (
    select
      b.date_start,
      count(*)::integer as total_bookings
    from public.bookings b
    where b.package_id = p_package_id
      and b.status <> 'rejected'
      and b.date_start between current_date and current_date + greatest(coalesce(p_days, 7) - 1, 0)
    group by b.date_start
  )
  select candidate_dates.candidate_date
  from candidate_dates
  cross join package_capacity
  left join booking_counts
    on booking_counts.date_start = candidate_dates.candidate_date
  where coalesce(booking_counts.total_bookings, 0) < package_capacity.capacity
  order by candidate_dates.candidate_date asc;
$$;

grant execute on function public.get_available_booking_dates(uuid, integer) to anon, authenticated;

create or replace function public.create_pending_booking_if_available(
  p_name text,
  p_phone text,
  p_guests integer,
  p_package_id uuid,
  p_date_start date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_total_bookings integer;
  v_booking_id uuid;
  v_lock_key bigint;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Phone is required';
  end if;

  if p_guests is null or p_guests <= 0 then
    raise exception 'Guests must be greater than zero';
  end if;

  if p_date_start is null then
    raise exception 'Date is required';
  end if;

  select capacity
  into v_capacity
  from public.packages
  where id = p_package_id;

  if v_capacity is null then
    raise exception 'Package not found';
  end if;

  v_lock_key := hashtextextended(p_package_id::text || ':' || p_date_start::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*)::integer
  into v_total_bookings
  from public.bookings
  where package_id = p_package_id
    and date_start = p_date_start
    and status <> 'rejected';

  if v_total_bookings >= v_capacity then
    return jsonb_build_object(
      'success', false,
      'reason', 'capacity_reached'
    );
  end if;

  insert into public.bookings (
    name,
    phone,
    guests,
    package_id,
    date_start,
    status
  )
  values (
    btrim(p_name),
    btrim(p_phone),
    p_guests,
    p_package_id,
    p_date_start,
    'pending'
  )
  returning id into v_booking_id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id
  );
end;
$$;

grant execute on function public.create_pending_booking_if_available(text, text, integer, uuid, date) to anon, authenticated;
