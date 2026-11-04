# Restaurant service-shift readiness

Work is completed and verified in this order. A local simulation is separate from a real restaurant shift and real provider payment.

| Step | Acceptance criteria | Status |
|---|---|---|
| 1. Reliability | Atomic order + items + kitchen ticket; repeat and concurrent retries create one order; stale status updates fail; new orders refresh and alert | Database, retry-key and HTTP mode tests passed; browser coverage also included in shift test |
| 2. Reporting | Unpaid orders never count as money received; refunds, overpayments, invoice totals and daily cash closing remain distinct | Database and unavailable-report cases passed |
| 3. Staff permissions | Separate verified staff accounts; waiter, kitchen, cashier and manager roles; cross-restaurant and forbidden actions fail in the database | Database and role-specific browser checks passed |
| 4. Payment validation | Captures/refunds verified against merchant, order, amount and currency; replay/outage recovery; staging and merchant readiness report | Isolated HTTP integration tests passed; live credentials authenticated; deployed checkout remains pending |
| 5. Service shift | One isolated restaurant completes guest orders, staff service, kitchen, payment, correction/refund and cash closing with expected totals | Isolated browser shift passed; physical restaurant pilot remains pending |

No live credentials, real payments, messages or production migrations are used by the isolated automated tests. Real-environment checks are recorded separately with their actual results.

## Cases and evidence

| Cases | Test file | Expected result |
|---|---|---|
| R1–R6: failed item insert, retry/reload/concurrent duplicate, changed request, unavailable/foreign dish, view-only mode | `tests/order-reliability.test.cjs`, `tests/menu-modes.test.cjs` | All order rows/items/tickets commit together; retry returns one token; server prices win; mode restrictions hold |
| R7–R9: stale version, invalid transition, cancellation without reason | `tests/order-reliability.test.cjs` | Reject writes; valid cancellation has an audit event and withdraws active preparation |
| F1–F5: unpaid order, partial cash, processed refund, date boundaries, unavailable reporting | `tests/reporting.test.cjs` | Collections count financial events only; unavailable reports show a gap instead of zero |
| S1–S7: unverified account, invalid role, cross-restaurant access, role escalation, raw table/helper access, cashier refund/report/closing, revoked session | `tests/staff-permissions.test.cjs` | Reject each forbidden path in PostgreSQL, including direct RPC calls |
| S8–S10: kitchen projection, staff oral order in view-only mode, table retry mismatch | `tests/staff-permissions.test.cjs` | Kitchen sees no phones/financial data; staff order uses stored prices once; changed retry visit fails |
| P1–P7: wrong signature/order/amount/currency, authorization without capture, callback/webhook replay, processed-then-pending refund event | `tests/pos.test.cjs`, `tests/payment-integration.test.cjs` | Unverified events never settle; repeated events create one payment/refund/credit |
| P8–P11: provider POST succeeds but connection is lost for checkout/refund, early webhook, definitive rejection | `tests/payment-integration.test.cjs` | Reconcile with GET; do not repeat uncertain POST; retry early webhook after attachment; safely replace rejected checkout |
| B1–B8: disabled-by-default, settings, invoices/QR, cash/refund, table bill, kitchen, closing, mobile receipt | `tests/pos-browser-qa.cjs` | Existing owner operations remain usable; all eight browser scenarios pass |
| SHIFT1–SHIFT7: separate role sessions, lost order response, polling/outage, kitchen/service completion, split payment, refund/closing, mobile/revocation | `tests/service-shift-browser-qa.cjs` | One complete simulated restaurant shift; ledger totals reconcile exactly; no browser errors |

Full automated suite on 2026-10-27: **81 passed, 0 failed**. Production build and TypeScript checks passed. Staff HTTP session/origin/tenant/revocation checks and write-response redaction are covered in `tests/staff-api.test.cjs`. Screenshots and the browser report are in ignored `artifacts/service-shift-qa/`; owner regression artifacts are in `artifacts/pos-qa/`.

The built Next.js production server also passed seven local HTTP smoke checks: home/login render, staff/team pages redirect anonymous users to login with a safe return path, staff/owner billing APIs require a session, and a cross-origin staff write is rejected. This exercises the deployed build locally without modifying any remote database.

The synthetic shift issues one ₹354 invoice for three coffees. It receives ₹100 cash and ₹254 online, refunds ₹18 online, and records one credit note. Expected net collections and net invoice value are both **₹336**, outstanding and overpaid balances are **₹0**. Opening cash ₹500 plus ₹100 received gives an expected and counted drawer of **₹600**. Test addresses and names belong to isolated fixtures, not a real restaurant.

## Actual environment checks — 2026-10-27

- A read-only authenticated `GET /v1/orders?count=1` against Razorpay returned **HTTP 200** at 11:09 UTC. Mode: live. Credentials and provider records were not printed or saved. This establishes API authentication only; no real order, charge or refund was created.
- `https://qr-menu-pearl-two.vercel.app/` returned **200**. `/staff` and a billing API probe returned **404 HTML pages**. These new routes have not been deployed to that site.
- Live checkout, live webhook delivery, a captured/refunded live payment and printer hardware are **not verified**. The automated provider is a local HTTP fixture; it does not call Razorpay.
- No restaurant or real service shift was supplied. The isolated restaurant covers functional verification; a supervised pilot is still required for real staff, connectivity, printing and cash handling.

## Rollout and real checkout

1. Back up the target database. Apply the incremental migrations in the order in [billing setup](billing-setup.md). Existing installations must not re-run the base schema.
2. Deploy the reviewed application code. Confirm `/staff` redirects to login and billing APIs return JSON rather than missing-route HTML.
3. Sign in as the test outlet owner, add a menu dish, and enable billing/kitchen under Billing settings. Use clearly labelled test data with Razorpay test mode for staging; a local synthetic outlet needs no real restaurant details.
4. Configure restaurant-scoped merchant credentials and a webhook secret in the deployment environment. Set automatic capture and configure the documented captured/refund events. Rotate the keys shared in the conversation before using them for ongoing deployment.
5. Complete one checkout as the customer, confirm the same payment in both the provider and bill ledger, replay its webhook, and issue/reconcile one refund. Record provider event IDs and results in a private operational record.
6. Run a supervised restaurant shift, verifying devices, arrival alerts, outage recovery, printer output, restricted staff actions, drawer count and owner report. Do not mark this physical pilot complete from the automated fixture results.

`node scripts/check-payment-account.cjs` accepts credential JSON on hidden stdin, or `PAYMENT_CHECK_KEY_ID` / `PAYMENT_CHECK_KEY_SECRET` from the process environment. It performs only a read-only authentication probe and emits sanitized status metadata. Never pass secrets as shell arguments or commit them.

## Table approval follow-up — 2026-10-30

Four-digit in-person phone approval is implemented as a separate opt-in module. Owner setup and per-table QR downloads are under `/dashboard/table-access`; authorized staff approve guest codes under Staff workspace → Orders. Orders are guarded inside PostgreSQL and tied to a private browser cookie, table and live visit. Closing or moving a visit revokes both pending requests and approved phones.

The updated automated suite has 104 cases. The new verification browser run has 10 scenarios, alongside the eight owner billing and seven service-shift scenarios. See [table verification](table-verification.md) for migration order, exact shared rate budgets and test coverage. Results remain local; applying the incremental migrations and deploying this revision are still required before this flow is available on the hosted site.
