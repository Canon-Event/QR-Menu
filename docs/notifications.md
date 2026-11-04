# Restaurant notifications

Implementation and local validation: 5 November 2026. The migration and application have **not** been applied to production. Live Supabase Realtime, real-device Web Push, and the deployment scheduler require the staging checks below.

## Behavior

The owner dashboard and each authenticated staff restaurant workspace have one shared notification provider. Internal dashboard navigation preserves it. A real bell shows per-person unread counts, All/Unread filters, read controls, cursor-paginated history, and sound/push preferences. Opening the bell does not mark anything read. Opening an authorized resource successfully, or explicitly pressing Mark read, does. Mark all uses the last displayed server cursor, so a concurrent arrival stays unread.

Notifications survive reloads, sign-ins and devices. Read state belongs to each recipient. Another person's read does not acknowledge an order. Notification details query the exact underlying record with current permissions; deleted records show an unavailable/history result. Opening financial notifications never writes payments or refunds.

Orders now have separate Active and Completed & cancelled lists, 50 rows per page, stable `(created_at,id)` cursors and total active counts. Active orders sort oldest first and remain discoverable beyond 100 records. Exact order links bypass page position. The customer tracking page polls its own narrow token-scoped endpoint, including kitchen status, with no staff feed, phone numbers or internal notes.

## Event and permission mapping

These are the repository's actual permissions, not newly granted capabilities.

| Event | Recipients | Source / action |
|---|---|---|
| New order; first pending reminder | Owner, manager, cashier, waiter | Committed pending order; accept/manage order |
| New/changed kitchen ticket | Owner, manager, kitchen | Actual kitchen ticket creation or changed lines |
| Ready to serve | Owner, manager, cashier, waiter | Kitchen reaches ready; order reaches ready when no kitchen ticket exists |
| Order/kitchen cancellation | Owner, manager, cashier, waiter, kitchen | Actual cancellation; review affected order |
| Pending escalation | Owner, manager | Still-pending work needs intervention |
| Low stock | Owner | Active ingredient crosses `quantity <= low_stock_threshold`; replenishment rearms it |
| Leave request | Owner | Successfully saved pending request; exact employee/outlet context |
| Poor feedback | Owner | Saved rating at/below configurable threshold (default 2/5) |
| Failed refund | Owner, manager | Confirmed server/provider `failed` state; pending/unknown is not failure |
| Payment discrepancy | Owner, manager | Confirmed receipts newly exceed adjusted bill total; deduped per capture/episode |
| Cash discrepancy | Owner, manager | Saved counted cash differs from expected cash |

Inventory, employee management and feedback are owner-only in this application. A generic manager or cashier does not gain access to private HR data. Kitchen accounts receive no financial or leave alerts. Signed payment webhook validation and existing order version/transition/audit rules remain in place.

Recipients are captured when the event is written. Current role/access is rechecked during dispatch, every feed/read/detail RPC, push claim and push display authorization. Revoked staff cannot read old private history. Newly added staff receive future events; historical notifications are not backfilled to them. Losing access clears the browser inbox and subscription on auth change or the next failed authorization check.

There is no operational branch assignment on orders/team members and no assigned-waiter field. Existing employee outlets are HR metadata, not operational authorization scopes. Therefore serving alerts go to the authorized restaurant serving team; HR outlet information remains owner-only. Per-waiter delivery and separate branch team permissions require those business models first. Separate restaurants are isolated. The owner dashboard uses its existing first-owned-restaurant selection; staff can choose a restaurant workspace. Changing that selection remounts the provider.

Kitchen eligibility remains the existing billing-enabled plus kitchen-enabled gate. This repository has no additional paid/accepted-before-kitchen gate. Kitchen progress and order progress remain independent, and served/cancelled kitchen tickets stop pending reminders. Notification details expose exact records; the existing POS overview's 100-invoice/200-ticket limits are unchanged. Older unfinished orders are accessible through the paginated Orders screen, and older bill notification links load the exact invoice.

## Persistence and delivery

`supabase/phase-notifications.sql` adds settings, preferences, events/outbox, recipient inboxes, realtime signals, reminders, subscriptions and delivery attempts. Business triggers write events in the same database transaction as the business change. They do no network work. Delivery/dispatch failures retry independently and do not turn a successfully committed order into a failed response. Business request idempotency still prevents duplicate orders/payments; notification deduplication does not replace it.

