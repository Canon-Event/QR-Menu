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
