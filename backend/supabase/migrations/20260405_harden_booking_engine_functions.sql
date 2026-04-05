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
