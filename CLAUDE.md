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
- `src/shared.ts` - Shared helpers (collectPrayers, collectDurations, DEFAULT_DURATIONS)
- `src/routes/api.ts` - JSON API (CRUD zones, Soundtrack proxy, logs, customer management)
- `src/routes/pages.ts` - Server-rendered pages (dashboard, forms, log, customer management)
- `src/routes/portal-pages.ts` - Customer portal pages (scoped dashboard, forms, log)
- `src/routes/portal-api.ts` - Customer portal API (test, delete, refresh, Soundtrack proxy)
- `src/middleware/portal-auth.ts` - Token validation middleware for customer portal
- `src/views/` - Admin EJS templates
- `src/views/portal/` - Customer portal EJS templates
- `src/migrations/` - SQL migration files

## Database Tables
- `zone_configs` - Zone prayer time configurations
- `prayer_times_cache` - Cached daily prayer times (from Aladhan)
- `action_log` - Every pause/resume action with success/failure
- `customers` - Customer portal access (token, account_id, enabled)

## Customer Portal
- Secret link auth: `/p/:token` (256-bit random token, no login needed)
- Admin creates customer at `/customers/new`, copies portal link, sends to customer
- Portal routes mounted BEFORE Basic Auth in server.ts (bypass admin auth)
- All portal queries scoped by `account_id` for data isolation
- Ownership check on every zone action (zone must belong to customer's account)
- Invalid/disabled tokens return 404 (no information leakage)

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
- Express 5 param types: use `req.params.id as string` cast (returns `string | string[]`)
- Form POST handlers: always redirect after save, don't re-render same page (looks like nothing happened)
