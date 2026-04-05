begin;

drop trigger if exists bookings_telegram_webhook on public.bookings;

create table if not exists public.telegram_processed_updates (
  bot_name text not null,
  update_id bigint not null,
  processed_at timestamptz not null default timezone('utc'::text, now()),
  primary key (bot_name, update_id)
);

create table if not exists public.telegram_prefills (
  token text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default timezone('utc'::text, now()) + interval '2 days'
);

create index if not exists telegram_prefills_expires_at_idx
  on public.telegram_prefills (expires_at desc);

alter table public.site_settings
  add column if not exists payment_deposit_ratio numeric(5, 4);

update public.site_settings
set payment_deposit_ratio = 0.3
where payment_deposit_ratio is null;

alter table public.site_settings
  alter column payment_deposit_ratio set default 0.3;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_settings_payment_deposit_ratio_check'
      and conrelid = 'public.site_settings'::regclass
  ) then
    alter table public.site_settings
      add constraint site_settings_payment_deposit_ratio_check
      check (payment_deposit_ratio > 0 and payment_deposit_ratio <= 1);
  end if;
end
$$;

create unique index if not exists pricing_rules_resource_type_key
  on public.pricing_rules (resource_type);

update public.site_settings
set
  description = replace(coalesce(description, ''), 'paketlari', 'joylari'),
  about_text = replace(coalesce(about_text, ''), 'paketlari', 'joylari');

update public.content_sections
set
  eyebrow = case when section_type = 'packages' then 'Joylar' else eyebrow end,
  title = case when section_type = 'packages' then 'Resurs konfiguratori' else title end,
  description = case
    when section_type = 'packages' then 'Tapchan va xonalarni tanlang, narxni hisoblang va Telegram orqali bronni davom ettiring.'
    else description
  end
where section_type = 'packages';

with ranked as (
  select id, row_number() over (order by name, id) as rn
  from public.resources
  where type = 'room_small'
)
update public.resources resource
set
  name = case ranked.rn when 1 then 'Kichik xona #1' when 2 then 'Kichik xona #2' else resource.name end,
  capacity = 5,
  is_active = ranked.rn <= 2
from ranked
where resource.id = ranked.id;

insert into public.resources (type, name, capacity, is_active)
select 'room_small', item.name, 5, true
from (values ('Kichik xona #1'), ('Kichik xona #2')) as item(name)
where not exists (
  select 1
  from public.resources resource
  where resource.type = 'room_small'
    and resource.name = item.name
);

update public.resources
set is_active = false
where type = 'room_small'
  and name not in ('Kichik xona #1', 'Kichik xona #2');

with ranked as (
  select id, row_number() over (order by name, id) as rn
  from public.resources
  where type = 'room_big'
)
update public.resources resource
set
  name = case ranked.rn when 1 then 'Katta xona #1' when 2 then 'Katta xona #2' else resource.name end,
  capacity = 10,
  is_active = ranked.rn <= 2
from ranked
where resource.id = ranked.id;

insert into public.resources (type, name, capacity, is_active)
select 'room_big', item.name, 10, true
from (values ('Katta xona #1'), ('Katta xona #2')) as item(name)
where not exists (
  select 1
  from public.resources resource
  where resource.type = 'room_big'
    and resource.name = item.name
);

update public.resources
set is_active = false
where type = 'room_big'
  and name not in ('Katta xona #1', 'Katta xona #2');

with ranked as (
  select id, row_number() over (order by name, id) as rn
  from public.resources
  where type = 'tapchan_small'
)
update public.resources resource
set
  name = case ranked.rn
    when 1 then 'Kichik tapchan #1'
    when 2 then 'Kichik tapchan #2'
    when 3 then 'Kichik tapchan #3'
    else resource.name
  end,
  capacity = 6,
  is_active = ranked.rn <= 3
from ranked
where resource.id = ranked.id;

insert into public.resources (type, name, capacity, is_active)
select 'tapchan_small', item.name, 6, true
from (values ('Kichik tapchan #1'), ('Kichik tapchan #2'), ('Kichik tapchan #3')) as item(name)
where not exists (
  select 1
  from public.resources resource
  where resource.type = 'tapchan_small'
    and resource.name = item.name
);

update public.resources
set is_active = false
where type = 'tapchan_small'
  and name not in ('Kichik tapchan #1', 'Kichik tapchan #2', 'Kichik tapchan #3');

insert into public.resources (type, name, capacity, is_active)
select 'tapchan_big', item.name, 10, true
from (values ('Katta tapchan #1'), ('Katta tapchan #2')) as item(name)
where not exists (
  select 1
  from public.resources resource
  where resource.type = 'tapchan_big'
    and resource.name = item.name
);

update public.resources
set
  capacity = 10,
  is_active = true
where type = 'tapchan_big'
  and name in ('Katta tapchan #1', 'Katta tapchan #2');

