# Ravotsoy Operations System

Ravotsoy is a resource-first hospitality operations system for a real property team. It combines:

- a public website for discovery and booking handoff
- a customer Telegram bot for booking completion and proof submission
- a manager Telegram bot for daily operations
- Supabase as the operational source of truth
- Render for the live backend/webhook runtime

## What Is Live

- Customer booking flow from website to Telegram
- Manager booking approvals and proof review
- Offline booking creation with flexible custom pricing
- Customer self-cancellation
- Monthly booking calendar in the manager bot
- Balance, expenses, handovers, and manager earnings
- Diagnostics and wake/reconnect tools for Render cold starts
- Manager-control handover to another Telegram user
- Manager group notifications through `MANAGER_GROUP_CHAT_ID`
- Operational audit logging with DB table support and fallback storage

## Repo Layout

- `frontend/`: React + Vite website and admin UI
- `backend/`: Express API, webhook server, Telegram bots, services, scripts
- `backend/supabase/migrations/`: schema migrations
- `docs/`: PRD, runbooks, env reference, deployment, audit docs

## Docs

- [Docs Index](/c:/Users/nuobe/Desktop/Hotel%20services/docs/README.md)
- [PRD](/c:/Users/nuobe/Desktop/Hotel%20services/docs/PRD.md)
- [Operations Runbook](/c:/Users/nuobe/Desktop/Hotel%20services/docs/OPERATIONS_RUNBOOK.md)
- [Manager Bot Guide](/c:/Users/nuobe/Desktop/Hotel%20services/docs/MANAGER_BOT_GUIDE.md)
- [Deployment Checklist](/c:/Users/nuobe/Desktop/Hotel%20services/docs/DEPLOYMENT_CHECKLIST.md)
- [Environment Reference](/c:/Users/nuobe/Desktop/Hotel%20services/docs/ENVIRONMENT_REFERENCE.md)
- [System Audit And Pitfalls](/c:/Users/nuobe/Desktop/Hotel%20services/docs/SYSTEM_AUDIT_AND_PITFALLS.md)

## Core Architecture

1. User configures resources on the website.
2. Frontend requests pricing and availability from the backend.
3. Frontend creates a Telegram prefill token.
4. Customer continues in Telegram.
5. Customer bot collects booking details and payment proof.
6. Supabase stores bookings, payments, resources, and operational records.
7. Manager bot and manager group receive booking updates and action controls.
8. Manager completes approvals, edits, offline bookings, balance, and daily operations in Telegram.

The backend is the operational source of truth. The website is a guided entry point, not the final booking authority.

## Environment

Backend `.env` typically includes:

```env
CUSTOMER_BOT_TOKEN=
MANAGER_BOT_TOKEN=
CHAT_ID=
MANAGER_GROUP_CHAT_ID=
OWNER_GROUP_CHAT_ID=
PORT=3001
WEBHOOK_SECRET=
FRONTEND_URL=
BACKEND_PUBLIC_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Frontend `.env` typically includes:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TELEGRAM_USERNAME=
VITE_BACKEND_URL=
```

See the full variable list in [Environment Reference](/c:/Users/nuobe/Desktop/Hotel%20services/docs/ENVIRONMENT_REFERENCE.md).

## Key Scripts

Repo root:

```bash
npm install
npm run dev
```

Backend:

```bash
npm run start --workspace backend
npm run telegram:register --workspace backend
npm run report:daily --workspace backend
```

## Security And Operations Notes

- Telegram webhooks now validate `X-Telegram-Bot-Api-Secret-Token` when `WEBHOOK_SECRET` is configured.
- Manual `/api/bookings/:id/approve` and `/api/bookings/:id/reject` routes now require the internal secret.
- Manager operational actions are logged to `manager_action_logs` when the migration is applied, with fallback storage in `telegram_prefills`.
- Finance tables also have fallback behavior if the dedicated balance migration has not been applied yet.

## Important Migrations

Main operational migrations include:

- `20260405_resource_first_trip_builder.sql`
- `20260405_finalize_resource_flow_and_telegram_idempotency.sql`
- `20260406_allow_manager_confirm_pending_bookings.sql`
- `20260406_add_manager_balance_tables.sql`
- `20260406_add_manager_action_logs.sql`

## Deployment Targets

- GitHub: source control and deployment source
- Render: backend webhook/API runtime
- Vercel: frontend hosting
- Supabase: database and storage
- Telegram: customer and manager bot runtime surface

## Current Reality Check

The system is ready for real operations use, but there are still business realities to plan around:

- Render free instances cold-start after inactivity
- there is no automated test suite yet
- some finance/audit features can run in fallback mode until migrations are applied
- Telegram operations still depend on the backend waking up at least once after sleep

Those are documented in [System Audit And Pitfalls](/c:/Users/nuobe/Desktop/Hotel%20services/docs/SYSTEM_AUDIT_AND_PITFALLS.md).
