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

npm install
# run schema in Supabase SQL editor: supabase/schema.sql

npm run dev
```

## Key paths

- `/menu/[slug]` — public menu (QR scan lands here)
- `/dashboard` — owner panel
- `/dashboard/menu` — dish/category CRUD
- `/dashboard/settings` — template picker, plan management

## 3D models

Upload `.glb` files to Supabase storage bucket `dish-models`.  
Set `model_url` on the dish to the public URL.

## Menu CSV import and export

The menu dashboard can download a starter template, import up to 500 dishes from a CSV file, and export the current menu. Imports append to the existing menu and automatically create missing categories.

Supported columns are `title`, `category`, `description`, `price`, `is_veg`, and `is_available`. Only `title` is required; blank prices become `0`, and blank boolean fields default to `yes`. Friendly aliases such as `name`, `category_name`, and `desc` are also accepted.
