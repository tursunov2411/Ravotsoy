insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists payments_booking_id_created_at_idx
  on public.payments (booking_id, created_at desc);

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

  v_amount := greatest(coalesce(v_booking.total_price, v_booking.estimated_price::integer, 0), 0);

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

create or replace function public.approve_booking_proof(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
begin
  if p_booking_id is null then
    raise exception 'Booking is required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if v_booking.status <> 'proof_submitted' then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking is not ready for approval'
    );
  end if;

  if exists (
    select 1
    from public.booking_resources current_br
    join public.booking_resources other_br
      on other_br.resource_id = current_br.resource_id
    join public.bookings other_booking
      on other_booking.id = other_br.booking_id
    where current_br.booking_id = p_booking_id
      and other_br.booking_id <> p_booking_id
      and other_booking.status in ('pending', 'proof_submitted', 'confirmed')
      and other_booking.start_time < v_booking.end_time
      and other_booking.end_time > v_booking.start_time
  ) then
    return jsonb_build_object(
      'success', false,
      'message', 'Resource is no longer available for this booking'
    );
  end if;

  update public.bookings
  set
    status = 'confirmed',
    payment_status = 'paid'
  where id = p_booking_id;

  select id
  into v_payment_id
  from public.payments
  where booking_id = p_booking_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    update public.payments
    set status = 'verified'
    where id = v_payment_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'confirmed',
    'payment_status', 'paid'
  );
end;
$function$;

create or replace function public.reject_booking_proof(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
begin
  if p_booking_id is null then
    raise exception 'Booking is required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if v_booking.status <> 'proof_submitted' then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking is not ready for rejection'
    );
  end if;

  update public.bookings
  set
    status = 'rejected',
    payment_status = 'failed'
  where id = p_booking_id;

  select id
  into v_payment_id
  from public.payments
  where booking_id = p_booking_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    update public.payments
    set status = 'rejected'
    where id = v_payment_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'rejected',
    'payment_status', 'failed'
  );
end;
$function$;
