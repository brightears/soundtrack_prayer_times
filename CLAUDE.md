# Soundtrack Prayer Times

## Project Overview
Standalone scheduler that automatically pauses and resumes Soundtrack music zones during Islamic prayer times. Built by bmasia for their clients in Muslim-majority regions.

## Architecture
- **Language**: TypeScript (strict mode, ES modules)
- **Backend**: Express 5 + EJS templates + HTMX
- **Database**: PostgreSQL (Render managed)
- **Scheduler**: node-cron (daily refresh) + setTimeout (per-prayer pause/resume)
- **APIs**: Soundtrack GraphQL (pause/play) + Aladhan (prayer times, free, no auth)

## Key Files
- `src/server.ts` - Express app, admin auth, starts scheduler
- `src/db.ts` - PostgreSQL pool + migration runner
- `src/scheduler.ts` - Core scheduling logic (daily refresh, pause/resume with retry)
- `src/aladhan.ts` - Aladhan prayer times API client
- `src/soundtrack.ts` - Soundtrack GraphQL client (adapted from soundtrack-mcp)
- `src/queries.ts` - GraphQL queries + PLAY/PAUSE mutations
- `src/routes/api.ts` - JSON API (CRUD zones, Soundtrack proxy, logs)
- `src/routes/pages.ts` - Server-rendered pages (dashboard, forms, log)
- `src/views/` - EJS templates
- `src/migrations/` - SQL migration files

## Database Tables
- `zone_configs` - Zone prayer time configurations
- `prayer_times_cache` - Cached daily prayer times (from Aladhan)
- `action_log` - Every pause/resume action with success/failure

## Commands
- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode
- `npm run start` - Run server

## Environment Variables
- `SOUNDTRACK_API_TOKEN` - Base64-encoded API token (same as soundtrack-mcp)
- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_PASSWORD` - HTTP Basic Auth password for web UI
- `PORT` - Server port (default 3000)

## How It Works
1. Admin configures zones via web UI (account/zone, city, timezone, calculation method, prayers, duration)
2. Scheduler fetches prayer times from Aladhan API daily at midnight
3. Times are cached in PostgreSQL (fallback to yesterday's cache if API is down)
4. setTimeout fires pause mutation at each prayer time, resume after configured duration
5. All actions logged to action_log table, visible on dashboard

## Common Gotchas
- Views and migrations are in `src/` not `dist/` — paths use `join(__dirname, '..', 'src', ...)`
- Aladhan time strings include timezone suffix like "(WIB)" — must be stripped
- TypeScript strict + while loops = circular type inference — add explicit type annotations
- node-cron needs @types/node-cron for TypeScript
- dotenv v16 (not v17) to avoid stdout issues
