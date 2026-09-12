-- Phase 4: ingredients, inventory, and dish recipes.
-- Run once in the Supabase SQL editor after the base schema.

create table if not exists ingredients (
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

create table if not exists dish_ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  dish_id uuid not null references dishes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(15,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','l','piece','portion','tsp','tbsp')),
  unique (dish_id, ingredient_id)
);

alter table ingredients enable row level security;
alter table dish_ingredients enable row level security;

drop policy if exists "owner_ingredients" on ingredients;
create policy "owner_ingredients" on ingredients for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

drop policy if exists "owner_dish_ingredients" on dish_ingredients;
create policy "owner_dish_ingredients" on dish_ingredients for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
    and dish_id in (select id from dishes where restaurant_id in (select id from restaurants where owner_id = auth.uid()))
    and ingredient_id in (select id from ingredients where restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  );

create index if not exists ingredients_restaurant_name_idx on ingredients (restaurant_id, name);
create index if not exists ingredients_low_stock_idx on ingredients (restaurant_id, is_active, quantity, low_stock_threshold);
create index if not exists dish_ingredients_dish_idx on dish_ingredients (dish_id);
create index if not exists dish_ingredients_ingredient_idx on dish_ingredients (ingredient_id);
