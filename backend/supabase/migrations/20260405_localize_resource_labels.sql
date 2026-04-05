begin;

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

update public.bookings
set booking_label = public.build_requested_resources_label(requested_resources)
where jsonb_array_length(coalesce(requested_resources, '[]'::jsonb)) > 0;

commit;
