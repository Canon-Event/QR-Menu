-- Run in the Supabase SQL Editor for an existing installation, before
-- deploying the menu mode UI and API changes. Safe to run again.


-- Existing restaurants keep their current mobile ordering behavior.
alter table public.restaurants
  add column if not exists menu_mode text not null default 'ordering'
  check (menu_mode in ('ordering', 'view_only'));

-- New restaurants start with a view-only menu unless the owner chooses ordering.
alter table public.restaurants alter column menu_mode set default 'view_only';

commit;

notify pgrst, 'reload schema';
