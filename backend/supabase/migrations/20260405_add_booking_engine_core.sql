begin;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  name text,
  phone text,
  role text not null default 'customer',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint users_role_check check (role in ('customer', 'manager', 'owner'))
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text not null,
  capacity integer not null,
  is_active boolean not null default true,
  constraint resources_type_check check (
    type in (
      'room_small',
      'room_big',
      'tapchan_small',
      'tapchan_big',
      'tapchan_very_big'
    )
  ),
  constraint resources_capacity_check check (capacity > 0)
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  base_price integer not null,
  price_per_extra_person integer not null default 0,
  max_included_people integer not null default 1,
  discount_if_excluded numeric(5, 4) not null default 0,
  includes_tapchan boolean not null default false,
  constraint pricing_rules_resource_type_check check (
    resource_type in (
      'room_small',
      'room_big',
      'tapchan_small',
      'tapchan_big',
      'tapchan_very_big'
    )
  ),
  constraint pricing_rules_base_price_check check (base_price >= 0),
  constraint pricing_rules_extra_price_check check (price_per_extra_person >= 0),
  constraint pricing_rules_max_included_people_check check (max_included_people > 0),
  constraint pricing_rules_discount_check check (discount_if_excluded >= 0 and discount_if_excluded <= 1)
);

alter table public.bookings
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists payment_status text,
  add column if not exists source text,
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists people_count integer,
  add column if not exists total_price integer;

alter table public.bookings
  drop constraint if exists bookings_status_check;

update public.bookings
set status = 'confirmed'
where status = 'approved';

update public.bookings
set people_count = guests
where people_count is null
  and guests is not null;

update public.bookings
set total_price = greatest(round(coalesce(estimated_price, 0))::integer, 0)
where total_price is null;

update public.bookings
set source = 'website'
where source is null
   or btrim(source) = '';

update public.bookings
set start_time = date_start::timestamptz
where start_time is null
  and date_start is not null;

update public.bookings
set end_time = case
  when date_end is not null and date_end > date_start then date_end::timestamptz
  when date_start is not null then date_start::timestamptz + interval '1 day'
  else end_time
end
where end_time is null;

update public.bookings
set payment_status = case
  when status = 'proof_submitted' then 'pending_verification'
  when status in ('confirmed', 'completed') then 'paid'
  when status in ('rejected', 'cancelled') then 'failed'
  else 'awaiting_proof'
end
where payment_status is null
   or btrim(payment_status) = '';

alter table public.bookings
  alter column status set default 'pending',
  alter column payment_status set default 'awaiting_proof',
  alter column source set default 'website';

alter table public.bookings
  alter column payment_status set not null,
  alter column source set not null,
  alter column start_time set not null,
  alter column end_time set not null,
  alter column people_count set not null,
  alter column total_price set not null;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'proof_submitted', 'confirmed', 'rejected', 'cancelled', 'completed'));

alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('awaiting_proof', 'pending_verification', 'paid', 'failed'));

alter table public.bookings
  drop constraint if exists bookings_source_check;

alter table public.bookings
  add constraint bookings_source_check
  check (source in ('telegram', 'website', 'offline'));

alter table public.bookings
  drop constraint if exists bookings_people_count_check;

alter table public.bookings
  add constraint bookings_people_count_check
  check (people_count is null or people_count > 0);

alter table public.bookings
  drop constraint if exists bookings_total_price_check;

alter table public.bookings
  add constraint bookings_total_price_check
  check (total_price is null or total_price >= 0);

alter table public.bookings
  drop constraint if exists bookings_time_window_check;

alter table public.bookings
  add constraint bookings_time_window_check
  check (
    start_time is null
    or end_time is null
    or end_time > start_time
  );

create table if not exists public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  quantity integer not null default 1,
  constraint booking_resources_quantity_check check (quantity > 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount integer not null,
  proof_url text,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint payments_amount_check check (amount >= 0),
  constraint payments_status_check check (status in ('pending', 'verified', 'rejected'))
);

create unique index if not exists booking_resources_booking_id_resource_id_key
  on public.booking_resources (booking_id, resource_id);

create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists bookings_status_start_time_idx on public.bookings (status, start_time, end_time);
create index if not exists resources_type_is_active_idx on public.resources (type, is_active);
create index if not exists pricing_rules_resource_type_idx on public.pricing_rules (resource_type);
create index if not exists booking_resources_resource_id_idx on public.booking_resources (resource_id);
create index if not exists payments_booking_id_idx on public.payments (booking_id, created_at desc);

