begin;

alter table public.bookings
  alter column package_id drop not null;

alter table public.bookings
  add column if not exists booking_label text,
  add column if not exists requested_resources jsonb not null default '[]'::jsonb,
  add column if not exists manager_booking_notified_at timestamptz,
  add column if not exists manager_proof_notified_at timestamptz,
  add column if not exists manager_proof_message_id bigint,
  add column if not exists manager_proof_chat_id bigint;

create index if not exists bookings_requested_resources_gin
  on public.bookings
  using gin (requested_resources);

create or replace function public.build_requested_resources_label(
  p_requested_resources jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  with requested as (
    select
      nullif(btrim(coalesce(item->>'resourceType', item->>'resource_type', item->>'type')), '') as resource_type,
      greatest(coalesce((item->>'quantity')::integer, 0), 0) as quantity
    from jsonb_array_elements(coalesce(p_requested_resources, '[]'::jsonb)) as item
  )
  select coalesce(
    string_agg(
      concat(
        case resource_type
          when 'room_small' then 'Kichik xona'
          when 'room_big' then 'Katta xona'
          when 'tapchan_small' then 'Kichik tapchan'
          when 'tapchan_big' then 'Katta tapchan'
          when 'tapchan_very_big' then 'Juda katta tapchan'
          else initcap(replace(resource_type, '_', ' '))
        end,
        case
          when quantity > 1 then ' x' || quantity::text
          else ''
        end
      ),
      ', '
      order by resource_type
    ),
    'Ko''rsatilmagan'
  )
  from requested
  where resource_type is not null
    and quantity > 0;
$$;

with grouped_resources as (
  select
    br.booking_id,
    r.type as resource_type,
    sum(br.quantity)::integer as quantity
  from public.booking_resources br
  join public.resources r
    on r.id = br.resource_id
  group by br.booking_id, r.type
),
packed_resources as (
  select
    booking_id,
    jsonb_agg(
      jsonb_build_object(
        'resourceType', resource_type,
        'quantity', quantity
      )
      order by resource_type
    ) as requested_resources
  from grouped_resources
  group by booking_id
)
update public.bookings b
set
  requested_resources = packed_resources.requested_resources,
  booking_label = public.build_requested_resources_label(packed_resources.requested_resources)
from packed_resources
where packed_resources.booking_id = b.id;

update public.bookings b
set booking_label = p.name
from public.packages p
where p.id = b.package_id
  and (b.booking_label is null or btrim(b.booking_label) = '');

update public.bookings
set booking_label = 'Ko''rsatilmagan'
where booking_label is null
   or btrim(booking_label) = '';

create or replace function public.quote_trip_booking(
  p_resource_requests jsonb,
  p_people_count integer,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_selection_count integer := 0;
  v_total_capacity integer := 0;
  v_total_base_price integer := 0;
  v_total_included_people integer := 0;
  v_max_extra_person_rate integer := 0;
  v_missing_pricing integer := 0;
  v_missing_inventory integer := 0;
  v_unavailable_count integer := 0;
  v_total_price integer := 0;
  v_selections jsonb := '[]'::jsonb;
  v_unavailable jsonb := '[]'::jsonb;
begin
  if p_people_count is null or p_people_count <= 0 then
    raise exception 'People count must be greater than zero';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Valid booking time is required';
  end if;

  with requested as (
    select
      nullif(btrim(coalesce(item->>'resourceType', item->>'resource_type', item->>'type')), '') as resource_type,
      greatest(coalesce((item->>'quantity')::integer, 0), 0) as quantity
    from jsonb_array_elements(coalesce(p_resource_requests, '[]'::jsonb)) as item
  ),
  normalized as (
    select
      resource_type,
      sum(quantity)::integer as quantity
    from requested
    where resource_type is not null
      and quantity > 0
    group by resource_type
  ),
  configured as (
    select
      normalized.resource_type,
      normalized.quantity,
      pricing.base_price,
      pricing.price_per_extra_person,
      pricing.max_included_people,
      case
        when normalized.resource_type like 'room_%' then greatest(
          ceil(extract(epoch from (p_end_time - p_start_time)) / 86400.0)::integer,
          1
        )
        else 1
      end as duration_units,
      coalesce((
        select max(resource.capacity)
        from public.resources resource
        where resource.type = normalized.resource_type
          and resource.is_active
      ), 0) as unit_capacity,
      coalesce((
        select count(*)::integer
        from public.resources resource
        where resource.type = normalized.resource_type
          and resource.is_active
      ), 0) as total_units,
      coalesce((
        select count(*)::integer
        from public.resources resource
        where resource.type = normalized.resource_type
          and resource.is_active
          and not exists (
            select 1
            from public.booking_resources booking_resource
            join public.bookings booking
              on booking.id = booking_resource.booking_id
            where booking_resource.resource_id = resource.id
              and booking.status in ('pending', 'proof_submitted', 'confirmed')
              and booking.start_time < p_end_time
              and booking.end_time > p_start_time
          )
      ), 0) as available_units
    from normalized
    left join public.pricing_rules pricing
      on pricing.resource_type = normalized.resource_type
  )
  select
    count(*)::integer,
    coalesce(sum(unit_capacity * quantity), 0)::integer,
    coalesce(sum(coalesce(base_price, 0) * quantity * duration_units), 0)::integer,
    coalesce(sum(coalesce(max_included_people, 0) * quantity), 0)::integer,
    coalesce(max(coalesce(price_per_extra_person, 0)), 0)::integer,
    count(*) filter (where base_price is null)::integer,
    count(*) filter (where total_units = 0)::integer,
    count(*) filter (where available_units < quantity)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'resourceType', resource_type,
          'quantity', quantity,
          'unitCapacity', unit_capacity,
          'availableUnits', available_units,
          'totalUnits', total_units,
          'durationUnits', duration_units,
          'basePrice', coalesce(base_price, 0),
          'pricePerExtraPerson', coalesce(price_per_extra_person, 0),
          'maxIncludedPeople', coalesce(max_included_people, 0)
        )
        order by resource_type
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'resourceType', resource_type,
          'requestedQuantity', quantity,
          'availableUnits', available_units,
          'totalUnits', total_units
        )
      ) filter (where available_units < quantity or total_units = 0 or base_price is null),
      '[]'::jsonb
    )
  into
    v_selection_count,
    v_total_capacity,
    v_total_base_price,
    v_total_included_people,
    v_max_extra_person_rate,
    v_missing_pricing,
    v_missing_inventory,
    v_unavailable_count,
    v_selections,
    v_unavailable
  from configured;

  if v_selection_count = 0 then
    raise exception 'At least one resource selection is required';
  end if;

  if v_missing_pricing > 0 then
    return jsonb_build_object(
      'available', false,
      'message', 'Pricing is not configured for one or more selected resources',
      'total_price', 0,
      'total_capacity', v_total_capacity,
      'selections', v_selections,
      'unavailable', v_unavailable
    );
  end if;

  if v_missing_inventory > 0 then
    return jsonb_build_object(
      'available', false,
      'message', 'One or more selected resources are not active',
      'total_price', 0,
      'total_capacity', v_total_capacity,
      'selections', v_selections,
      'unavailable', v_unavailable
    );
  end if;

  if p_people_count > v_total_capacity then
    return jsonb_build_object(
      'available', false,
      'message', 'Selected resources do not have enough capacity',
      'total_price', 0,
      'total_capacity', v_total_capacity,
      'selections', v_selections,
      'unavailable', v_unavailable
    );
  end if;

  if v_unavailable_count > 0 then
    return jsonb_build_object(
      'available', false,
      'message', 'Selected resources are not available for the chosen dates',
      'total_price', 0,
      'total_capacity', v_total_capacity,
      'selections', v_selections,
      'unavailable', v_unavailable
    );
  end if;

  v_total_price := v_total_base_price
    + (greatest(p_people_count - v_total_included_people, 0) * v_max_extra_person_rate);

  return jsonb_build_object(
    'available', true,
    'message', 'Resources are available',
    'total_price', greatest(v_total_price, 0),
    'total_capacity', v_total_capacity,
    'selections', v_selections,
    'unavailable', '[]'::jsonb,
    'booking_label', public.build_requested_resources_label(v_selections)
  );
