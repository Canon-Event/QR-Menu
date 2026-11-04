# Four-digit waiter approval

Guests scan a table QR and show the code on their phone to a waiter in person. The waiter looks up the code in the authenticated staff workspace, checks the displayed table and approves that phone for the current open visit. No SMS is sent.

This feature is opt-in per restaurant. Until the owner enables it, existing phone ordering continues as before. When enabled, a public menu link remains viewable but orders require an approved browser session. This is an in-person staff check, not automatic proof of physical location; staff must not approve codes supplied remotely.

## Install and activate

For an existing POS installation, apply these in order:

1. The updated `supabase/phase-order-reliability.sql` (adds the guarded engine signature).
2. `supabase/phase-staff-permissions.sql` (restores staff authorization after the reliability migration).
3. `supabase/phase-table-access.sql` last. Its transaction refuses to install without the updated engine.

For a fresh installation, the full order is base schema, phase-9 orders, order reliability, POS, reporting, staff permissions, then table access. Do not re-run the base schema against an existing database. Re-running reliability alone fails closed for verified outlets; always finish by re-running staff permissions and table access.

Deploy the updated application. Enable phone ordering, create tables in **Billing & POS → Tables**, then open **Dashboard → Table verification**. Download and print each table’s QR, enable **Require waiter approval for phone orders**, and seat guests by opening a table visit. Waiters find the approval panel under **Staff workspace → Orders**. Kitchen accounts cannot access it; owners alone can change the setting.

Codes expire after five minutes and are unique within the restaurant’s active/reserved code space. Used codes are reserved for 30 minutes to reduce accidental stale-code reuse. Refreshing a page or retrying a lost scan response reuses its pending request. A second phone gets a separate request and requires its own approval. Approved access lasts up to eight hours and ends when the visit closes, staff revoke it, or the verification setting changes. Opening another table’s QR requests fresh approval and revokes that browser’s previous table access.

Approved orders automatically attach to the verified visit and use stored menu prices. Moving a visit to another table revokes its pending codes and approved phones; guests scan the destination QR and obtain fresh approval while their existing orders stay on the same visit. Closing a visit also invalidates pending codes so they cannot carry into the next party. Once a table invoice has been issued, new additions are rejected; retries of an already submitted order remain idempotent. Corrections use the existing invoice/credit workflow.

## Security and rate limits

The four digits are an authenticated staff lookup, not a customer login credential. The actual proof is a 256-bit server-derived token in an HttpOnly, Secure-on-HTTPS, SameSite=Lax cookie scoped to `/api/public`. Only its SHA-256 hash is stored. Approval is bound to that session, restaurant, QR table and exact open visit. A bootstrap nonce cannot recover an already approved cookie from another browser. Neither an `approved` JSON flag nor a code/session ID in a public order body grants access.

Shared PostgreSQL counters enforce these fixed-window defaults across application replicas:

| Scope | Budget |
|---|---|
| Guest API traffic per trusted IP | 2,400 requests/minute, including invalid sessions/unknown restaurants |
| Status polling per browser session, or IP without a cookie | 24/minute |
| New scan requests per IP | 200/10 minutes |
| New scan requests per table | Greater of 12 or three times configured seats, per five minutes |
| Pending requests per restaurant | 500 live requests |
| Staff access requests per account | 120/minute |
| Staff code searches per account/outlet | 60/minute |
| Incorrect code lookups/approvals per account/outlet | Eight misses per five minutes; the next miss locks searches until reset |
| Public order attempts per IP | 300/minute, plus local burst protection |
| Verified order attempts per phone | Six/minute and 30/hour, including failed order writes |
| New orders per table visit | 20/minute |
| Approved phones per table visit | 40 |

Rate errors return HTTP 429 and `Retry-After`; guest/staff screens respect the cooldown. Database rate counters commit even when order creation rolls back. The order, item, kitchen ticket, visit link and phone association commit together or not at all. Expired rate rows are pruned in bounded batches after a day; expired never-approved session rows are pruned after their code reservation plus a day. Financial/approved audit links are preserved.

IP addresses are HMAC-hashed; raw addresses are not stored by this feature. Vercel’s trusted forwarded header is used on Vercel. On other hosts, `TABLE_ACCESS_TRUSTED_IP_HEADER` may be set only behind a proxy that strips and overwrites that header; otherwise requests use a shared `unknown` bucket. A separate `TABLE_ACCESS_HASH_SECRET` can be configured; the server service-role secret is the default. Never use a `NEXT_PUBLIC_` variable for either secret. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).

Application limits do not replace hosting-level protection against network floods. Keep the origin behind the trusted proxy and use the hosting firewall for traffic that should be blocked before it reaches the app. No browser GPS or SMS claim is used as physical-presence proof.

## Verification

With the existing PGlite/Playwright test environment configured:

```powershell
pnpm test:table-access
pnpm test:table-access:browser
node --test tests/*.test.cjs
pnpm test:pos:browser
pnpm test:service-shift
pnpm build
```

Database/API cases cover pending/fabricated cookies, direct legacy RPC bypasses, stale codes, scan retries, simultaneous duplicate scans, code uniqueness, wrong visits/QRs/tenants, kitchen and revoked staff, cookie attributes, untrusted IP spoofing, session expiry, individual revocation, new-table scans, rate boundaries, retained limits on failed writes, atomic order rollback, multiple phones, immutable billed visits, close/reopen and migration repeatability.

Browser scenarios exercise owner activation/QR downloads, guest code/reload, waiter approval, second-phone isolation, split-phone shared billing, lost order responses, cross-table rejection, offline recovery, expiration/renewal, wrong-code cooldown, table closing and 390px dark-mode layouts. Reports/screenshots are in ignored `artifacts/table-access-qa/`. Tests use isolated PostgreSQL and synthetic accounts; they do not update the hosted database, send messages or move real money.