Each restaurant's dispatcher is serialized with a transaction advisory lock. This makes inbox sequence cursors safe across concurrent workers. An event-recipient unique constraint deduplicates inbox records. Reads dispatch a bounded batch for that restaurant, so normal foreground delivery does not depend on the scheduled worker being on time.

Only opaque per-user signals are published to Supabase Realtime. RLS restricts those signals to the current user and their current restaurant access. Event/inbox tables have no direct authenticated read/write grants; scoped security-definer RPCs expose narrow results. No customer feed reuses the staff inbox.

The provider has one realtime subscription per mounted user/restaurant context and reconciles every 10 seconds while visible. Focus/network restoration triggers catch-up. Requests time out after 12 seconds; failures back off to at most 60 seconds. Catch-up uses string bigint cursors in 50-record batches, and a separate latest-page read reconciles read states. History displays 50 rows and bounds the back-navigation cursor stack to 100 entries. Initial history is silent; only unread, actionable, enabled-category arrivals under 60 seconds old are eligible for sound/toasts.

Sound preference and volume are saved per user/restaurant. Browser activation is separate: Enable sound in this tab resumes audio through a user gesture; Test sound checks playback. New/ready/escalation tones differ. Web Locks plus a shared cursor watermark coordinate tabs. The fallback uses a short localStorage lease and releases it after playback; blocked storage disables automatic sound rather than ringing every tab. Cross-device sound is intentionally independent. Full reloads/new tabs may require activation again.

Customer tracking polls every 5 seconds while active, every 60 seconds for terminal states, pauses while hidden, and revalidates on focus/online. It has request deadlines and bounded retry backoff. Tokens keep the existing bearer-UUID semantics: deletion/rotation revokes the link; this application has no automatic expiry policy. Invalid/revoked links reveal no order data. Tracking permits 30 requests/minute per IP/token with a 6,000/minute aggregate IP ceiling for shared restaurant Wi-Fi. Rate limiting uses the existing process-local limiter; infrastructure-wide enforcement would require deployment-level limits or shared storage.

## Reminders and worker

Default rules: first reminder at 120 seconds pending; manager escalation at 300 seconds; repeats every 300 seconds, at most two additional escalations. Owner settings can change these within database-validated bounds. The worker locks the order and re-reads its reminder state, checks the actual pending/kitchen state and deduplicates each stage. Reading a personal notification never stops operational reminders. After downtime it emits the highest applicable stage and schedules repeats from now, avoiding a burst of missed stages. The migration creates no historical-order alerts or reminders.

Run `/api/notifications/jobs` every minute with `Authorization: Bearer CRON_SECRET`. GET and POST are supported. The Node endpoint uses the server service key; its secret comparison is timing-safe. It processes up to 200 due reminders and 40 restaurant outbox batches per tick, with 50 events per batch. It emits structured `worker_tick` counts for dispatched events, pending/failed queues, reminders and push results. Queue counts are snapshots taken by the database tick before push sending.

Push claims contain 20 deliveries at a time with two-minute leases. A run claims up to ten batches, starting new batches only within its first 15 seconds, with four concurrent sends and a five-second send timeout. This leaves time for a final batch within the route's 60-second budget. Failed completion writes log `lease_completion_failed`; expired leases can be reclaimed. Retries are capped at five, use backoff and reuse the notification ID/topic. Missing endpoints, read/resolved alerts, revoked permissions, opt-outs and events older than 15 minutes are skipped. HTTP 404/410 removes an expired subscription. Monitor backlog and increase scheduler frequency/capacity if sustained workload exceeds these bounds.

Processed history is retained for 90 days, then deleted in batches of 500 per tick with dependent inbox/delivery cleanup. Failed unprocessed events are retained for diagnosis/retry. Subscriptions not renewed on a workspace visit for 90 days are removed. Disabling the scheduler also disables reminders, push and retention cleanup; foreground in-app arrivals still work.

## Web Push and environment

Optional Web Push uses the `web-push` package and `public/notifications-sw.js`. Opt-in follows a user click; unsupported/denied permission is shown. The worker does not intercept/cache page requests and refuses to replace an unrelated existing service worker. There was no existing PWA worker in this repository.

Subscriptions are authenticated per user/device (maximum ten devices). Endpoint host/key validation also runs inside PostgreSQL. Endpoint and user locks protect registration/rebinding. Push payloads contain only opaque notification/subscription IDs; the service worker rechecks the current cookie session, tenant, role, preferences and actionability before displaying generic lock-screen text. A visible tab suppresses native display only if its matching provider acknowledges the message. IndexedDB and notification tags deduplicate display. Logout detaches the device and closes displayed notifications; failed network cleanup still runs local cleanup. A signed-out/other-account worker cannot display the old user's alert. A click follows a safe internal path through login and rechecks authorization.

