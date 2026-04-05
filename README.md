# Ravotsoy

Resource-first hospitality booking system for Ravotsoy.

## Stack

- `frontend`: React + Vite + TypeScript
- `backend`: Node.js + Express webhook/API server
- `database`: Supabase PostgreSQL
- `bots`: Telegram customer bot + Telegram manager bot

## Current Architecture

- No package-based booking logic is used in the active flow.
- Website is a configurator only.
- Booking is finalized in Telegram.
- Backend is the single source of truth for:
  - availability
  - pricing
  - booking creation
  - proof submission
  - manager approval/rejection

## Active Resources

- `room_small`: 2 units, capacity 5 each
- `room_big`: 2 units, capacity 10 each
- `tapchan_small`: 3 units, capacity 6 each
- `tapchan_big`: 2 units, capacity 10 each
- `tapchan_very_big`: 2 units, capacity 15 each

## Pricing Model

Configured in `pricing_rules`, not hardcoded in the UI.

- `room_small`: `500000`
- `room_big`: `800000`
- room tapchan excluded: `20%` discount
- `tapchan_small`: `200000` up to 5, then `40000` extra person
- `tapchan_big`: `350000` up to 8, then `35000` extra person
- `tapchan_very_big`: `450000` up to 12, then `35000` extra person

Deposit percentage is configured in `site_settings.payment_deposit_ratio`.

## Environment

### Backend

Create `backend/.env`:

```env
CUSTOMER_BOT_TOKEN=your_customer_bot_token
MANAGER_BOT_TOKEN=your_manager_bot_token
CHAT_ID=your_manager_group_chat_id
PORT=3001
WEBHOOK_SECRET=your_random_secret
FRONTEND_URL=https://your-frontend-domain.vercel.app
BACKEND_PUBLIC_URL=https://your-backend-domain.onrender.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Frontend

Create `frontend/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_TELEGRAM_USERNAME=your_customer_bot_username
VITE_BACKEND_URL=https://your-backend-domain.onrender.com
```

## Local Run

```bash
npm install
npm run dev
```

Backend only:

```bash
npm run start --workspace backend
```

## Important Migrations

The live project already uses the resource-first migrations. The key migration files are:

- `backend/supabase/migrations/20260405_resource_first_trip_builder.sql`
- `backend/supabase/migrations/20260405_localize_resource_labels.sql`
- `backend/supabase/migrations/20260405_finalize_resource_flow_and_telegram_idempotency.sql`
- `backend/supabase/migrations/20260405_fix_quote_trip_booking_aggregation.sql`
- `backend/supabase/migrations/20260405_label_include_tapchan_choice.sql`

Do not rerun old package-era trigger migrations on a live project.

## Telegram Setup

Register both bot webhooks and command menus:

```bash
npm run telegram:register --workspace backend
```

This configures:

- customer bot webhook: `/webhook/customer`
- manager bot webhook: `/webhook/manager`
- customer commands: `/start`, `/book`, `/resources`, `/contact`, `/help`

## Deploy

### Render

Backend service:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

### Vercel

`vercel.json` is already configured to build the frontend from the monorepo root and publish `frontend/dist`.

## Live Flow

1. User configures resources on website
2. Website requests backend quote
3. Website creates Telegram prefill token
4. User is redirected to Telegram bot
5. Bot collects name and phone
6. Backend creates booking
7. Bot shows card details and required deposit amount
8. User uploads proof
9. Manager bot receives inline controls: approve / reject / view

## Notes

- Duplicate Telegram updates are blocked through stored `telegram_processed_updates`.
- Old Supabase booking trigger webhook is no longer part of the active flow.
- Public website package pages were removed from the active app flow.
