begin;

alter table public.packages
  add column if not exists resource_type text,
  add column if not exists resource_quantity integer;

update public.packages
set resource_type = case
  when lower(name) like '%tapchan%' then 'tapchan_small'
  when lower(name) like '%katta%' then 'room_big'
  when type = 'stay' then 'room_small'
  else 'tapchan_small'
end
where resource_type is null;

update public.packages
set resource_quantity = greatest(coalesce(capacity, 1), 1)
where resource_quantity is null
   or resource_quantity < 1;

alter table public.packages
  drop constraint if exists packages_resource_type_check;

alter table public.packages
  add constraint packages_resource_type_check
  check (
    resource_type in (
      'room_small',
      'room_big',
      'tapchan_small',
      'tapchan_big',
      'tapchan_very_big'
    )
  );

alter table public.packages
  drop constraint if exists packages_resource_quantity_check;

alter table public.packages
  add constraint packages_resource_quantity_check
  check (resource_quantity > 0);

create unique index if not exists pricing_rules_resource_type_key
  on public.pricing_rules (resource_type);

create unique index if not exists resources_name_key
  on public.resources (name);

alter table public.site_settings
  add column if not exists payment_card_number text,
  add column if not exists payment_card_holder text,
  add column if not exists payment_instructions text,
  add column if not exists payment_manager_telegram text;

insert into public.pricing_rules (
  resource_type,
  base_price,
  price_per_extra_person,
  max_included_people,
  discount_if_excluded,
  includes_tapchan
)
select
  p.resource_type,
  greatest(round(p.base_price)::integer, 0),
  greatest(round(p.price_per_guest)::integer, 0),
  greatest(p.max_guests, 1),
  0,
  false
from public.packages p
where p.resource_type is not null
on conflict (resource_type) do update
set base_price = excluded.base_price,
    price_per_extra_person = excluded.price_per_extra_person,
    max_included_people = excluded.max_included_people;

insert into public.resources (type, name, capacity, is_active)
select
  p.resource_type,
  concat(p.name, ' #', slot_number),
  greatest(p.max_guests, 1),
  true
from public.packages p
cross join lateral generate_series(1, p.resource_quantity) as slot(slot_number)
where p.resource_type is not null
on conflict (name) do update
set type = excluded.type,
    capacity = excluded.capacity,
    is_active = excluded.is_active;

insert into public.booking_resources (booking_id, resource_id, quantity)
select
  b.id,
  resource_match.id,
  1
from public.bookings b
join public.packages p
  on p.id = b.package_id
join lateral (
  select r.id
  from public.resources r
  where r.type = p.resource_type
    and r.is_active
  order by r.name asc
  limit 1
) as resource_match on true
left join public.booking_resources existing
  on existing.booking_id = b.id
where existing.id is null
  and b.status in ('pending', 'proof_submitted', 'confirmed');

create or replace function public.is_resource_available(
  p_resource_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.booking_resources br
    join public.bookings b
      on b.id = br.booking_id
    where br.resource_id = p_resource_id
      and b.status in ('pending', 'proof_submitted', 'confirmed')
      and b.start_time < p_end_time
      and b.end_time > p_start_time
  );
$$;

grant execute on function public.is_resource_available(uuid, timestamptz, timestamptz) to anon, authenticated;

