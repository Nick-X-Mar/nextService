# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NextService is a Greek car service marketplace web app connecting vehicle owners (clients) with garages (professionals). Clients submit service requests with vehicle details and photos; garages view, chat, and provide offers. It also has a full internal **admin panel**, **Stripe deposits + wallet**, **SES email notifications**, and **analytics/observability** (funnel events, performance metrics, error grouping).

Stack: Next.js 15 App Router, TypeScript, Tailwind CSS, AWS DynamoDB, S3, AppSync Events (real-time WebSocket), SES, Stripe. Infrastructure is AWS CDK (Python) in `infra/`; hosting is AWS Amplify (WEB_COMPUTE / SSR).

## Commands

- `npm run dev` — Next.js dev server on :3000
- `npm run services` — DynamoDB Local (:8000) + DynamoDB Admin UI (:8001) + AppSync mock (:3002)
- `npm run dev:all` — `services` + dev server in one command
- `npm run dev:full` — DynamoDB + AppSync mock + dev server
- `npm run dynamodb` — DynamoDB Local + Admin UI only
- `npm run mock-appsync` — AppSync WebSocket mock only (`local-appsync-server.js`)
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)
- `npm run test:e2e` / `npm run test:e2e:ui` — Playwright E2E suite (`e2e/`, needs the app + local services running)

Seed / maintenance scripts (run against local DynamoDB by default):
- `npx tsx scripts/seed-admin.ts` — create the admin user (`admin@nextservice.gr` / `admin123` defaults)
- `npx tsx scripts/seed-hot-deals.ts` — seed landing-page hot deals
- `npx tsx scripts/fix-seo-slugs.ts` — backfill SEO slugs
- `npx tsx scripts/build-price-examples.ts [--report] [--dump]` — rebuild `src/data/price-examples.json` from the two offers spreadsheets at repo root (`NextService - Προσφορές Last.csv`, structured columns; `NextService - Φύλλο37.csv`, one free-text cell per car). Both are read, parsed and deduped on phone + category; no DynamoDB involved.
- `npx tsx scripts/validate-price-lookup.ts` — leave-one-out accuracy check of the price lookup

Node 20 (`.nvmrc`). Java is required for DynamoDB Local.

### Local ports

| Service | URL |
|---|---|
| Next.js app | http://localhost:3000 |
| DynamoDB Local | http://localhost:8000 |
| DynamoDB Admin UI | http://localhost:8001 |
| AppSync mock (WS) | ws://localhost:3002/graphql (health: `/health`) |

Testing: Playwright E2E only (`e2e/*.spec.ts`). There is no unit-test framework — do not add unit test files; extend the existing E2E specs instead.

## Architecture

### Backend (API Routes)

~80 Route Handlers in `src/app/api/`, talking to DynamoDB / S3 / SES / Stripe directly:
- `auth/` — client & garage login, registration, forgot/reset password, `me`
- `service-request/`, `requests/` — request creation, detail, cancel, accept-offer
- `offers/` — garage offers, client availability
- `chat/` — messages, per-request garage threads, mark-read
- `upload-photos/`, `upload/` — S3 photo uploads
- `garage/`, `clients/`, `vehicles/` — entity CRUD
- `payments/`, `wallet/`, `webhooks/stripe` — Stripe deposits, saved cards, wallet balance/transactions
- `price-estimation/`, `hot-deals/`, `track/` — public endpoints. Price estimation is a strict lookup over past quotes (`src/lib/price-lookup.ts` + `src/data/price-examples.json`), not a formula: it answers only when the same car is already in the dataset — same category, brand and model, model year ±1, same fuel, engine cc ±150 and same turbo/4x4 (that engine gate is skipped for bodywork, where the form never collects those) — and returns the lowest of those past prices, shown as "Εκτιμώμενο κόστος από X€". No match ⇒ `estimation: null` and the UI shows nothing. Leave-one-out coverage is ~20%, so most requests legitimately get no estimate.
- `account/export`, `account/delete` — GDPR
- `admin/**` — the whole admin surface (users, requests, payments, commissions, emails, errors, funnel, performance, hot-deals, custom vehicles, settings, tests)

Most routes are wrapped in `withMetrics(...)` (`src/utils/withMetrics.ts`) which fire-and-forget records latency/status into the `PerformanceMetrics` table.

### Auth

`src/middleware.ts` guards `/api/*` and `/admin/*`:
- Client/garage: `auth-token` httpOnly JWT cookie (`jose`, HS256, `JWT_SECRET`), sliding expiry (`SESSION_EXPIRY`, default 2d).
- Admin: completely separate JWT cookie + `ADMIN_JWT_SECRET` (`src/utils/adminAuth.ts`).
- Public API prefixes: `/api/auth/`, `/api/webhooks/`, `/api/price-estimation`, `/api/service-request`, `/api/hot-deals`, `/api/track`.

