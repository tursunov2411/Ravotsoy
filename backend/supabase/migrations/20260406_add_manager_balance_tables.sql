create extension if not exists pgcrypto;

create table if not exists public.manager_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount integer not null,
  manager_telegram_id bigint,
  manager_chat_id bigint,
  manager_username text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint manager_expenses_name_check check (btrim(name) <> ''),
  constraint manager_expenses_amount_check check (amount > 0)
);

create index if not exists manager_expenses_created_at_idx
  on public.manager_expenses (created_at desc);

create index if not exists manager_expenses_manager_telegram_id_idx
  on public.manager_expenses (manager_telegram_id);

create table if not exists public.manager_balance_handoffs (
  id uuid primary key default gen_random_uuid(),
  amount integer not null,
  note text not null default 'Topshirildi',
  manager_telegram_id bigint,
  manager_chat_id bigint,
  manager_username text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint manager_balance_handoffs_amount_check check (amount > 0),
  constraint manager_balance_handoffs_note_check check (btrim(note) <> '')
);

create index if not exists manager_balance_handoffs_created_at_idx
  on public.manager_balance_handoffs (created_at desc);

create index if not exists manager_balance_handoffs_manager_telegram_id_idx
  on public.manager_balance_handoffs (manager_telegram_id);