create or replace function public.get_package_availability(
  p_package_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_type text;
  v_resource_quantity integer;
  v_available_count integer;
begin
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Valid booking window is required';
  end if;

  select resource_type, resource_quantity
  into v_resource_type, v_resource_quantity
  from public.packages
  where id = p_package_id;

  if v_resource_type is null or v_resource_quantity is null then
    raise exception 'Package is not configured for reservations';
  end if;

  select count(*)::integer
  into v_available_count
  from public.resources r
  where r.type = v_resource_type
    and r.is_active
    and public.is_resource_available(r.id, p_start_time, p_end_time);

  return jsonb_build_object(
    'available', v_available_count >= v_resource_quantity,
    'available_count', v_available_count,
    'required_quantity', v_resource_quantity,
    'resource_type', v_resource_type,
    'message', case
      when v_available_count >= v_resource_quantity then 'Resource available'
      else 'Resource is not available for selected time'
    end
  );
end;
$$;

grant execute on function public.get_package_availability(uuid, timestamptz, timestamptz) to anon, authenticated;

create or replace function public.calculate_booking_price(
  p_package_id uuid,
  p_people_count integer,
  p_exclude_tapchan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_package record;
  v_extra_people integer;
  v_total integer;
begin
  if p_people_count is null or p_people_count <= 0 then
    raise exception 'People count must be greater than zero';
  end if;

  select id, name, resource_type, max_guests
  into v_package
  from public.packages
  where id = p_package_id;

  if v_package.id is null then
    raise exception 'Package not found';
  end if;

  if p_people_count > v_package.max_guests then
    raise exception 'People count exceeds package capacity';
  end if;

  select *
  into v_rule
  from public.pricing_rules
  where resource_type = v_package.resource_type;

  if v_rule.id is null then
    raise exception 'Pricing rule not configured';
  end if;

  v_extra_people := greatest(p_people_count - v_rule.max_included_people, 0);
  v_total := v_rule.base_price + (v_extra_people * v_rule.price_per_extra_person);

  if p_exclude_tapchan and v_rule.includes_tapchan then
    v_total := round(v_total * (1 - v_rule.discount_if_excluded))::integer;
  end if;

  return jsonb_build_object(
    'success', true,
    'package_id', v_package.id,
    'package_name', v_package.name,
    'resource_type', v_package.resource_type,
    'people_count', p_people_count,
    'base_price', v_rule.base_price,
    'extra_people', v_extra_people,
    'price_per_extra_person', v_rule.price_per_extra_person,
    'total_price', greatest(v_total, 0)
  );
end;
$$;

grant execute on function public.calculate_booking_price(uuid, integer, boolean) to anon, authenticated;

create or replace function public.create_booking_with_locking(
  p_user_id uuid default null,
  p_package_id uuid default null,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_people_count integer default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_source text default 'website'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package record;
  v_price jsonb;
  v_availability jsonb;
  v_total_price integer;
  v_booking_id uuid;
  v_resource_ids uuid[];
  v_message text;
begin
  if p_package_id is null then
    raise exception 'Package is required';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Phone is required';
  end if;

  if p_people_count is null or p_people_count <= 0 then
    raise exception 'People count must be greater than zero';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Valid booking time is required';
  end if;

  if p_source not in ('telegram', 'website', 'offline') then
    raise exception 'Unsupported booking source';
  end if;

  select id, name, type, resource_type, resource_quantity, max_guests
  into v_package
  from public.packages
  where id = p_package_id;

  if v_package.id is null then
    raise exception 'Package not found';
  end if;

  if p_people_count > v_package.max_guests then
    raise exception 'People count exceeds package capacity';
  end if;

  v_price := public.calculate_booking_price(p_package_id, p_people_count, false);
  v_total_price := coalesce((v_price->>'total_price')::integer, 0);
  v_availability := public.get_package_availability(p_package_id, p_start_time, p_end_time);

  if coalesce((v_availability->>'available')::boolean, false) is not true then
    v_message := coalesce(v_availability->>'message', 'Resource is not available for selected time');
    return jsonb_build_object(
      'success', false,
      'available', false,
      'message', v_message
    );
  end if;

  select coalesce(array_agg(candidate.id order by candidate.name), '{}')
  into v_resource_ids
  from (
    select r.id, r.name
    from public.resources r
    where r.type = v_package.resource_type
      and r.is_active
      and not exists (
        select 1
        from public.booking_resources br
        join public.bookings b
          on b.id = br.booking_id
        where br.resource_id = r.id
          and b.status in ('pending', 'proof_submitted', 'confirmed')
          and b.start_time < p_end_time
          and b.end_time > p_start_time
      )
    order by r.name asc
    limit v_package.resource_quantity
    for update of r skip locked
  ) as candidate;

  if coalesce(array_length(v_resource_ids, 1), 0) < v_package.resource_quantity then
    return jsonb_build_object(
      'success', false,
      'available', false,
      'message', 'Resource is not available for selected time'
    );
  end if;

  insert into public.bookings (
    user_id,
    package_id,
    name,
    phone,
    email,
    guests,
    people_count,
    date_start,
    date_end,
    start_time,
    end_time,
    estimated_price,
    total_price,
    status,
    payment_status,
    source
  )
  values (
    p_user_id,
    p_package_id,
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(coalesce(p_email, '')), ''),
    p_people_count,
    p_people_count,
    (p_start_time at time zone 'utc')::date,
    case
      when v_package.type = 'stay'
       and (p_end_time at time zone 'utc')::date > (p_start_time at time zone 'utc')::date
        then (p_end_time at time zone 'utc')::date
      else null
    end,
    p_start_time,
    p_end_time,
    v_total_price::numeric,
    v_total_price,
    'pending',
    'awaiting_proof',
    p_source
  )
  returning id into v_booking_id;

  insert into public.booking_resources (booking_id, resource_id, quantity)
  select v_booking_id, resource_id, 1
  from unnest(v_resource_ids) as resource_id;

  return jsonb_build_object(
    'success', true,
    'available', true,
    'booking_id', v_booking_id,
    'total_price', v_total_price,
    'resource_ids', to_jsonb(v_resource_ids),
    'resource_type', v_package.resource_type
  );
end;
$$;

grant execute on function public.create_booking_with_locking(uuid, uuid, text, text, text, integer, timestamptz, timestamptz, text) to anon, authenticated;

create or replace function public.get_available_booking_dates(
  p_package_id uuid,
  p_days integer default 7
)
returns table(date_start date)
language sql
security definer
set search_path = public
as $$
  with candidate_dates as (
    select generate_series(
      current_date,
      current_date + greatest(coalesce(p_days, 7) - 1, 0),
      interval '1 day'
    )::date as candidate_date
  )
  select candidate_date
  from candidate_dates
  where coalesce(
    (public.get_package_availability(
      p_package_id,
      candidate_date::timestamptz,
      candidate_date::timestamptz + interval '1 day'
    )->>'available')::boolean,
    false
  ) is true
  order by candidate_date asc;
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
language sql
security definer
set search_path = public
as $$
  select public.create_booking_with_locking(
    null,
    p_package_id,
    p_name,
    p_phone,
    null,
    p_guests,
    p_date_start::timestamptz,
    p_date_start::timestamptz + interval '1 day',
    'telegram'
  );
$$;

grant execute on function public.create_pending_booking_if_available(text, text, integer, uuid, date) to anon, authenticated;

commit;
