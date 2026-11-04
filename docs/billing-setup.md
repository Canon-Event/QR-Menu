# Billing and restaurant operations

This module was implemented independently. It uses the existing Next.js, Supabase authentication, menu and order records. It does not import the external restaurant POS repository, replace existing menus, or change subscription payments.

## Activate locally, then in your deployment

1. Apply `supabase/schema.sql` and `supabase/phase-9-analytics-orders.sql` if they are not already installed. For an existing database, do not re-run the base schema.
2. Apply these incremental migrations in order: `supabase/phase-order-reliability.sql`, `supabase/phase-pos.sql`, `supabase/phase-reporting.sql`, `supabase/phase-staff-permissions.sql`, then `supabase/phase-table-access.sql`. They are repeatable; staff permissions and table access must follow the updated reliability migration because they extend its authorization helpers. Billing and guest verification start disabled for every restaurant.
3. Open **Dashboard → Billing & POS → Settings**. Enter the outlet's legal name, full address, state code, registration status and service code. Confirm the correct classification with the restaurant's accountant, then enable billing. Kitchen tickets are a separate opt-in checkbox.
4. Test an invoice, cash purchase, refund, table visit and kitchen ticket before enabling the module for day-to-day use.

The first release supports in-person restaurant services in INR: unregistered businesses, composition taxpayers and regular registration, with inclusive or exclusive pricing. It does not classify alcohol, retail packaged goods, interstate deliveries or other tax categories. It does not file GST returns, generate IRNs/e-invoices, or establish that an outlet meets a tax regime's eligibility requirements. Verify applicable invoicing and e-invoicing obligations before using it as the sole statutory record. The outlet's configuration determines GST; tax settings are never inferred from a customer's payment method.

