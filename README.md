# QR Menu SaaS

Restaurant digital menus delivered via QR code scan. Three subscription tiers.

## Tiers

| | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Menu | ✅ | ✅ | ✅ |
| Dish images/video | ❌ | ✅ | ✅ |
| 3D model viewer | ❌ | ❌ | ✅ |
| Free customization | ❌ | ❌ | ✅ |
| Base templates | 3 | 3 | 3 |
| Premium templates (add-on) | ✅ paid | ✅ paid | ✅ paid |

## Stack

- **Next.js 14** (App Router)
- **Supabase** — auth, Postgres, storage
- **React Three Fiber + Drei** — 3D model rendering (lazy, only loads on tier 3)
- **Tailwind CSS**
- **Razorpay** — subscriptions + add-on payments

## Setup

```bash
cp .env.local.example .env.local
# fill in Supabase + Razorpay keys

pnpm install --frozen-lockfile
# run schema in Supabase SQL editor: supabase/schema.sql

pnpm run dev
```

## Key paths

- `/menu/[slug]` — public menu (QR scan lands here)
- `/dashboard` — owner panel
- `/dashboard/menu` — dish/category CRUD
- `/dashboard/settings` — template picker, plan management

## 3D models

Upload `.glb` files to Supabase storage bucket `dish-models`.  
Set `model_url` on the dish to the public URL.

## Customer menu modes

Restaurant owners choose a mode during setup and can change it under **Dashboard > Settings > Menu mode**:

- **View menu only:** guests browse dishes and prices on their phone, then order verbally with staff. Quantity controls and checkout are hidden, and the public ordering API rejects new orders.
- **Menu with ordering:** guests select quantities and submit an order from their phone. Orders appear in the dashboard.

The choice applies to all menu templates and subscription tiers. Menu visit tracking works in both modes. Previously placed orders remain accessible after switching modes.

For an existing Supabase database, run `supabase/phase-menu-modes.sql` in the SQL Editor before deploying this change. Existing restaurants keep ordering enabled; new restaurants default to view only. New installations include the column in `supabase/schema.sql`; apply `supabase/phase-9-analytics-orders.sql` to enable order storage and analytics.

## Menu CSV import and export

The menu dashboard can download a starter template, import up to 500 dishes from a CSV file, and export the current menu. Imports append to the existing menu and automatically create missing categories.

Supported columns are `title`, `category`, `description`, `price`, `is_veg`, and `is_available`. Only `title` is required; blank prices become `0`, and blank boolean fields default to `yes`. Friendly aliases such as `name`, `category_name`, and `desc` are also accepted.

## Loyalty stamp cards

Open `/dashboard/loyalty` to design the card, configure rewards, award stamps for counter purchases and redeem rewards. Customers use **My rewards** on an activated restaurant menu. Phone verification, duplicate-bill protection, expiry and activity history are included.

Run `supabase/phase-loyalty.sql`, configure Supabase Phone Auth, and set `LOYALTY_PHONE_AUTH_ENABLED=true` before activation. Automatic stamps from online payments require a future customer-payment integration; existing order submission does not award stamps.

See [the beginner-friendly stamp-card guide](docs/stamp-card-guide.md) for setup, the purchase flow, limits, tests and a plain-language explanation of the code.

## Billing & POS

Optional billing, GST profiles, numbered invoices and credit notes, restaurant-owned Razorpay payments, tables, kitchen tickets and daily cash closing are available at `/dashboard/billing`. Existing menu and ordering flows stay available. Run `supabase/phase-pos.sql` after the order migration, then explicitly enable billing for an outlet. Online payments require merchant configuration and signed webhooks; there is no manual UPI confirmation.

Read [the billing setup guide](docs/billing-setup.md) for activation, supported tax scope, payment setup, security controls and verification.

## Menu photo import

The menu-photo importer lives at `/dashboard/ai-menu`. Apply `supabase/phase-ai-menu.sql`, configure the server-only service key, and review extracted dishes before publishing. Free PaddleOCR runs on demand in the owner's browser; customer menus download no OCR runtime. Gemini is an optional online reader. Setup, architecture and checks: [menu import integration](docs/ai-menu-integration.md).

The photo studio includes five design presets, colours, background effects, layouts, cover photos and a live preview. Existing AI-import installations also need `supabase/phase-ai-menu-design.sql` before saving the expanded appearance settings.

## Restaurant notifications

Persistent role-scoped alerts, unread history, sound preferences, kitchen/serving alerts, server reminders and optional Web Push are available across authenticated workspaces. Orders have paginated active/history lists; customer tracking updates automatically. Apply `supabase/phase-notifications.sql` after its prerequisites and configure the scheduled worker before release. See [notification setup, permissions and release guide](docs/notifications.md) for exact commands, validation results and deployment checks.