update public.resources
set is_active = false
where type = 'tapchan_big'
  and name not in ('Katta tapchan #1', 'Katta tapchan #2');

insert into public.resources (type, name, capacity, is_active)
select 'tapchan_very_big', item.name, 15, true
from (values ('Juda katta tapchan #1'), ('Juda katta tapchan #2')) as item(name)
where not exists (
  select 1
  from public.resources resource
  where resource.type = 'tapchan_very_big'
    and resource.name = item.name
);

update public.resources
set
  capacity = 15,
  is_active = true
where type = 'tapchan_very_big'
  and name in ('Juda katta tapchan #1', 'Juda katta tapchan #2');

update public.resources
set is_active = false
where type = 'tapchan_very_big'
  and name not in ('Juda katta tapchan #1', 'Juda katta tapchan #2');

insert into public.pricing_rules (
  resource_type,
  base_price,
  price_per_extra_person,
  max_included_people,
  discount_if_excluded,
  includes_tapchan
)
values
  ('room_small', 500000, 0, 5, 0.2, true),
  ('room_big', 800000, 0, 10, 0.2, true),
  ('tapchan_small', 200000, 40000, 5, 0, false),
  ('tapchan_big', 350000, 35000, 8, 0, false),
  ('tapchan_very_big', 450000, 35000, 12, 0, false)
on conflict (resource_type) do update
set
  base_price = excluded.base_price,
  price_per_extra_person = excluded.price_per_extra_person,
  max_included_people = excluded.max_included_people,
  discount_if_excluded = excluded.discount_if_excluded,
  includes_tapchan = excluded.includes_tapchan;

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
  v_missing_pricing integer := 0;
  v_missing_inventory integer := 0;
  v_unavailable_count integer := 0;
  v_extra_needed integer := 0;
  v_extra_price integer := 0;
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
      greatest(coalesce((item->>'quantity')::integer, 0), 0) as quantity,
      case
        when coalesce(item->>'includeTapchan', item->>'include_tapchan', '') = '' then null
        else lower(coalesce(item->>'includeTapchan', item->>'include_tapchan')) in ('true', '1', 'yes', 'on')
      end as include_tapchan
    from jsonb_array_elements(coalesce(p_resource_requests, '[]'::jsonb)) as item
  ),
  normalized as (
    select
      resource_type,
      coalesce(include_tapchan, true) as include_tapchan,
      sum(quantity)::integer as quantity
    from requested
    where resource_type is not null
      and quantity > 0
    group by resource_type, coalesce(include_tapchan, true)
  ),
  configured as (
    select
      normalized.resource_type,
      normalized.include_tapchan,
      normalized.quantity,
      pricing.base_price,
      pricing.price_per_extra_person,
      pricing.max_included_people,
      pricing.discount_if_excluded,
      pricing.includes_tapchan,
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
      ), 0) as available_units,
      case
        when normalized.resource_type like 'room_%'
          and pricing.includes_tapchan
          and normalized.include_tapchan = false
          then greatest(round(pricing.base_price * (1 - pricing.discount_if_excluded))::integer, 0)
        else coalesce(pricing.base_price, 0)
      end as effective_base_price
    from normalized
    left join public.pricing_rules pricing
      on pricing.resource_type = normalized.resource_type
  ),
  summary as (
    select
      count(*)::integer as selection_count,
      coalesce(sum(configured.unit_capacity * configured.quantity), 0)::integer as total_capacity,
      coalesce(sum(configured.effective_base_price * configured.quantity * configured.duration_units), 0)::integer as total_base_price,
      coalesce(sum(configured.max_included_people * configured.quantity), 0)::integer as total_included_people,
      count(*) filter (where configured.base_price is null)::integer as missing_pricing,
      count(*) filter (where configured.total_units = 0)::integer as missing_inventory,
      count(*) filter (where configured.available_units < configured.quantity)::integer as unavailable_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'resourceType', configured.resource_type,
            'quantity', configured.quantity,
            'includeTapchan', configured.include_tapchan,
            'unitCapacity', configured.unit_capacity,
            'availableUnits', configured.available_units,
            'totalUnits', configured.total_units,
            'durationUnits', configured.duration_units,
            'basePrice', coalesce(configured.base_price, 0),
            'effectiveBasePrice', coalesce(configured.effective_base_price, 0),
            'pricePerExtraPerson', coalesce(configured.price_per_extra_person, 0),
            'maxIncludedPeople', coalesce(configured.max_included_people, 0),
            'discountIfExcluded', coalesce(configured.discount_if_excluded, 0),
            'includesTapchan', coalesce(configured.includes_tapchan, false)
          )
          order by configured.resource_type, configured.include_tapchan desc
        ),
        '[]'::jsonb
      ) as selections,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'resourceType', configured.resource_type,
            'includeTapchan', configured.include_tapchan,
            'requestedQuantity', configured.quantity,
            'availableUnits', configured.available_units,
            'totalUnits', configured.total_units
          )
        ) filter (where configured.available_units < configured.quantity or configured.total_units = 0 or configured.base_price is null),
        '[]'::jsonb
      ) as unavailable
    from configured
  )
  select
    selection_count,
    total_capacity,
    total_base_price,
    total_included_people,
    missing_pricing,
    missing_inventory,
    unavailable_count,
    selections,
    unavailable,
    0
  into
    v_selection_count,
    v_total_capacity,
    v_total_base_price,
    v_total_included_people,
    v_missing_pricing,
    v_missing_inventory,
    v_unavailable_count,
    v_selections,
    v_unavailable,
    v_extra_price
  from summary;

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

  v_extra_needed := greatest(p_people_count - v_total_included_people, 0);

  with requested as (
    select
      nullif(btrim(coalesce(item->>'resourceType', item->>'resource_type', item->>'type')), '') as resource_type,
      greatest(coalesce((item->>'quantity')::integer, 0), 0) as quantity,
      case
        when coalesce(item->>'includeTapchan', item->>'include_tapchan', '') = '' then null
        else lower(coalesce(item->>'includeTapchan', item->>'include_tapchan')) in ('true', '1', 'yes', 'on')
      end as include_tapchan
    from jsonb_array_elements(coalesce(p_resource_requests, '[]'::jsonb)) as item
  ),
  normalized as (
    select
      resource_type,
      coalesce(include_tapchan, true) as include_tapchan,
      sum(quantity)::integer as quantity
    from requested
    where resource_type is not null
      and quantity > 0
    group by resource_type, coalesce(include_tapchan, true)
  ),
  configured as (
    select
      normalized.resource_type,
      normalized.include_tapchan,
      normalized.quantity,
      pricing.price_per_extra_person,
      pricing.max_included_people,
      coalesce((
        select max(resource.capacity)
        from public.resources resource
        where resource.type = normalized.resource_type
          and resource.is_active
      ), 0) as unit_capacity
    from normalized
    left join public.pricing_rules pricing
      on pricing.resource_type = normalized.resource_type
  ),
  unit_expansion as (
    select
      configured.resource_type,
      configured.price_per_extra_person,
      configured.max_included_people,
      configured.unit_capacity
    from configured
    cross join lateral generate_series(1, configured.quantity)
  ),
  extra_bands as (
    select
      price_per_extra_person,
      greatest(unit_capacity - max_included_people, 0) as extra_capacity,
      coalesce(sum(greatest(unit_capacity - max_included_people, 0)) over (
        order by price_per_extra_person, resource_type
        rows between unbounded preceding and 1 preceding
      ), 0) as previous_capacity
    from unit_expansion
    where price_per_extra_person > 0
      and unit_capacity > max_included_people
  )
  select coalesce(sum(
    greatest(least(v_extra_needed - previous_capacity, extra_capacity), 0) * price_per_extra_person
  )::integer, 0)
  into v_extra_price
  from extra_bands;

  v_total_price := v_total_base_price + v_extra_price;

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