### Frontend (App Router Pages)

Pattern: `src/app/<page-name>/page.tsx` + a `components/` subfolder for page-specific components.

Key routes:
- `/` — public homepage; the component tree lives in `src/app/landing-page/LandingPage.tsx` (there is **no** `/landing-page` route)
- `/login`, `/forgot-password`, `/reset-password`
- `/car-details` → `/car-specifications` — multi-step vehicle + service request form (localStorage-persisted)
- `/requests/[clientId]` — client requests, `details/[requestId]`, `chats/[requestId]`
- `/garage-dashboard/[garageId]` — garage portal + `offers/[requestId]`, `chats/`, `chats/appointments`, `chat/[requestId]`
- `/register-professional`, `/profile/[clientId]`, `/offer`, `/privacy`, `/terms`
- `/admin/**` — dashboard, users, requests, payments, commissions, emails, errors, funnel, performance, hot-deals, custom-vehicles, settings, tests

SEO: `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, canonical URLs from `src/lib/site-url.ts` (`SITE_URL`). `trailingSlash: true` is enabled — URLs without a trailing slash 308-redirect.

### Shared Code

- `src/components/` — reusable UI (Button, Modal, Input, Spinner, Switch, Checkbox, Toast, SegmentedControl, LoadMoreButton, …) plus `layout/` (AppShell, Sidebar, TopHeader, BottomNav, Footer) and `ui/` (Icon, badge). Always reuse instead of creating one-off equivalents.
- `src/contexts/AuthContext.tsx` — auth state (client vs garage), persisted to localStorage
- `src/contexts/UserContext.tsx` — user-level state
- `src/utils/dynamoService.ts` — DynamoDB client factory (local endpoint vs explicit creds vs `.aws/` profile vs IAM role)
- `src/utils/ensure*Table.ts` — runtime table auto-creation for the newer tables (Admin, HotDeals, Payments/Wallet, Events, EmailLogs, Performance, ErrorResolutions)
- `src/utils/eventLogger.ts` — fire-and-forget funnel events → `EventLogs` (365-day TTL)
- `src/utils/performanceService.ts`, `withMetrics.ts` — API latency metrics
- `src/utils/errorFingerprint.ts`, `errorGroups.ts` — admin error grouping
- `src/utils/emailService.ts`, `notificationService.ts`, `src/lib/email-templates/` — SES emails
- `src/utils/s3Service.ts`, `formStorage.ts`, `rateLimit.ts`, `requireAuth.ts`, `ttlCache.ts`, `requestBroadcast.ts`
- `src/lib/` — `amplify-config.ts`, `appsync-service.ts`, `stripe-client.ts`, `stripe-server.ts`, `offers.ts`, `site-url.ts`
- `src/hooks/` — `useRealtimeRequests`, `useNewRequestNotifier`, `useToast`
- Real-time chat goes through `appSyncService` directly from the chat page components — there is no shared chat hook. (The old `websocket-service.ts` / `useRealtimeChat.ts` pair was deleted; it subscribed to a `chat-{id}-{garageId}` channel the API no longer publishes.)
- `src/types/` — `index.ts`, `statuses.ts` (`ServiceRequestStatus`, `OfferStatus`), `requests.ts`, `payments.ts`, `events.ts`, `hotDeals.ts`

### Two User Types (+ admin)

- **Client** — submits service requests, views offers, pays deposit, chats with garages
- **Garage** — views incoming requests, sends offers, chats with clients, manages appointments
- **Admin** — separate auth + `/admin` back office

Auth state determines which navigation (`ClientNavigation` vs `GarageNavigation`) and dashboard is shown.

### Real-time

Dual approach: REST routes persist to DynamoDB, AppSync Events pushes real-time. Used for chat *and* for fanning new requests out to garage dashboards (`requestBroadcast.ts`, `useRealtimeRequests`). `local-appsync-server.js` simulates AppSync in dev.

### Notifications (out-of-band)

`ServiceRequests` has a DynamoDB Stream → `infra/lambdas/new-request-broadcast` → SES fan-out to active garages. The Next.js route only writes to DynamoDB. `ses-event-processor` records deliveries/bounces into `EmailLogs` (surfaced in `/admin/emails`).

## Data (DynamoDB)

Single-region (`eu-central-1`), table names are literal (no stage prefix). CDK-managed tables: **Clients, Garages, Vehicles, ServiceRequests, Offers, ChatMessages, AdminUsers, ErrorResolutions**. Created at runtime by `ensure*Table.ts` helpers: **EventLogs, EmailLogs, HotDeals, Payments, WalletTransactions, PerformanceMetrics**.

Notable GSIs: `Clients.EmailIndex/PhoneIndex`, `Garages.TINIndex/MobileIndex`, `Vehicles.ClientVehiclesIndex/VINIndex`, `ServiceRequests.ClientRequestsIndex/VehicleRequestsIndex/StatusIndex`, `Offers.ServiceRequestOffersIndex/GarageOffersIndex/StatusIndex`, `ChatMessages.RequestMessagesIndex/SenderMessagesIndex`.

Schema docs: `docs/databases/dynamodb.md`, `docs/databases/ER-Diagram.md`. Flow docs: `docs/flows/`. Full behaviour spec: `FUNCTIONAL_SPEC.md`.

Local data lives in `dynamodb-local/shared-local-instance.db` (gitignored, `-sharedDb` mode).

## Infrastructure (`infra/`, AWS CDK Python)

Account `766671488262`, region `eu-central-1`, stage `staging`. Stacks: `NextService-DynamoDB`, `-S3`, `-Monitoring`, `-AppSync`, `-Amplify`, `-Notifications`.

```bash
cd infra && source .venv/bin/activate
cdk synth
cdk deploy --all           # or a single stack name
```

Amplify quirk: app-level env vars are **build-time only**. Anything the SSR runtime needs must also be listed in the `env` block of `next.config.ts`.

## Environment

`.env.local` (never commit; contains real Stripe/JWT secrets). Keys in use:
- `DYNAMODB_ENDPOINT` (`http://localhost:8000` locally), `REGION`, `S3_BUCKET_NAME`
- `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` — optional explicit AWS creds (IAM role in prod; `.aws/` profile as dev fallback)
- `NEXT_PUBLIC_APPSYNC_*` — endpoint, WS endpoint, API key, region
- `JWT_SECRET`, `SESSION_EXPIRY`, `ADMIN_JWT_SECRET`, `ADMIN_SESSION_EXPIRY`, `ADMIN_EMAIL`
- `REALTIME_JWT_SECRET` — signs the short-lived tokens the browser presents to AppSync (`/api/realtime/token`). **Required locally too**: without it that route 500s, `getRealtimeToken()` returns null, and real-time falls back to an API key the production authorizer rejects. Any random string works for local dev; in AWS it must match the value on the `nextservice-appsync-authorizer` Lambda.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_PAYMENTS_ENABLED`, `NEXT_PUBLIC_PAYMENTS_REFUNDS_ENABLED`, `DEPOSIT_PERCENT`, `CANCELLATION_DEADLINE_DAYS`
- `SES_FROM_ADDRESS`, `SES_REGION`, `SES_CONFIG_SET`, `NOTIFICATIONS_ENABLED`
- `SITE_URL`, `NEXT_PUBLIC_APP_URL`
- Table-name overrides: `ADMIN_USERS_TABLE`, `EVENT_LOGS_TABLE`, `EMAIL_LOGS_TABLE`, `HOT_DEALS_TABLE`, `PAYMENTS_TABLE`, `WALLET_TRANSACTIONS_TABLE`, `PERFORMANCE_TABLE`, `ERROR_RESOLUTIONS_TABLE`

Local dev takes the DynamoDB-Local path only when `NODE_ENV=development` **and** `DYNAMODB_ENDPOINT` is set.

Path alias: `@/` maps to `src/`.

## Design System

The app uses a complete Material Design 3 system: Inter (latin + greek subsets), Material Symbols Outlined icons, MD3 color tokens in `tailwind.config.js`, and class-string constants in `src/styles/styles.ts`. Light mode only.

**Before writing or restyling any UI, load the `nextservice-design` skill** (`.claude/skills/nextservice-design/SKILL.md`) — it has the full token set, type ramp, component API and signature elements. Never hardcode hex values or duplicate a shared component.

Loading states: every button that fires a request or a navigation shows a spinner. Use `Spinner` (`src/components/Spinner.tsx`) with `useAsyncTask` for requests and `useNavigation` for route changes — a bare `router.push` gives the user no feedback at all.

## Rules

- **NEVER commit automatically.** Only commit when the user explicitly asks for it.
- Check `lsof -i :3000` before starting the dev server — it is often already running.
- Never read `.env*` or `.aws/` files.
- All AWS infra is CDK-managed in `infra/` — never suggest manual Console/CLI changes.
- Clean up any temporary/test/debug files before completing work.
- Use existing shared components from `src/components/` rather than creating duplicates.
- Follow the page structure convention: `src/app/<page-name>/page.tsx` + `components/` subfolder.
- UI text is in Greek (the app targets the Greek market).
