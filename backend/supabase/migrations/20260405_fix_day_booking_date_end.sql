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