create or replace function public.sync_booking_state_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'pending';
    end if;

    if new.status = 'approved' then
      new.status := 'confirmed';
    end if;

    if new.status <> 'pending' then
      raise exception 'New bookings must start in pending status';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = 'approved' then
    new.status := 'confirmed';
  end if;

  if new.people_count is null and new.guests is not null then
    new.people_count := new.guests;
  end if;

  if new.guests is null and new.people_count is not null then
    new.guests := new.people_count;
  end if;

  if new.total_price is null and new.estimated_price is not null then
    new.total_price := greatest(round(new.estimated_price)::integer, 0);
  end if;

  if new.estimated_price is null and new.total_price is not null then
    new.estimated_price := new.total_price::numeric;
  end if;

  if new.start_time is null and new.date_start is not null then
    new.start_time := new.date_start::timestamptz;
  end if;

  if new.date_start is null and new.start_time is not null then
    new.date_start := (new.start_time at time zone 'utc')::date;
  end if;

  if new.end_time is null then
    if new.date_end is not null and new.date_start is not null and new.date_end > new.date_start then
      new.end_time := new.date_end::timestamptz;
    elsif new.start_time is not null then
      new.end_time := new.start_time + interval '1 day';
    end if;
  end if;

  if new.source is null or btrim(new.source) = '' then
    new.source := 'website';
  end if;

  if new.payment_status is null or btrim(new.payment_status) = '' then
    new.payment_status := case
      when new.status = 'proof_submitted' then 'pending_verification'
      when new.status in ('confirmed', 'completed') then 'paid'
      when new.status in ('rejected', 'cancelled') then 'failed'
      else 'awaiting_proof'
    end;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'pending' and new.status not in ('proof_submitted', 'rejected', 'cancelled') then
      raise exception 'Invalid booking transition: % -> %', old.status, new.status;
    end if;

    if old.status = 'proof_submitted' and new.status not in ('confirmed', 'rejected', 'cancelled') then
      raise exception 'Invalid booking transition: % -> %', old.status, new.status;
    end if;

    if old.status = 'confirmed' and new.status not in ('completed', 'cancelled') then
      raise exception 'Invalid booking transition: % -> %', old.status, new.status;
    end if;

    if old.status in ('rejected', 'cancelled', 'completed') then
      raise exception 'Booking in % status cannot transition to %', old.status, new.status;
    end if;
  end if;

  if new.status = 'proof_submitted' and new.payment_status <> 'pending_verification' then
    raise exception 'Proof-submitted bookings must be pending verification';
  end if;

  if new.status in ('confirmed', 'completed') and new.payment_status <> 'paid' then
    raise exception 'Confirmed or completed bookings must be marked paid';
  end if;

  if new.status = 'pending' and new.payment_status = 'paid' then
    raise exception 'Pending bookings cannot be marked paid';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_booking_state_fields on public.bookings;

create trigger sync_booking_state_fields
before insert or update on public.bookings
for each row
execute function public.sync_booking_state_fields();

create or replace function public.get_booking_resource_conflicts(
  p_booking_id uuid
)
returns table(
  booking_id uuid,
  conflicting_booking_id uuid,
  resource_id uuid,
  conflicting_status text
)
language sql
security definer
set search_path = public
as $$
  select
    current_booking.id as booking_id,
    conflicting_booking.id as conflicting_booking_id,
    current_resource.resource_id,
    conflicting_booking.status as conflicting_status
  from public.bookings current_booking
  join public.booking_resources current_resource
    on current_resource.booking_id = current_booking.id
  join public.booking_resources conflicting_resource
    on conflicting_resource.resource_id = current_resource.resource_id
   and conflicting_resource.booking_id <> current_booking.id
  join public.bookings conflicting_booking
    on conflicting_booking.id = conflicting_resource.booking_id
  where current_booking.id = p_booking_id
    and current_booking.status in ('pending', 'proof_submitted', 'confirmed')
    and conflicting_booking.status in ('pending', 'proof_submitted', 'confirmed')
    and conflicting_booking.start_time < current_booking.end_time
    and conflicting_booking.end_time > current_booking.start_time;
$$;

create or replace function public.assert_booking_resources_available(
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict record;
begin
  select *
  into v_conflict
  from public.get_booking_resource_conflicts(p_booking_id)
  limit 1;

  if found then
    raise exception 'Resource % is already allocated by booking %', v_conflict.resource_id, v_conflict.conflicting_booking_id;
  end if;
end;
$$;

create or replace function public.guard_confirmed_booking_resources()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'bookings' then
    if new.status = 'confirmed' then
      perform public.assert_booking_resources_available(new.id);
    end if;
  else
    if exists (
      select 1
      from public.bookings
      where id = new.booking_id
        and status = 'confirmed'
    ) then
      perform public.assert_booking_resources_available(new.booking_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_confirmed_booking_resources on public.bookings;
create trigger guard_confirmed_booking_resources
before insert or update of status, start_time, end_time on public.bookings
for each row
execute function public.guard_confirmed_booking_resources();

drop trigger if exists guard_booking_resource_assignments on public.booking_resources;
create trigger guard_booking_resource_assignments
before insert or update on public.booking_resources
for each row
execute function public.guard_confirmed_booking_resources();

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
      and b.status in ('pending', 'proof_submitted', 'confirmed')
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
    and status in ('pending', 'proof_submitted', 'confirmed');

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
    people_count,
    package_id,
    date_start,
    start_time,
    end_time,
    status,
    payment_status,
    source
  )
  values (
    btrim(p_name),
    btrim(p_phone),
    p_guests,
    p_guests,
    p_package_id,
    p_date_start,
    p_date_start::timestamptz,
    p_date_start::timestamptz + interval '1 day',
    'pending',
    'awaiting_proof',
    'telegram'
  )
  returning id into v_booking_id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id
  );
end;
$$;

grant execute on function public.create_pending_booking_if_available(text, text, integer, uuid, date) to anon, authenticated;

alter table public.users enable row level security;
alter table public.resources enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.booking_resources enable row level security;
alter table public.payments enable row level security;

commit;