The standard regular-registration preset is 5% without ITC outside specified premises; the specified-premises preset is 18%. These are classifications, not freely selectable tax discounts. The accountant must confirm the preset, SAC and state tax treatment. References: [CBIC rates](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html), [invoice particulars](https://cbic-gst.gov.in/gst-invoice-rules.html).

## Service flow

- Phone orders continue through the existing menu and order confirmation. When an invoice is issued for an order, its confirmation page gains a link to the bill and payment options.
- In **Bills**, select one or more unbilled orders, optionally add dishes from the menu, enter a flat discount, preview the server-calculated total and issue the invoice. One order cannot belong to two active invoices. Printed bills contain a QR link to the customer's bill.
- In **Tables**, create tables, seat guests, attach existing orders to a visit, transfer the visit to a free table, and build a combined bill. Settle the table and finish kitchen tickets before closing the visit. Payment alone does not release the table.
- In **Kitchen**, queued tickets advance through preparing, ready and served. A cancellation requires a reason and does not itself change a bill or refund a customer. Existing ordering and order-status controls remain available.
- Use **Daily close** for invoice/tax totals, received payments, refunds and a summary CSV. Cash closing records opening cash, expected cash and counted cash. A saved closing is a snapshot; payments and refunds recorded afterward remain visible in the live report.

Menu totals on the existing order screen describe the ordered items. Exclusive GST is added at invoice time; disclose this clearly on the menu when choosing exclusive pricing. Inclusive pricing preserves the displayed menu price before discounts.

Invoices snapshot names, prices, seller details and tax treatment. Later menu or profile changes do not rewrite them. To correct an unpaid invoice, issue a full credit note with a reason; its orders can then be invoiced correctly. Refund received payments before crediting any remaining unpaid balance. Paid purchase refunds create numbered credit notes only after the refund is confirmed. Returning a genuine overpayment does not reduce taxable sales.

The dashboard shows the latest 100 invoices/orders and up to 200 recent/open kitchen tickets; daily totals query all records. Owners grant verified accounts access in **Team members**; staff use `/staff`. These permissions are separate from employee-directory and payroll records. Stock deduction and automatic loyalty stamps are not connected to these payments.

## Automatic online payments

Each restaurant must have its own approved Razorpay merchant account. Food payments never use the SaaS subscription keys. In server-side deployment secrets, set:

```text
POS_RAZORPAY_ACCOUNTS={"RESTAURANT_UUID":{"keyId":"rzp_test_EXAMPLE","keySecret":"REPLACE_WITH_MERCHANT_SECRET","webhookSecret":"REPLACE_WITH_A_RANDOM_SECRET"}}
```

The restaurant UUID appears under Billing settings. Never prefix this variable with `NEXT_PUBLIC_`, put it in Git, expose it in screenshots/logs, or enter secrets into customer-facing fields. The example file contains only an empty mapping. Configure the corresponding live values in the deployment's secret manager when going live.

1. Enable automatic capture in the restaurant's Razorpay account. An authorization alone does not mark a bill paid.
2. Configure a webhook at `https://YOUR_DOMAIN/api/payments/razorpay/webhook/RESTAURANT_UUID`, using the matching `webhookSecret`.
3. Subscribe to `payment.captured`, `refund.created`, `refund.processed` and `refund.failed`. Test mode and live mode need their corresponding keys and webhook setup.
4. Pay a test invoice through **Open customer bill**. Test a successful payment, a cancelled checkout, delayed webhook delivery and duplicate webhook delivery. Request a refund and verify its final state.
5. Retain original merchant credentials until outstanding checkouts and refunds have reconciled. Rotating to another key/account without reconciling older references intentionally fails verification.

The server creates the gateway order using the invoice balance. Browser callbacks require a valid signature and a server-fetched captured payment with matching order, amount, merchant key and INR currency. Signed webhook events provide the delayed/recovery path. Event replays cannot add the same payment or refund twice. A late second payment is retained as an overpayment requiring a refund, never silently discarded.

An unconnected merchant account leaves online checkout unavailable. Owners, managers and cashiers can still record cash. There is no staff-confirmed UPI/card option and no browser "I paid" switch. Gateway fees and account onboarding requirements depend on the merchant's provider agreement.

Refunds reserve the refundable amount transactionally. A timed-out money-moving request is not blindly posted again; subsequent attempts look for the original provider refund or await its webhook. If a provider request remains uncertain, reconcile its checkout/refund reference in the merchant dashboard before taking further action. Checkout retries recover lost order responses by querying the unique receipt and matching its notes, amount and currency. An unresolved result stays reserved. Definitively rejected requests can be retried as new requests; ambiguous timeouts/conflicts/rate limits stay pending.

Payment references and opaque bill URLs are bearer access links. Share them with the intended customer; anyone holding the receipt URL can view that receipt. In production, use HTTPS and a shared deployment/edge rate limit in addition to the local request limits.

Provider references: [checkout and capture](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook signatures and retries](https://razorpay.com/docs/webhooks/validate-test/).

## Staff accounts

For four-digit in-person phone approval, table QR codes and shared order rate limits, see [table verification](table-verification.md).

The owner shares `/login?next=/staff`. Staff sign in with their own email OTP; then the owner grants access to that verified email under **Team members**. Adding or editing employee/payroll records does not grant application access. No account invitation or message is sent by this module.

| Role | Allowed work |
|---|---|
| Waiter | Take orders at stored menu prices, update service status, seat/assign/transfer/close table visits |
| Kitchen | Read preparation tickets and update kitchen progress; no phone numbers, bills or financial reports |
| Cashier | Orders/tables, issue invoices, record cash and view verified payment records; no refunds, full credits, reports or closing |
| Manager | Service operations, table creation, kitchen, billing, refunds, reports and closing |
| Owner | All operations, billing settings and team access |

Membership is checked in database entry points on every request. Revocation applies to already signed-in sessions. Staff cannot read raw orders/payments tables, change team roles or switch to another restaurant by crafting requests. Reports and billing settings remain restricted even when someone calls the RPC directly. Cancellation and kitchen changes use versions and record reasons; payment and kitchen states remain separate.

## Verification

```powershell
npm run test:pos
pnpm test:readiness
pnpm test:service-shift
node --test tests/menu-modes.test.cjs tests/request-security.test.cjs tests/loyalty.test.cjs tests/loyalty-api.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Database and browser tests run against an isolated in-memory PostgreSQL database, never your Supabase project. If PGlite/Playwright are installed separately, point the test variables at them as with the existing loyalty database/browser tests:

```powershell
$posTools = Join-Path $env:TEMP 'wiit-pos-tools'
npm.cmd install --prefix $posTools --cache (Join-Path $env:TEMP 'wiit-pos-npm-cache') --no-save --package-lock=false @electric-sql/pglite playwright
$env:PGLITE_MODULE = Join-Path $posTools 'node_modules/@electric-sql/pglite'
$env:PLAYWRIGHT_MODULE = Join-Path $posTools 'node_modules/playwright'
# Set CHROMIUM_PATH to an installed Chromium executable if needed.
npm run test:pos:db
npm run test:pos:browser
```

Browser artifacts are written under ignored `artifacts/pos-qa/` and `artifacts/service-shift-qa/`. The service-shift test uses actual UI components, API handlers and isolated PostgreSQL with a local HTTP payment-provider fixture. Live gateway capture/refunds and printer hardware require separate checks with the restaurant's configured account and printer. No live transaction or production migration is performed by these tests. See [service-shift readiness](service-shift-readiness.md) for cases, results and deployment requirements.
