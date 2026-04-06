# Deployment Checklist

## GitHub

- Repo remote points to the intended production repository
- Branch to deploy is `main`
- Sensitive `.env` values are not committed

## Supabase

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are set
- Latest required migrations are applied:
  - `20260406_allow_manager_confirm_pending_bookings.sql`
  - `20260406_add_manager_balance_tables.sql`
  - `20260406_add_manager_action_logs.sql`

## Render Backend

- Root directory is `backend`
- Build command is `npm install`
- Start command is `npm start`
- Required env vars are set
- `MANAGER_GROUP_CHAT_ID` is configured
- `WEBHOOK_SECRET` is configured

## Vercel Frontend

- `VITE_SUPABASE_URL` is configured
- `VITE_SUPABASE_ANON_KEY` is configured
- `VITE_BACKEND_URL` points to the Render backend
- `VITE_TELEGRAM_USERNAME` points to the customer bot

## Telegram

- Customer and manager bot tokens are valid
- Bots are added where needed
- Manager bot is in the manager group
- BotFather privacy settings match the intended group behavior
- Run:

```bash
npm run telegram:register --workspace backend
```

This should register:

- `/webhook/customer`
- `/webhook/manager`
- command menus
- webhook secret token when `WEBHOOK_SECRET` is set

## Daily Report Delivery

- `report_recipients` contains at least one active linked recipient
- Recipient has started the relevant bot and linked successfully
- Optional cron or scheduled trigger is configured if automated reports are desired

## Post-Deploy Checks

1. Open backend `/`
2. Send `/start` to customer bot
3. Send `/start` to manager bot
4. Open `🩺 Diagnostika`
5. Run `⚡ Uyg'otish / ulash`
6. Create a test booking
7. Submit a test proof
8. Approve from manager flow
9. Record a test expense
10. Confirm manager group receives booking updates