end;
$$;

grant execute on function public.quote_trip_booking(jsonb, integer, timestamptz, timestamptz) to anon, authenticated;

create or replace function public.create_trip_booking_with_locking(
  p_user_id uuid default null,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_people_count integer default null,
  p_resource_requests jsonb default '[]'::jsonb,
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
  v_quote jsonb;
  v_total_price integer := 0;
  v_booking_id uuid;
  v_booking_label text := '';
  v_selection jsonb;
  v_selected_resource_ids uuid[];
  v_resource_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Phone is required';
  end if;

  if p_source not in ('telegram', 'website', 'offline') then
    raise exception 'Unsupported booking source';
  end if;

  v_quote := public.quote_trip_booking(
    p_resource_requests,
    p_people_count,
    p_start_time,
    p_end_time
  );

  if coalesce((v_quote->>'available')::boolean, false) is not true then
    return jsonb_build_object(
      'success', false,
      'available', false,
      'message', coalesce(v_quote->>'message', 'Selected resources are not available'),
      'unavailable', coalesce(v_quote->'unavailable', '[]'::jsonb)
    );
  end if;

  v_total_price := coalesce((v_quote->>'total_price')::integer, 0);
  v_booking_label := coalesce(v_quote->>'booking_label', public.build_requested_resources_label(v_quote->'selections'));

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
    source,
    booking_label,
    requested_resources
  )
  values (
    p_user_id,
    null,
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(coalesce(p_email, '')), ''),
    p_people_count,
    p_people_count,
    (p_start_time at time zone 'utc')::date,
    case
      when (p_end_time at time zone 'utc')::date > (p_start_time at time zone 'utc')::date
        then (p_end_time at time zone 'utc')::date
      else null
    end,
    p_start_time,
    p_end_time,
    v_total_price::numeric,
    v_total_price,
    'pending',
    'awaiting_proof',
    p_source,
    v_booking_label,
    coalesce(v_quote->'selections', '[]'::jsonb)
  )
  returning id into v_booking_id;

  for v_selection in
    select value
    from jsonb_array_elements(coalesce(v_quote->'selections', '[]'::jsonb))
  loop
    select coalesce(array_agg(candidate.id order by candidate.name), '{}')
    into v_selected_resource_ids
    from (
      select resource.id, resource.name
      from public.resources resource
      where resource.type = v_selection->>'resourceType'
        and resource.is_active
        and not exists (
          select 1
          from public.booking_resources booking_resource
          join public.bookings booking
            on booking.id = booking_resource.booking_id
          where booking_resource.resource_id = resource.id
            and booking.status in ('pending', 'proof_submitted', 'confirmed')
            and booking.start_time < p_end_time
            and booking.end_time > p_start_time
        )
      order by resource.name asc
      limit greatest(coalesce((v_selection->>'quantity')::integer, 0), 0)
      for update of resource skip locked
    ) as candidate;

    if coalesce(array_length(v_selected_resource_ids, 1), 0) < greatest(coalesce((v_selection->>'quantity')::integer, 0), 0) then
      delete from public.bookings where id = v_booking_id;

      return jsonb_build_object(
        'success', false,
        'available', false,
        'message', 'Selected resources are no longer available for the chosen dates',
        'unavailable', coalesce(v_quote->'unavailable', '[]'::jsonb)
      );
    end if;

    foreach v_resource_id in array v_selected_resource_ids
    loop
      insert into public.booking_resources (
        booking_id,
        resource_id,
        quantity
      )
      values (
        v_booking_id,
        v_resource_id,
        1
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'success', true,
    'available', true,
    'booking_id', v_booking_id,
    'total_price', v_total_price,
    'booking_label', v_booking_label,
    'selections', coalesce(v_quote->'selections', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.create_trip_booking_with_locking(uuid, text, text, text, integer, jsonb, timestamptz, timestamptz, text) to anon, authenticated;

commit;
