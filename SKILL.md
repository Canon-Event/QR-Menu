---
name: qrmenu-development
description: Implement and debug features in this QR Menu SaaS repository, including restaurant menus, template editing, ordering, staff operations, loyalty, billing, and Supabase migrations. Use when working on this application's code or tests.
---

# QR Menu development

Use this skill from the repository root. Deliver the requested feature through its relevant UI, API, and persistence layers, following the existing restaurant and outlet boundaries.

## Establish the current behavior

Read `package.json` and inspect the affected route, shared helpers, and tests before editing. The installed stack is Next.js 15, React 18, strict TypeScript, Tailwind CSS, and Supabase; the README's Next.js 14 label is outdated. Treat current source and package declarations as authoritative when documentation differs.

Check the working tree and preserve existing user changes. Use the `@/*` alias for imports from the repository root. Follow the surrounding server/client component boundary; keep server credentials and privileged database operations out of browser code.

## Find the implementation

| Area | Starting points |
| --- | --- |
| Public menus and order tracking | `app/menu/[slug]/`, `app/order/[token]/`, `components/menu/` |
| Owner workspace and template editor | `app/dashboard/`, `components/dashboard/` |
| Menu rendering and settings | `components/menu/MenuDocument.tsx`, `lib/menu-design.ts`, `lib/menu-layout.ts`, `lib/menu-fonts.ts` |
| Menu validation and CSV | `lib/menu-api.ts`, `lib/menu-validation.ts`, `lib/menu-csv.ts` |
| Orders and request retries | `lib/orders.ts`, `lib/order-request.ts`, `app/api/public/orders/`, `app/api/orders/` |
| Staff authentication and roles | `app/staff/`, `components/staff/`, `lib/staff-server.ts`, `middleware.ts` |
| Billing, payments, and reporting | `components/billing/`, `lib/pos.ts`, `lib/pos-server.ts`, `lib/pos-payments.ts`, `lib/billing-api.ts`, `lib/reporting.ts` |
| Loyalty stamp cards | `components/loyalty/`, `lib/loyalty.ts`, `lib/loyalty-server.ts`, `app/api/loyalty/` |
| Authentication and request safeguards | `lib/supabase-server.ts`, `lib/supabase-browser.ts`, `lib/request-security.ts`, `lib/auth-redirect.ts` |
| Database schema and migrations | `supabase/schema.sql`, `supabase/phase-*.sql` |
| Shared types and styles | `types/`, `app/globals.css`, feature stylesheets in `app/` |

## Preserve application contracts

### Menus and templates

Use the shared menu document and normalized design settings for public menus, gallery previews, and editor previews. Extend those shared models when adding controls so saved settings render consistently. Preserve each template's artwork and typography while allowing content to flow in the owner's category and dish order.

Check long names, descriptions, empty categories, many dishes, and narrow screens when changing layout. Keep editor save, dirty, error, reset, and navigation behavior coherent. Read `docs/menu-system-audit.md` for the menu architecture and known layout concerns relevant to this work.

Preserve subscription gates in `lib/tier.ts`. Keep 3D assets lazily loaded for the eligible tier. Menu mode is independent of template and tier: view-only mode hides customer checkout controls and rejects new public orders on the server, while earlier orders remain accessible. Authorized staff ordering has a separate workflow.

### API and restaurant access

Reuse the relevant ownership or staff authorization helper instead of trusting a submitted restaurant ID. Scope data access to the verified restaurant and, where applicable, outlet. Middleware redirects are only part of authentication; route handlers and database policies must enforce their own access rules.

Reuse origin checks, bounded JSON/multipart readers, and appropriate throttling from existing route patterns. A `Content-Length` check alone does not bound streamed request bytes. Keep database and provider errors sanitized. See `SECURITY.md` when changing request handling, uploads, authentication, or dependencies.

### Orders, billing, and loyalty

Preserve server-calculated order prices, atomic order/item/kitchen-ticket writes, retry-key semantics, and version checks on status changes. Verify repeated requests do not create duplicate orders or financial events.

Billing is optional and enabled per outlet. Preserve integer money calculations and the distinction between order totals, invoices, collections, refunds, and drawer balances. Unpaid orders must not count as received money.

Use existing merchant-scoped payment verification and reconciliation. A client success callback or an authorization without capture does not establish settlement. Verify provider signatures, merchant, order, amount, and currency. Reconcile uncertain checkout/refund outcomes before repeating a provider write.

Keep loyalty phone verification, duplicate-bill protection, expiry, and redemption controls intact. Do not assume ordinary order submission awards stamps; follow the implemented purchase and payment integration.

### Database changes

Inspect the relevant phase migration and its callers before changing a query or RPC. Provide an incremental migration for existing installations, with compatible defaults and restaurant-scoped policies. Do not re-run the base schema against an existing database. Read `docs/billing-setup.md` for billing migration dependencies and `docs/stamp-card-guide.md` for loyalty activation requirements.

Preparing SQL does not establish that a remote database has been migrated. Apply remote changes only within the user's authorized scope, and report application status separately from local verification. Use `.env.local.example` to identify configuration names; do not copy secrets into source, logs, or reports.

## Verify the affected behavior

Use existing focused tests and add coverage for meaningful behavior changes. Tests use Node's built-in runner with `.cjs` files and shared fixtures under `tests/helpers/`.

| Changed behavior | Relevant commands |
| --- | --- |
| Menu import/export | `npm run test:csv` |
| Menu layout, settings, or ordering mode | `node --test tests/menu-layout.test.cjs tests/menu-settings.test.cjs tests/menu-modes.test.cjs` |
| Request security | `npm run test:security` |
| Loyalty | `npm run test:loyalty` and, when database behavior changes, `npm run test:loyalty:db` |
| Billing calculations or persistence | `npm run test:pos`, `npm run test:pos:db` |
| Orders, reporting, staff roles, or payment integration | `npm run test:readiness` |

For application code changes, run `npx tsc --noEmit` and `npm run build` as appropriate to the scope. Development uses `.next-dev`; production builds use `.next`. Preserve this separation in `next.config.js`.

For UI changes, inspect the corresponding `tests/*-browser-qa.cjs` script before running it to understand fixtures and prerequisites. Available npm entry points include `test:pos:browser` and `test:service-shift`; menu and loyalty browser scripts can be run directly with Node. Check both owner preview and public rendering when changing shared menu components.

Report what changed, the checks actually run, and any remaining limitations. Distinguish isolated fixture results, local production-build checks, remote persistence, live provider verification, and a physical restaurant pilot. See `docs/service-shift-readiness.md` for the operational acceptance cases; previous recorded results are not evidence for new changes.
