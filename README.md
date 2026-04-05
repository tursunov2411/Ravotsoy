# Ravotsoy Dam Olish Maskani

Ushbu loyiha turizm biznesi uchun React + Vite + TypeScript + TailwindCSS frontend, Supabase backend va Telegram integratsiyasi uchun Node.js script bilan tayyorlangan.

## Tuzilma

- `frontend` - foydalanuvchi interfeysi va admin panel
- `backend` - Supabase migratsiyalari va Telegram script

## Ishga tushirish

1. `frontend/.env.example` va `backend/.env.example` fayllarini nusxa olib, mos `.env` fayllarni yarating.
2. Root katalogda `npm install` ishga tushiring.
3. Frontend uchun `npm run dev` ishga tushiring.
4. Supabase SQL migratsiyasini `backend/supabase/migrations` ichidan qo'llang.
5. Supabase Auth orqali foydalanuvchi yarating va `profiles` jadvalida unga `admin` rolini bering.

## Muhit O'zgaruvchilari

### 1. Frontend

Fayl yarating:

- `frontend/.env`

Namuna:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_TELEGRAM_USERNAME=your_bot_username
VITE_BACKEND_URL=http://localhost:3001
VITE_GOOGLE_MAPS_EMBED_URL=https://www.google.com/maps?q=Ravotsoy,+Sharof+Rashidov+tuman,+Jizzax,+Uzbekistan&output=embed
```

Izoh:

- `VITE_SUPABASE_URL` - Supabase loyiha URL manzili
- `VITE_SUPABASE_ANON_KEY` - Supabase `anon` yoki `publishable` public kaliti
- `VITE_TELEGRAM_USERNAME` - Telegram bot username, `@` belgisiz yoziladi
- `VITE_BACKEND_URL` - Telegram endpoint ishlaydigan backend URL manzili
- `VITE_GOOGLE_MAPS_EMBED_URL` - Google Maps embed URL, aniq pin bo'lsa shu yerga qo'yiladi

### 2. Backend

Fayl yarating:

- `backend/.env`

Namuna:

```env
BOT_TOKEN=your-telegram-bot-token
CHAT_ID=your-telegram-chat-id
PORT=3001
WEBHOOK_SECRET=change-me-to-a-long-random-string
FRONTEND_URL=http://localhost:5173
```

Izoh:

- `BOT_TOKEN` - BotFather orqali olingan Telegram bot token
- `CHAT_ID` - xabar boradigan chat yoki guruh ID
- `PORT` - Node webhook server porti
- `WEBHOOK_SECRET` - Supabase webhook va Node server orasidagi maxfiy kalit
- `FRONTEND_URL` - CORS uchun ruxsat beriladigan frontend domeni

## Supabase Qo'lda Sozlash

### Supabase -> Telegram oqimi

Tizim quyidagicha ishlaydi:

1. Foydalanuvchi bron formasini yuboradi
2. Bron `Supabase` ichidagi `bookings` jadvaliga saqlanadi
3. `Supabase` trigger orqali webhook chaqiradi
4. Sizning `Node.js` backend webhook so'rovini qabul qiladi
5. `Node.js` backend Telegram API orqali xabar yuboradi

Muhim:

- `Supabase` o'zi Telegram bot token bilan ishlamaydi
- `Supabase` faqat webhook yuboradi
- `BOT_TOKEN` va `CHAT_ID` faqat `Node.js backend` ichida saqlanadi
- `WEBHOOK_SECRET` esa `Supabase` va `Node.js backend` orasidagi himoya kaliti

### 1. SQL Editor orqali qo'llanadigan fayllar

Tartib bilan quyidagilarni ishlating:

1. `backend/supabase/migrations/20260405_init_ravotsoy.sql`
2. `backend/supabase/migrations/20260405_align_requested_schema.sql`
3. `backend/supabase/migrations/3_create_booking_telegram_webhook.sql`
4. `backend/supabase/migrations/4_create_package_images_bucket.sql`
5. `backend/supabase/migrations/20260405_reconcile_live_schema.sql`

Oxirgi fayl mavjud projectlarda eski policy va legacy jadval driftlarini tozalaydi.

### 2. Uchinchi SQL faylda almashtiriladigan qiymatlar

`backend/supabase/migrations/3_create_booking_telegram_webhook.sql` ichida quyidagilarni almashtiring:

- `https://YOUR_PUBLIC_NODE_ENDPOINT/telegram-booking`
- `change-me`

Bu yerda:

- birinchi qiymat - internetdan ochiq Node backend URL bo'lishi kerak
- ikkinchi qiymat - `backend/.env` ichidagi `WEBHOOK_SECRET` bilan bir xil bo'lishi kerak

Muhim:

- `BOT_TOKEN` va `CHAT_ID` Supabase ichiga yozilmaydi
- ular Node backend ichidagi `backend/.env` faylda saqlanadi
- Supabase faqat webhook URL va `WEBHOOK_SECRET` ni biladi

## Admin Foydalanuvchi

1. Supabase Dashboard ichida `Authentication -> Users` bo'limidan foydalanuvchi yarating.
2. SQL Editor ichida shu foydalanuvchining `profiles.role` qiymatini `admin` qilib yangilang.

Misol:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_USER_UUID';
```

## Lokal Tekshiruv

1. Root ichida `npm install`
2. Frontend uchun `npm run dev`
3. Telegram webhook server uchun:

```bash
npm run telegram:webhook --workspace backend
```

4. Frontendda bron formasi orqali Telegram tugmasini tekshiring
5. Supabase `bookings` jadvaliga yozuv tushishini tekshiring

## Deploymentdan Oldingi Checklist

- `frontend/.env` to'ldirilgan
- `backend/.env` to'ldirilgan
- Supabase SQL fayllar qo'llangan
- `profiles` jadvalida admin foydalanuvchi bor
- `3_create_booking_telegram_webhook.sql` ichidagi webhook URL real public manzilga almashtirilgan
- `WEBHOOK_SECRET` SQL fayl va backend `.env` ichida bir xil
- Telegram bot token va chat ID tekshirilgan

## Render Deployment

Backend Render uchun tayyor:

- `backend/index.js` - production entrypoint
- `backend/package.json` ichida `npm start`
- `GET /` - health check endpoint
- `POST /send-telegram` va `POST /telegram/booking` - ishchi endpointlar

Render'da quyidagilarni kiriting:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Render environment variables:

```env
BOT_TOKEN=your-telegram-bot-token
CHAT_ID=your-telegram-chat-id
PORT=3001
WEBHOOK_SECRET=your-long-random-secret
FRONTEND_URL=https://your-vercel-domain.vercel.app
```

Frontend production environment:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_TELEGRAM_USERNAME=your_bot_username
VITE_BACKEND_URL=https://your-render-service.onrender.com
```

Supabase SQL Editor ichida `backend/supabase/migrations/3_create_booking_telegram_webhook.sql`
faylidagi webhook URL ni `https://your-render-service.onrender.com/telegram-booking`
ko'rinishida almashtiring.

## Asosiy imkoniyatlar

- Paketlar katalogi
- Narxni avtomatik hisoblaydigan bron formasi
- Telegram orqali bron yuborish
- Supabase Auth orqali admin kirishi
- Paket, bron va media boshqaruvi
