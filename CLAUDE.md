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
- `npx playwright test e2e/chat.spec.ts` — one spec; add `-g "<title>"` for one test, `--project=firefox` for another engine

Seed / maintenance scripts (run against local DynamoDB by default):
- `npx tsx scripts/seed-admin.ts` — create the admin user (`admin@nextservice.gr` / `admin123` defaults)
- `npx tsx scripts/seed-hot-deals.ts` — seed landing-page hot deals
- `npx tsx scripts/fix-seo-slugs.ts` — backfill SEO slugs
- `npx tsx scripts/fix-hot-deal-categories.ts [--apply]` — move hot deals still on the legacy `service`/`fanopeia` categories to the request-form category `src/data/offers.json` gives their slug (dry run without `--apply`; prefix `DYNAMODB_ENDPOINT=http://localhost:8000` for local, otherwise AWS via the project `.aws/`). A hot deal's `category` must be one of `REQUEST_CATEGORIES` (`src/utils/categoryLabels.ts`) — "Πάρε Προσφορά" hands it to the form unchanged.
- `npx tsx scripts/build-price-examples.ts [--report] [--dump]` — rebuild `src/data/price-examples.json` from the two offers spreadsheets at repo root (`NextService - Προσφορές Last.csv`, structured columns; `NextService - Φύλλο37.csv`, one free-text cell per car). Both are read, parsed and deduped on phone + category; no DynamoDB involved. The CSVs are not in git, and the script throws if a default one is missing — pass the paths you have as positional args instead.
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
- Serial (`workers: 1`) against `http://localhost:3000`. Chromium runs every spec; Firefox and WebKit run only `*cross-browser.spec.ts`.
- The suite registers a fresh client per run but signs in as a fixed, pre-existing garage (`TEST_GARAGE` in `e2e/helpers.ts`), which must exist in your local DynamoDB.
- For states the API rightly refuses to create (e.g. an appointment in the past), `e2e/dynamo-helpers.ts` writes to DynamoDB Local directly. Extend that; never add a test backdoor to production routes.

## Architecture

### Backend (API Routes)

~95 Route Handlers in `src/app/api/`, talking to DynamoDB / S3 / SES / Stripe directly:
- `auth/` — client & garage login, registration, forgot/reset password, `me`
- `service-request/`, `requests/` — request creation, detail, cancel, accept-offer, `complete`, `review`
- `notifications/summary`, `notifications/seen` — unread counts + the server-computed alert list (see Job completion & alerts)
- `realtime/token` — short-lived AppSync token for the browser
- `offers/` — garage offers, client availability
- `chat/` — messages, per-request garage threads, mark-read
- `upload-photos/` — S3 photo uploads (the old free-prefix `upload/` route was deleted)
- `garage/`, `clients/`, `vehicles/` — entity CRUD
- `payments/`, `wallet/`, `webhooks/stripe` — Stripe deposits, saved cards, wallet balance/transactions
- `price-estimation/`, `hot-deals/`, `track/` — public endpoints. Price estimation is a strict lookup over past quotes (`src/lib/price-lookup.ts` + `src/data/price-examples.json`), not a formula: it answers only when the same car is already in the dataset — same category, brand and model, model year ±1, same fuel, engine cc ±150 and same turbo/4x4 (that engine gate is skipped for bodywork, where the form never collects those) — and returns the lowest of those past prices, shown as "Εκτιμώμενο κόστος από X€". No match ⇒ `estimation: null` and the UI shows nothing. Leave-one-out coverage is ~20%, so most requests legitimately get no estimate.
- `account/export`, `account/delete` — GDPR. **Nothing is ever hard-deleted.** "Διαγραφή λογαριασμού" closes and *anonymizes* the account (product rule): the row keeps an allowlist of fields (a garage keeps επωνυμία/ΑΦΜ/ΔΟΥ/διεύθυνση for invoicing; a client keeps nothing personal), vehicles keep make/model only, request descriptions and photos, the client's chat text/photos/name and the άδεια are removed (S3 objects deleted), pending requests are cancelled and pending offers withdrawn, and the job history, amounts, commissions and ratings stay. Refused with 409 `UPCOMING_APPOINTMENT` while a booking has not started. `anonymizedAt` marks the row; `/api/auth/me`, request filing and garage activation treat it as gone.
- `admin/**` — the whole admin surface (users, requests, payments, commissions, emails, errors, funnel, performance, hot-deals, custom vehicles, **content**, **reviews**, settings, tests)