Use the existing Supabase URL/anon key plus the server-only `SUPABASE_SERVICE_ROLE_KEY`. Add to deployment secrets:

```dotenv
CRON_SECRET=<random secret of at least 32 characters>
NOTIFICATION_WORKER_ORIGIN=https://your-deployment.example
WEB_PUSH_PUBLIC_KEY=<generated public VAPID key>
WEB_PUSH_PRIVATE_KEY=<generated private VAPID key>
WEB_PUSH_SUBJECT=mailto:your-operational-contact@example.com
```

The public VAPID key is returned by the authenticated preferences API; the private key never enters browser code. Keep a stable key pair across releases. Without all three push variables the UI reports that background delivery needs configuration; normal in-app notifications remain available. Push requires a supported secure browser context, a valid signed-in session, browser/OS permission and network access. Closed/suspended pages do not run ordinary polling or sound. Native delivery is best effort, not guaranteed execution of page JavaScript.

Commands from the repository root (Node 20+ and the package.json pnpm version):

```sh
pnpm install --frozen-lockfile
pnpm exec web-push generate-vapid-keys --json
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
pnpm run typecheck
pnpm run lint
pnpm run test:notifications
pnpm exec playwright install chromium
pnpm run test:notifications:browser
pnpm run build
pnpm run start
# In a separate terminal, after configuring .env.local:
node --env-file=.env.local scripts/notification-worker.cjs
```

Key-generation output is sensitive; store it in the environment manager, never in Git/logs. On the current Windows workspace the installed pnpm store is `E:\.pnpm-store`; use `pnpm --store-dir E:\.pnpm-store install --frozen-lockfile` if pnpm reports a different store. Browser scripts accept `CHROMIUM_PATH` for an existing Chromium executable.

No paid queue/service is required. A Linux scheduler with this checkout and a private environment file can run this crontab entry (replace paths, ensure the scheduler resolves Node):

```cron
* * * * * cd /srv/qrush && /usr/bin/node --env-file=/etc/qrush-notifications.env scripts/notification-worker.cjs >> /var/log/qrush-notifications.log 2>&1
```

The scheduler environment file needs only `CRON_SECRET` and `NOTIFICATION_WORKER_ORIGIN`; Supabase and push secrets belong on the application server. On Windows Task Scheduler, create a task recurring every minute, program `node.exe`, arguments `--env-file=C:\secure\qrush-notifications.env scripts\notification-worker.cjs`, and Start in set to the checkout directory. Do not create a browser/in-process interval as the scheduler. An existing deployment scheduler can call the authenticated endpoint directly if it supports this frequency and runtime. No scheduler or hosting plan is configured automatically by this change.

## Release sequence

1. Review the diff and back up the target database. In staging, ensure the existing base, analytics/orders, ingredients, menu modes, order reliability, POS, reporting, staff permissions and table-access migrations are installed in their documented order. See [billing setup](billing-setup.md) and [table verification](table-verification.md). Do not rerun `schema.sql` against an existing installation.
2. If using HR/leave/feedback, install the existing `phase-employee-management.sql` first. Apply **`supabase/phase-notifications.sql` last** through the Supabase SQL editor (or `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/phase-notifications.sql` using secure connection configuration). It is transactional/re-runnable and adds no historical alerts. If HR tables are enabled later, reapply this migration to attach their triggers.
3. Verify `notification_signals` belongs to `supabase_realtime` on the target Supabase project. The migration adds it if the publication exists. Verify a real logged-in staff account receives only its own authorized signals; polling must still work with realtime disabled.
4. Configure application secrets, deploy the reviewed application, then run the worker once and inspect its JSON result. Configure the persistent one-minute schedule, monitor HTTP failures/backlog and confirm another invocation happens without a browser open.
5. Perform the walkthrough below in staging, including two users/tabs, role revocation, a real push-capable device, closed-tab delivery and denied permission. Verify the sender's VAPID identity and HTTPS origin. Then approve the same migration/application/scheduler sequence for production and run a supervised pilot.
6. For application rollback, retain additive notification tables so committed outbox/history is preserved. Disable the scheduler if needed and diagnose failures; do not delete business data or blindly roll back prerequisite migrations. Applying another migration that replaces order/staff functions afterward requires reviewing compatibility and reapplying this final notification migration where appropriate.

## Diagnose “order exists, alert missing”

