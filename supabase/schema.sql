-- ─────────────────────────────────────────
-- QR Menu SaaS — Supabase Schema
-- ─────────────────────────────────────────

-- RESTAURANTS
create table restaurants (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade,
  name        text not null,
  slug        text unique not null,          -- used in /menu/[slug]
  logo_url    text,
  description text,
  address     text,
  phone       text,
  currency    text not null default 'INR' check (currency in ('INR','USD','EUR','GBP','AED')),
  qr_foreground text not null default '#000000' check (qr_foreground ~ '^#[0-9a-fA-F]{6}$'),
  qr_background text not null default '#ffffff' check (qr_background ~ '^#[0-9a-fA-F]{6}$'),
  qr_margin int not null default 2 check (qr_margin between 0 and 8),
  tier        int not null default 1,        -- 1 | 2 | 3
  template    text not null default 'A',     -- 'A' | 'B' | 'C' | premium keys
  custom_css  text,                          -- tier 3 free / others paid unlock
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- CATEGORIES
create table categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  name          text not null,
  sort_order    int default 0
);

-- DISHES
create table dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  description   text,
  price         numeric(10,2),
  is_veg        boolean default true,
  is_available  boolean default true,
  sort_order    int default 0,
  -- tier 1: nothing extra
  -- tier 2:
  image_url     text,
  video_url     text,
  -- tier 3:
  model_url     text,   -- .glb file in supabase storage
  created_at    timestamptz default now()
);

-- INGREDIENTS / INVENTORY
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  quantity numeric(15,3) not null default 0 check (quantity >= 0),
  unit text not null check (unit in ('g','kg','ml','l','piece','portion','tsp','tbsp')),
  low_stock_threshold numeric(15,3) not null default 0 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dish_ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  dish_id uuid not null references dishes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(15,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','l','piece','portion','tsp','tbsp')),
  unique (dish_id, ingredient_id)
);

-- SUBSCRIPTIONS
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references restaurants(id) on delete cascade,
  tier            int not null,
  status          text default 'active',  -- active | cancelled | past_due
  razorpay_sub_id text,
  started_at      timestamptz default now(),
  ends_at         timestamptz
);

-- ADDONS (template packs, extra customization)
create table addons (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  addon_key     text not null,   -- e.g. 'template_pack_1', 'customization'
  paid_at       timestamptz default now()
);

-- CONTACT MESSAGES
create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  ip_address text,
  created_at timestamptz default now()
);

alter table contact_messages enable row level security;

-- RLS
alter table restaurants  enable row level security;
alter table categories   enable row level security;
alter table dishes       enable row level security;
alter table ingredients  enable row level security;
alter table dish_ingredients enable row level security;
alter table subscriptions enable row level security;
alter table addons       enable row level security;

-- owners can only see/edit their own data
create policy "owner_restaurants" on restaurants
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner_categories" on categories
  for all using (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
  ) with check (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
  );

create policy "owner_dishes" on dishes
  for all using (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
  ) with check (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
    and (category_id is null or category_id in (
      select id from categories where restaurant_id in (
        select id from restaurants where owner_id = auth.uid()
      )
    ))
  );

create policy "owner_ingredients" on ingredients for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

create policy "owner_dish_ingredients" on dish_ingredients for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
    and dish_id in (select id from dishes where restaurant_id in (select id from restaurants where owner_id = auth.uid()))
    and ingredient_id in (select id from ingredients where restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  );

create index categories_restaurant_sort_idx on categories (restaurant_id, sort_order);
create index dishes_restaurant_category_sort_idx on dishes (restaurant_id, category_id, sort_order);
create index ingredients_restaurant_name_idx on ingredients (restaurant_id, name);
create index ingredients_low_stock_idx on ingredients (restaurant_id, is_active, quantity, low_stock_threshold);
create index dish_ingredients_dish_idx on dish_ingredients (dish_id);
create index dish_ingredients_ingredient_idx on dish_ingredients (ingredient_id);

-- public read for active menu (no auth needed for QR scan)
create policy "public_menu_read" on dishes
  for select using (
    restaurant_id in (select id from restaurants where is_active = true)
  );

create policy "public_category_read" on categories
  for select using (
    restaurant_id in (select id from restaurants where is_active = true)
  );

create policy "public_restaurant_read" on restaurants
  for select using (is_active = true);