Most routes are wrapped in `withMetrics(...)` (`src/utils/withMetrics.ts`) which fire-and-forget records latency/status into the `PerformanceMetrics` table.

### Auth

`src/middleware.ts` guards `/api/*` and `/admin/*`:
- Client/garage: `auth-token` httpOnly JWT cookie (`jose`, HS256, `JWT_SECRET`), sliding expiry (`SESSION_EXPIRY`, default 2d).
- Admin: completely separate JWT cookie + `ADMIN_JWT_SECRET` (`src/utils/adminAuth.ts`).
- Public API prefixes: `/api/auth/`, `/api/webhooks/`, `/api/price-estimation`, `/api/service-request`, `/api/hot-deals`, `/api/track`. Also unauthenticated: `GET /api/garage/garage-<id>` (public profile) and `/api/photos/*`.
- Identity reaches route handlers only as the `x-user-id` / `x-user-type` headers (`x-admin-*` for admin), which `requireAuth`/`getAuth` trust completely. The middleware strips any incoming copies before setting the verified ones, including on public routes. Keep it that way: no route may read identity from anywhere else.
- Pages are guarded server-side from the cookie (`PROTECTED_PAGES`: `/garage-dashboard` → garage; `/requests`, `/profile` → client), never from the localStorage auth state. Adding a protected page means updating that list **and** the `matcher` at the bottom of the file.
- **Pending garages hold a valid garage JWT** (login issues one so they can see their pending screen). Any route that exposes client data or acts on the marketplace must use `requireActiveGarage()` (`src/utils/requireAuth.ts`, checks `isActive === true` with a 30s cache; 403 `code: 'GARAGE_INACTIVE'`), not `requireGarage()`. Only the admin activate/deactivate routes write `isActive`, and they call `invalidateGarageActive()`.
- **A guest (Clients row with no email/password) is never signed into an existing account by email alone.** `register-from-requests` completes a guest's own registration; if the email is taken, the guest either proves the password (`…/merge-with-password`) or confirms a single-use, hashed, 1-hour link (`…/send-confirmation` → `/confirm-account/` → `POST /api/auth/confirm-account`). The merge leaves the guest row as a `mergedInto` tombstone; the waiting tab polls `…/status`. Never mint a session from a body-supplied id or email.
- Never take identity, ownership, status or amounts from a request body — read them from the JWT headers and the stored rows.
- **Client PII is winner-only (product rule).** While a request is pending, garages get the quoting view only: category, description, photos, the car (make/model/year/fuel/engine/turbo/4x4), the client's first name, the estimate. Surname, phone, email, plate, VIN, engine number and the άδεια photo go only to the garage that won (`appointment`/`in-progress`/`completed`; `cancelled` is not won), from acceptance on. This covers REST, chat `senderName`, emails to garages, real-time payloads and GDPR exports. Use `src/utils/garageClientView.ts` (`resolveWinningGarageId`, `garageClientView`, `quotingFirstName`) and `redactClientNames` in `chatService.ts` — never spread a raw Clients/Vehicles row into a garage response, and keep names out of `EventLogs` metadata. `/api/clients/*` is owner-only.
- The sliding session re-issues the cookie only once the token is at least min(1h, `SESSION_EXPIRY`/2) old — not on every request.
- Every emailed link is built from `SITE_URL` (`src/lib/site-url.ts`); never `NEXT_PUBLIC_APP_URL` (CDK doesn't provision it). The Lambdas' `APP_URL` follows `site_url` in `infra/app.py`.

### Frontend (App Router Pages)

Pattern: `src/app/<page-name>/page.tsx` + a `components/` subfolder for page-specific components.

Key routes:
- `/` — public homepage; the component tree lives in `src/app/landing-page/LandingPage.tsx` (there is **no** `/landing-page` route)
- `/login`, `/forgot-password`, `/reset-password`
- `/car-details` → `/car-specifications` — multi-step vehicle + service request form (localStorage-persisted). The draft records its `owner`; identity fields (saved-car link, VIN, engine number, άδεια, `submissionId`) are dropped when another session opens it. Start a new request with `startNewRequest()` or link to `/car-details/?new=1`. Bodywork also goes through `/car-specifications` (`BodyWorkPhotosForm`).
- `/requests/[clientId]` — client requests, `details/[requestId]`, `chats/[requestId]`
- `/garage-dashboard/[garageId]` — garage portal + `offers/[requestId]`, `chats/`, `chats/appointments`, `chat/[requestId]`
- `/register-professional`, `/profile/[clientId]`, `/offer`, `/privacy`, `/terms`
- `/admin/**` — dashboard, users, garages, requests, payments, commissions, emails, errors, funnel, performance, hot-deals, custom-vehicles, **content** (edit the public pages' copy), **reviews** (moderation), settings, tests

SEO: `sitemap.ts`, `robots.ts`, `opengraph-image.tsx` (the OG routes read fonts/logo/artwork from `public/` on disk; Amplify's SSR bundle has no `public/`, so those files are listed in `outputFileTracingIncludes` in `next.config.ts` — add any new file an OG route reads there), canonical URLs from `src/lib/site-url.ts` (`SITE_URL`). `trailingSlash: true` is enabled — URLs without a trailing slash 308-redirect.

### Shared Code

- `src/components/` — reusable UI (Button, Modal, Input, Spinner, Switch, Checkbox, Toast, SegmentedControl, LoadMoreButton, …) plus `layout/` (AppShell, Sidebar, TopHeader, BottomNav, Footer) and `ui/` (Icon, badge). Always reuse instead of creating one-off equivalents.
- `src/contexts/AuthContext.tsx` — auth state (client vs garage), persisted to localStorage
- `src/contexts/UserContext.tsx` — user-level state
- `src/contexts/NotificationsContext.tsx` — the one poller (30s) for unread counts + alerts, plus the garage's live new-request bell
- `src/utils/dynamoService.ts` — DynamoDB client factory (local endpoint vs explicit creds vs `.aws/` profile vs IAM role)
- `src/utils/ensure*Table.ts` — runtime table auto-creation for the newer tables (Admin, HotDeals, Payments/Wallet, Events, EmailLogs, Performance, ErrorResolutions, SiteContent, Reviews)
- `src/utils/eventLogger.ts` — fire-and-forget funnel events → `EventLogs` (365-day TTL)
- `src/utils/performanceService.ts`, `withMetrics.ts` — API latency metrics
- `src/utils/errorFingerprint.ts`, `errorGroups.ts` — admin error grouping
- `src/utils/emailService.ts`, `notificationService.ts`, `src/lib/email-templates/` — SES emails
- `src/utils/s3Service.ts`, `formStorage.ts`, `rateLimit.ts`, `requireAuth.ts`, `ttlCache.ts`, `requestBroadcast.ts`
- `src/lib/` — `appsync-service.ts` (browser socket), `appsync-publish.ts` (server-side HTTP publish — API routes never publish over the socket), `site-content.ts` + `content-validation.ts` (the page CMS), `commission-basis.ts`, `stripe-client.ts`, `stripe-server.ts`, `offers.ts`, `site-url.ts`
- `src/hooks/` — `useRealtimeRequests`, `useNewRequestNotifier`, `useToast`
- Real-time chat goes through `appSyncService` directly from the chat page components — there is no shared chat hook. (The old `websocket-service.ts` / `useRealtimeChat.ts` pair was deleted; it subscribed to a `chat-{id}-{garageId}` channel the API no longer publishes.)
- **Real-time is an enhancement, never the delivery mechanism.** Both chat pages render a sent message from the POST response and de-dupe the echo on `id`. Never refetch-and-replace after a write: the message list is read from a GSI, which DynamoDB does not serve consistently, so a read moments after the write can legitimately miss the row. Gap-filling refetches (`onReconnect`) must merge.
- Server-side AppSync publishing goes over HTTP (`src/lib/appsync-publish.ts`), not the browser socket singleton — that singleton carries reconnect backoff and an 8s handshake built for a long-lived tab, not for a request handler that may be frozen the moment it responds.
- `src/types/` — `index.ts`, `statuses.ts` (`ServiceRequestStatus`, `OfferStatus`), `requests.ts`, `payments.ts`, `events.ts`, `hotDeals.ts`, `reviews.ts`, `alerts.ts`, `commissions.ts`, `siteContent.ts`

### Two User Types (+ admin)

- **Client** — submits service requests, views offers, pays deposit, chats with garages
- **Garage** — views incoming requests, sends offers, chats with clients, manages appointments
- **Admin** — separate auth + `/admin` back office

`userType` from `useAuth()` decides the shell: `AppShell` shows the `Sidebar` to garages always, and to clients everywhere except the landing page. `src/utils/activeNav.ts` picks the single active tab (deepest matching prefix wins).

### Request lifecycle, job completion & alerts

`ServiceRequestStatus`: `pending` → (offer accepted) `appointment` → `completed`, or `cancelled`. `in-progress` exists in the enum and the UI renders it, but no backend code ever writes it.
- **Every transition is a conditional write** on the state it expects (`ConditionExpression`, or a `TransactWrite` across ServiceRequests + Offers), and a failed condition is a 409 with a Greek message. Concurrent accepts/cancels/edits are expected — the E2E suite fires them in parallel.
- **Offers:** one per garage per request — the id is deterministic (`offer_<hash(requestId, garageId)>`) and written with `attribute_not_exists`; legacy random-id offers are found via `ServiceRequestOffersIndex`. Only on a pending request, status is always set server-side, editable only while `pending`, no past dates. All offer creation (garage POST and admin assign) goes through `src/app/api/offers/offerWrites.ts`.
- **Accept:** the price is the stored `offer.offerAmount`, never the body's `appointmentPrice`; the client sends the amount it saw (`expectedAmount`) and a mismatch is 409 `OFFER_AMOUNT_CHANGED`. Needs a pending request with no `acceptedOfferId`, a pending offer, and an active garage (ConditionCheck in the same transaction). Cancel writes the request and its offer in one transaction; admin cancel also rejects the pending offers.
- **Deactivated garages** can't be booked or chatted with, but can still complete and review jobs already booked with them (`complete`/`review` use `requireGarage` + the assignment check). Their dashboard shows the deactivated status panel plus `BookedJobsPanel`, fed by `GET /api/garage/booked-jobs` (`requireGarage`): `account` = `active`/`pending`/`deactivated` (admin deactivation sets `deactivatedAt`, activation removes it) and the still-open bookings with first name, car, date/time and price only. The completion sweeper prompts deactivated garages too.
- **Cancel (client):** only while `appointment` and before the appointment starts in Athens time (`src/lib/appointment-window.ts`).
- **Appointment date/time math is Europe/Athens** whatever zone the runtime is in: use `src/utils/athensTime.ts` (`athensDateTime`, `athensToday`, `athensDaysUntil`, `isPastAthensDate`) or `appointmentEndsAt`/`isCompletionDue`. Never `new Date(\`${date}T${time}\`)` — Amplify's SSR runtime is UTC. The sweeper Lambda carries a copy of the same logic.
- Nothing moves a request out of `appointment` by itself. Once the slot has passed (`isCompletionDue()` in `src/types/reviews.ts`), the garage confirms the job via `POST /api/requests/[id]/complete`, declaring what it **actually charged**. That figure is split into net + VAT and stored as `finalAmounts`.
- Commission is charged on the declared net (`commissionBasis()` in `src/lib/commission-basis.ts`), only for outcome `completed` (`isCommissionable()` excludes `no_show`/`not_done`; legacy rows with no outcome count). The rate is the garage's agreed `Garages.commissionPercent` (set on `/admin/commissions/[garageId]`) or `DEFAULT_COMMISSION_PERCENT` (15%, deliberately not `DEPOSIT_PERCENT`), **frozen on the job** (`ServiceRequests.commissionPercent`) by the complete route, so a later rate change never re-prices a billed month; `resolveCommissionPercent()` falls back to the garage's current rate for jobs closed before rates were frozen. A job belongs to the month of its `appointmentDate`. The overview and per-garage pages both build from `billedJobsForMonth()` (`src/app/api/admin/commissions/billedJobs.ts`). The quote (`appointmentPrice`, VAT-inclusive) is only the fallback, and is taken net of VAT. The declared VAT rate must be one the completion form offers (`DECLARABLE_VAT_RATES`).
- Chat write rule (`threadWriteState` in `src/utils/chatService.ts`, mirrored by both chat UIs via the messages GET's `canWrite`): every thread is open while the request is pending; afterwards only the winning garage's thread is writable, and a cancelled request is read-only for everyone. Unread badges count exactly the threads the chat lists show.
- Both sides then review each other (`/api/requests/[id]/review`, `reviewService.ts`).
- `infra/lambdas/appointment-completion-sweeper` runs hourly. It emails garages that haven't confirmed and stamps `completionPromptedAt` so the email goes out once. The in-app alert is the main prompt; the email is only a backup nudge.
- Alerts are one flat `Alert` shape (`src/types/alerts.ts`) that the server computes and words in `/api/notifications/summary` and the client renders generically. A new kind of notification is a new `kind` on the server, not a new banner component or another poller.

### Real-time

Dual approach: REST routes persist to DynamoDB, AppSync Events pushes real-time. Used for chat *and* for fanning new requests out to garage dashboards (`requestBroadcast.ts`, `useRealtimeRequests`). `local-appsync-server.js` simulates AppSync in dev.

Chat channels are `request/{requestId}/garage/{garageId}` — always built with `chatChannel()` (`src/lib/realtime-channels.ts`). AppSync Events allows at most 4 segments after the namespace and 50 characters (letters, digits, dashes) per segment and refuses anything else with "Invalid Channel Format" before the authorizer runs; the old single-segment name was ~100 characters and never once subscribed in AWS. The mock enforces the same limits. In AWS, `infra/lambdas/appsync-authorizer` checks every subscribe/publish against the token from `/api/realtime/token`. A garage gets only channels with its own id; a client gets only channels for requests it owns. A new channel name has to fit that convention, or the authorizer rejects it.
- **Token-only.** `ALLOW_API_KEY = False` in `infra/stacks/appsync_stack.py`; the browser never sends the API key and doesn't connect without a token. The authorizer decides per operation: CONNECT with any valid token, SUBSCRIBE by the channel rules (garages must be active), **PUBLISH only for the server's `system` token** — browsers never publish. `/api/realtime/token` refuses inactive garages; `AuthContext` calls `appSyncService.resetIdentity()` when the signed-in user changes.
- The CDK realtime endpoint is a bare host; `appsync-service.ts` adds `wss://` when no scheme is present (without it the socket never connected in AWS). Authorizer results are **not cached** (`authorizer_result_ttl_in_seconds=0`, `ttlOverride: 0`) because AppSync keys the cache on the token alone — a cached CONNECT "allow" would skip every per-channel check.
- In AWS the key lives in Secrets Manager (`nextservice/realtime-jwt-secret`, created by the AppSync stack) and reaches both the authorizer and the Amplify app as a `{{resolve:secretsmanager:…}}` reference — nothing to export before `cdk synth`, and nothing in `cdk.out`. Never hand-add an env var to the Amplify app: CloudFormation rewrites the whole list on the next Amplify deploy and drops it.
- The CDK endpoints are the Events API's `Dns.Http` / `Dns.Realtime` attributes; the host prefix is not the API id.
- `local-appsync-server.js` enforces the same tokens and channel rules locally, so `REALTIME_JWT_SECRET` must be set in `.env.local` or real-time refuses everything in dev.

### Notifications (out-of-band)

`ServiceRequests` has a DynamoDB Stream → `infra/lambdas/new-request-broadcast` → SES fan-out to active garages. The Next.js route only writes to DynamoDB. `ses-event-processor` records deliveries/bounces into `EmailLogs` (surfaced in `/admin/emails`).

Lambdas in `infra/lambdas/` are self-contained `index.mjs` files (only the AWS SDK bundled with the runtime) and can't import from the app. The email HTML in `new-request-broadcast` and `appointment-completion-sweeper` is therefore a copy of `src/lib/email-templates/baseLayout.ts`. Change one, change the others.

## Data (DynamoDB)

Single-region (`eu-central-1`), table names are literal (no stage prefix). CDK-managed tables: **Clients, Garages, Vehicles, ServiceRequests, Offers, ChatMessages, AdminUsers, ErrorResolutions**. Created at runtime by `ensure*Table.ts` helpers: **EventLogs, EmailLogs, HotDeals, Payments, WalletTransactions, PerformanceMetrics, SiteContent, Reviews**.

`Reviews` GSIs: `GarageReviewsIndex`, `ClientReviewsIndex`, `RequestReviewsIndex`. Its partition key is `<requestId>#<direction>`, which is what makes a second review per job per side structurally impossible rather than merely checked. Rating aggregates live on the `Garages`/`Clients` rows as `ratingCount` + `ratingSum` only — the average is derived on read (`ratingAverage()` in `src/types/reviews.ts`).

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

IAM: the Amplify SSR role's DynamoDB permissions in `infra/stacks/amplify_stack.py` list every table and operation explicitly. A new table, or a new operation type (e.g. a `TransactWrite` `ConditionCheck` needs `dynamodb:ConditionCheckItem`), must be added there — DynamoDB Local doesn't enforce IAM, so a missing grant passes every local test and fails as AccessDenied in AWS.

## Environment

`.env.local` (never commit; contains real Stripe/JWT secrets). Keys in use:
- `DYNAMODB_ENDPOINT` (`http://localhost:8000` locally), `REGION`, `S3_BUCKET_NAME`
- `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` — optional explicit AWS creds (IAM role in prod; `.aws/` profile as dev fallback)
- `NEXT_PUBLIC_APPSYNC_*` — endpoint, WS endpoint, API key, region
- `JWT_SECRET`, `SESSION_EXPIRY`, `ADMIN_JWT_SECRET`, `ADMIN_SESSION_EXPIRY`, `ADMIN_EMAIL`
- `REALTIME_JWT_SECRET` — signs the short-lived tokens the browser presents to AppSync (`/api/realtime/token`). **Required locally too**: without it that route 500s, `getRealtimeToken()` returns null, and real-time falls back to an API key the production authorizer rejects. Any random string works for local dev; in AWS it comes from Secrets Manager (see Real-time).
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
- The copy on `/about`, `/faq`, `/locations`, `/location/[slug]`, `/terms`, `/privacy`, `/contact` and the landing-page FAQ is **admin-editable** via `/admin/content`. `src/data/content/pages.ts` and `src/data/locations.ts` hold the copy the build ships with; a DynamoDB row only ever overrides it, so those files stay the fallback and must never be emptied. Editing copy there is still fine — it is what a fresh environment renders.
- Admin-authored text is rendered through `src/components/content/RichText.tsx`, which parses a tiny markup subset (`**bold**`, `*italic*`, `[text](href)`) into React elements. **Never** introduce `dangerouslySetInnerHTML` for it, and never widen the href allowlist beyond relative / `https:` / `mailto:` / `tel:`.
