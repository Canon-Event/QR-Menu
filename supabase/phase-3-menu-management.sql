-- Phase 3 migration for projects that have already run schema.sql.
-- Run once in the Supabase SQL editor.

drop policy if exists "owner_categories" on categories;
create policy "owner_categories" on categories
  for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

drop policy if exists "owner_dishes" on dishes;
create policy "owner_dishes" on dishes
  for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (
    restaurant_id in (select id from restaurants where owner_id = auth.uid())
    and (category_id is null or category_id in (
      select id from categories where restaurant_id in (
        select id from restaurants where owner_id = auth.uid()
      )
    ))
  );

create index if not exists categories_restaurant_sort_idx on categories (restaurant_id, sort_order);
create index if not exists dishes_restaurant_category_sort_idx on dishes (restaurant_id, category_id, sort_order);
