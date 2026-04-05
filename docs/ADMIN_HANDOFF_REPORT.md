# Ravotsoy Admin Handoff

## Current Scope
This project is a Supabase-backed tourism / resort site with a CMS-style admin panel.
Public site is deployed on Vercel. Backend booking notifications go to Telegram and should remain active.

## Current Live Architecture
- Frontend: React + Vite + Tailwind
- Database: Supabase Postgres
- Media: Supabase Storage
- Public content sources:
  - `site_settings`
  - `content_sections`
  - `packages`
  - `media`
  - `bookings`

## Important Product Rules
- Booking flow to Telegram bot must stay as-is.
- FAQ CTA/button is separate from booking flow and should be admin-editable.
- Admin should be able to manage homepage/content without touching code.

## Recent Fixes Already In Place
- Admin access is role-gated.
- Homepage `highlights` was replaced with FAQ.
- FAQ section is editable from admin.
- Gallery modal was widened and uncluttered.
- Admin panel now uses sidebar-driven panels instead of one long page.
- Footer has an `Admin login` link.

## Known Implementation Details
### Package Editing
Package edit/create API lives in `frontend/src/lib/api.ts`.
Admin package form lives in `frontend/src/pages/AdminPage.tsx`.
If package editing regresses again, inspect:
- update vs insert behavior on `packages`
- Supabase RLS policy `Admin packages full access`
- whether package image uploads are failing separately from package field updates

### FAQ CTA Redirect
Public FAQ CTA rendering is in `frontend/src/pages/HomePage.tsx`.
Admin FAQ editor is in `frontend/src/pages/AdminPage.tsx`.
Current behavior:
- if FAQ `content.cta_url` is present, site uses it
- value may be a Telegram username like `@username` or a full URL
- if no custom value exists, site falls back to the default Telegram link logic

### Live FAQ Redirect
Live FAQ CTA was patched to use `@uchqunovich_12`.
This should open `https://t.me/uchqunovich_12` on the website.

## Files To Inspect First For Future Work
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/utils.ts`
- `frontend/src/components/ui/interactive-bento-gallery.tsx`
- `backend/supabase/migrations/20260405_replace_highlights_with_faq.sql`

## Recent Git References
- `13d8ea7` Split admin into panels and make FAQ CTA editable
- `761778d` Widen gallery modal layout
- `8fbb396` Reorganize admin layout and improve gallery modal

## Verification Checklist
1. Admin login works.
2. Package edit updates name/price/description without error.
3. FAQ CTA opens the intended Telegram contact instead of the bot.
4. Booking submit still reaches Telegram bot/webhook.
5. Vercel production deploy is `Ready`.
