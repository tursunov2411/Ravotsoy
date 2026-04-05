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
