# Operations Runbook

## Daily Opening

1. Send `/start` to the manager bot.
2. Open `🩺 Diagnostika`.
3. If Render slept, press `⚡ Uyg'otish / ulash`.
4. Check `🛠 Tizim holati`.
5. Open `📚 Bronlar` and review:
   - pending bookings
   - proof checks
   - today arrivals
   - tomorrow arrivals
6. Open `💰 Balans` and confirm yesterday was handed over properly.

## During The Day

- Approve or reject proofs from the manager bot or manager group updates
- Use `🧍 Offlayn mehmonlar` for walk-ins or phone bookings
- Use `📋 Operatsion close` in `🗂 Hisobotlar` to monitor today and tomorrow
- Use `🗓 Oy kalendari` for date-specific occupancy checks
- Record expenses immediately from `💰 Balans`

## Daily Closing

1. Open `🗂 Hisobotlar` and review `📋 Operatsion close`.
2. Confirm pending bookings and proof checks are low or expected.
3. Record all expenses.
4. Open `💰 Balans`.
5. Use `📤 Topshirildi` after money is handed to the owner.
6. Send `🌙 Bugungi hisobot` to owner recipients.

## Render Sleep Recovery

If the manager bot responds:

1. Open `🩺 Diagnostika`
2. Press `⚡ Uyg'otish / ulash`
3. Wait for:
   - backend reachable
   - Supabase wake
   - trip builder warmed
   - payment config reachable
   - customer webhook refreshed
   - manager webhook refreshed

If the bot does not respond at all:

1. Open the backend URL in a browser
2. Wait for Render to wake
3. Send `/start` to the manager bot again

## Manager Transfer

1. Current manager opens `🔐 Nazorat`
2. Press `🔁 Nazoratni topshirish`
3. A one-time `/start <token>` command is generated
4. New manager sends that exact command to the bot in private chat
5. Old manager loses manager role

## Finance Rules

- Expenses are rejected if current balance is zero
- `Topshirildi` records the current balance and resets live balance effectively to zero
- `Mening daromadim` shows 25% share based on paid revenue
- If finance migrations are missing, fallback storage is used automatically

## Incident Response

### Booking actions failing

- Check `🛠 Tizim holati`
- Check `🩺 Diagnostika`
- Verify Supabase credentials
- Verify new migrations were applied

### No manager notifications in group

- Confirm bot is still in the group
- Confirm `MANAGER_GROUP_CHAT_ID` is set correctly
- Run `⚡ Uyg'otish / ulash`

### Proofs are not reaching manager

- Check manager bot webhook
- Check payment-proof records in Supabase
- Check audit log and manager group updates

### Balance looks wrong

- Review recent expenses
- Review recent handovers
- Confirm bookings were marked `paid`
- Review the audit log for finance actions