create or replace function public.submit_booking_proof(
  p_booking_id uuid,
  p_proof_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_amount integer;
  v_deposit_ratio numeric(5, 4);
begin
  if p_booking_id is null then
    raise exception 'Booking is required';
  end if;

  if p_proof_url is null or btrim(p_proof_url) = '' then
    raise exception 'Proof is required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if v_booking.status not in ('pending', 'proof_submitted') then
    raise exception 'Booking is not accepting proof';
  end if;

  if v_booking.payment_status = 'paid' then
    raise exception 'Booking is already paid';
  end if;

  select coalesce(payment_deposit_ratio, 0.3)
  into v_deposit_ratio
  from public.site_settings
  where id = 1;

  v_amount := greatest(
    ceil(greatest(coalesce(v_booking.total_price, v_booking.estimated_price::integer, 0), 0) * coalesce(v_deposit_ratio, 0.3))::integer,
    0
  );

  select id
  into v_payment_id
  from public.payments
  where booking_id = p_booking_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_payment_id is null then
    insert into public.payments (
      booking_id,
      amount,
      proof_url,
      status
    )
    values (
      p_booking_id,
      v_amount,
      btrim(p_proof_url),
      'pending'
    )
    returning id into v_payment_id;
  else
    update public.payments
    set
      amount = v_amount,
      proof_url = btrim(p_proof_url)
    where id = v_payment_id;
  end if;

  update public.bookings
  set
    status = 'proof_submitted',
    payment_status = 'pending_verification'
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payment_id', v_payment_id,
    'status', 'proof_submitted',
    'payment_status', 'pending_verification'
  );
end;
$function$;

commit;
