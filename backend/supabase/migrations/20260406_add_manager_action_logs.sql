create table if not exists public.manager_action_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  entity_type text,
  entity_id text,
  booking_id uuid references public.bookings(id) on delete set null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  actor_telegram_id bigint,
  actor_chat_id bigint,
  actor_username text,
  actor_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists manager_action_logs_created_at_idx
  on public.manager_action_logs (created_at desc);

create index if not exists manager_action_logs_booking_id_idx
  on public.manager_action_logs (booking_id);

create index if not exists manager_action_logs_action_type_idx
  on public.manager_action_logs (action_type);

alter table public.manager_action_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'manager_action_logs'
      and policyname = 'Service role manages manager action logs'
  ) then
    create policy "Service role manages manager action logs"
      on public.manager_action_logs
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end
$$;