1. Confirm the restaurant/user/role and event type. New orders require pending status; kitchen alerts require actual tickets. Check whether the user was an intended recipient at event creation and still has access. Category preferences affect sound/push, not authorized inbox retention.
2. In an authorized database console, query `notification_events` by `restaurant_id` and `resource_id`. Inspect `processed_at`, `attempts`, `available_at`, and `last_error` (SQLSTATE only). No event suggests missing triggers, a pre-migration order, or an inapplicable business transition.
3. If pending, inspect scheduler `worker_tick` logs and retry/backlog counts. A successful foreground feed dispatch can also drain the restaurant. Do not delete dedupe keys to “retry” an order/payment.
4. Check its `notification_inbox` records and recipient/read state, then the feed HTTP response. A permission error requires fixing team access, not weakening RLS. For realtime failure verify publication/auth/channel status; foreground polling should recover within its interval/backoff.
5. For sound, check saved category/volume, this tab's AudioContext activation and another visible tab claiming the sound. Reloads and old/resolved history intentionally remain silent.
6. For push, inspect subscription `last_seen_at` and delivery state/attempts/lease/last_error. Check permission, current session, VAPID setup, job authorization, stale/read/resolved suppression, expired endpoints and visible provider acknowledgement. Worker `sent` means provider acceptance, not proof of device display. Never include endpoint keys, auth tokens, guest notes or payment secrets in operational logs.

## Validation evidence and manual walkthrough

Local PostgreSQL tests use real migration SQL in PGlite. Browser tests execute the actual React components, route handlers and PostgreSQL fixture; Supabase transport/session/realtime and payment provider traffic are controlled fixtures. This is distinct from real hosted Supabase/device testing.

- 44 database/API/payment/permission/reporting regression tests passed; two additional audio/service-worker tests passed (46 unique tests total). Coverage includes independent reads, cross-tenant/role rejection, replayed events/webhooks, injected delivery failure and retry, reminder escalation/stop/catch-up, low-stock rearming, private HR/outlet access, exact resource reads, 125+ orders, safe public tracking, push leases/revocation/cleanup and bounded sending.
- Six notification browser scenarios passed: arrivals on another page, one listener through StrictMode/navigation, saved unread/audio preferences, two-tab single sound, outage recovery, stable history/dirty settings, 390px dialog/keyboard focus, customer status and logout cleanup. Screenshots/report: ignored `artifacts/notifications-qa/`.
- Seven complete service-shift browser scenarios passed, including active-to-history completion, kitchen, verified payment fixture, refunds, cash closing, mobile dark mode and revoked staff. Report: ignored `artifacts/service-shift-qa/`.
- Frozen pnpm installation, standalone TypeScript and production build passed. Lint passed with warnings about existing image/React-hook/accessibility patterns, including lifecycle-ref warnings in notification/order cleanup; no lint errors were disabled. No remote migration, production deployment, real payment or real push was performed.
- Notification-related tracked files pass `git diff --check`. The whole dirty workspace also contains unrelated existing whitespace findings in `app/menu/[slug]/components/MenuTier1.tsx` and `lib/menu-layout.ts`; those edits were preserved.
- Still to verify with deployment credentials/devices: real Realtime publication/RLS delivery, scheduled execution/latency under expected load, browser subscription/VAPID/provider delivery, closed-tab/mobile OS display, session expiry and physical staff devices. PGlite and transport fixtures do not prove multi-process production throughput or every browser's localStorage fallback timing.

Manual pilot:

1. Enable ordering and, if used, billing/kitchen tickets. Grant waiter/kitchen/manager accounts. In owner Notifications preferences enable sound and test it; optionally enable background notifications on a real device.
2. Stay on Menu or Settings. Place a customer order. Check owner/serving bell, independent unread state and kitchen ticket alert. Open the bell without marking all read; open the exact order and accept it.
3. Kitchen moves queued → preparing → ready. Serving staff receive Ready to serve; customer tracking updates automatically. Mark served; verify the ticket is no longer actionable. Complete the order through its existing status transitions and find it in Completed & cancelled.
4. Place another pending order and leave it unresolved. Run the scheduler normally. Confirm reminder then escalation; reading it must not stop reminders. Accept/cancel it and confirm reminders stop. Disconnect/reconnect a browser and verify recovery without replaying history sounds.
5. Check a low-stock crossing/replenishment, saved leave request, low-rating feedback, and provider-confirmed refund failure in staging with the expected restricted recipients. Verify a read action never changes the financial ledger.
