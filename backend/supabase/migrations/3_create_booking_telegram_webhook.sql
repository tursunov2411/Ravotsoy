-- Quyidagi qiymatlarni SQL Editor ichida ishga tushirishdan oldin almashtiring:
-- 1. https://YOUR_PUBLIC_NODE_ENDPOINT/telegram/booking
-- 2. change-me
--
-- Eslatma:
-- Supabase localhost'ga murojaat qila olmaydi. Node script uchun public URL kerak
-- (masalan VPS, Render, Railway yoki tunnel orqali ochilgan manzil).

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_booking_to_telegram()
returns trigger
language plpgsql
security definer
as $$
declare
  request_id bigint;
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record',
    jsonb_build_object(
      'id', new.id,
      'name', new.name,
      'phone', new.phone,
      'email', new.email,
      'guests', new.guests,
      'date_start', new.date_start,
      'date_end', new.date_end,
      'estimated_price', new.estimated_price,
      'status', new.status,
      'package_name',
      (select p.name from public.packages p where p.id = new.package_id),
      'type',
      (select p.type from public.packages p where p.id = new.package_id)
    )
  );

  select net.http_post(
    url := 'https://YOUR_PUBLIC_NODE_ENDPOINT/telegram/booking',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'change-me'
    ),
    body := payload
  )
  into request_id;

  return new;
end;
$$;

drop trigger if exists bookings_telegram_webhook on public.bookings;

create trigger bookings_telegram_webhook
after insert on public.bookings
for each row
execute function public.notify_booking_to_telegram();
