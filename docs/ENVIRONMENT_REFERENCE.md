# Environment Reference

## Backend

### Core

- `CUSTOMER_BOT_TOKEN`: Telegram token for the customer bot
- `MANAGER_BOT_TOKEN`: Telegram token for the manager bot
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: public/anon key
- `SUPABASE_SERVICE_ROLE_KEY`: privileged key for backend services
- `PORT`: backend port, defaults to `3001`

### Routing

- `FRONTEND_URL`: allowed CORS frontend origin
- `BACKEND_PUBLIC_URL`: public backend URL used for Telegram webhook registration
- `RENDER_EXTERNAL_URL`: Render-provided public URL, used as fallback in some paths

### Telegram Operations

- `CHAT_ID`: legacy manager chat bootstrap ID
- `MANAGER_GROUP_CHAT_ID`: group that receives manager operational updates
- `OWNER_GROUP_CHAT_ID`: owner group / owner notification fallback target
- `WEBHOOK_SECRET`: shared secret used for Telegram webhook validation and internal protected routes

## Frontend

- `VITE_SUPABASE_URL`: frontend Supabase URL
- `VITE_SUPABASE_ANON_KEY`: frontend Supabase anon key
- `VITE_BACKEND_URL`: public backend URL
- `VITE_TELEGRAM_USERNAME`: customer bot username for deep-linking
- `VITE_GOOGLE_MAPS_EMBED_URL`: optional, currently not central to live flow

## Notes

- `CHAT_ID` still exists for legacy compatibility, but manager access is now role-based and transferable.
- `MANAGER_GROUP_CHAT_ID` is the preferred operational notification target.
- If `WEBHOOK_SECRET` is set, Telegram webhooks must be registered again so Telegram sends the secret header.
