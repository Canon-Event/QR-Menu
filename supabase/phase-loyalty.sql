-- Stamp-card MVP. Run after schema.sql. Safe to re-run; no existing menu data is changed.
-- All stamp and reward writes happen inside database transactions below.
begin;

create table if not exists public.loyalty_programs (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  launched_at timestamptz,
  title text not null check (char_length(title) between 1 and 60),
  reward_name text not null check (char_length(reward_name) between 1 and 100),
  stamp_target integer not null default 5 check (stamp_target between 3 and 12),
  minimum_spend numeric(12,2) not null default 0 check (minimum_spend between 0 and 1000000),
  inactivity_days integer not null default 180 check (inactivity_days between 30 and 365),
  reward_valid_days integer not null default 30 check (reward_valid_days between 7 and 180),
  card_style text not null default 'paper' check (card_style in ('minimal','paper','bold')),
  accent_color text not null default '#465FFF' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#F7F3E8' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  stamp_icon text not null default 'coffee' check (stamp_icon in ('coffee','star','utensils')),
  card_font text not null default 'classic' check (card_font in ('modern','classic','friendly')),
  created_at timestamptz not null default now()
);
create table if not exists public.loyalty_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.loyalty_programs(restaurant_id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  card_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  display_name text not null check (char_length(display_name) between 2 and 60),
  phone_last4 text not null,
  progress_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, customer_id), unique (id, restaurant_id)
);
create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  restaurant_id uuid not null,
  reward_name text not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  redemption_key uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (member_id, restaurant_id) references public.loyalty_members(id, restaurant_id) on delete cascade
);
create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  restaurant_id uuid not null,
  status text not null default 'available' check (status in ('available','consumed','expired','reversed')),
  bill_reference text not null check (char_length(bill_reference) between 2 and 80),
  paid_amount numeric(12,2) not null check (paid_amount > 0),
  awarded_by uuid references auth.users(id) on delete set null,
  request_key uuid not null,
  reward_id uuid references public.loyalty_rewards(id),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (member_id, restaurant_id) references public.loyalty_members(id, restaurant_id) on delete cascade,
  unique (restaurant_id, bill_reference), unique (restaurant_id, request_key)
);
create table if not exists public.loyalty_activity (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('award','redeem','reverse')),
  reference_id uuid not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_member_customer_idx on public.loyalty_members(customer_id);
create index if not exists loyalty_stamp_member_idx on public.loyalty_stamps(member_id, status, created_at);
create index if not exists loyalty_reward_member_idx on public.loyalty_rewards(member_id, created_at desc);
create index if not exists loyalty_activity_restaurant_idx on public.loyalty_activity(restaurant_id, created_at desc);

-- Keep the default in sync when this migration is re-run on an existing database.
alter table public.loyalty_programs alter column accent_color set default '#465FFF';

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_activity enable row level security;

drop policy if exists loyalty_program_read on public.loyalty_programs;
create policy loyalty_program_read on public.loyalty_programs for select using (
  exists (select 1 from public.restaurants r where r.id = restaurant_id and (r.owner_id = auth.uid() or r.is_active))
);
drop policy if exists loyalty_program_insert on public.loyalty_programs;
create policy loyalty_program_insert on public.loyalty_programs for insert to authenticated with check (
  exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists loyalty_program_update on public.loyalty_programs;
create policy loyalty_program_update on public.loyalty_programs for update to authenticated using (
  exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
) with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
drop policy if exists loyalty_member_read on public.loyalty_members;
create policy loyalty_member_read on public.loyalty_members for select to authenticated using (
  customer_id = auth.uid() or exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists loyalty_stamp_read on public.loyalty_stamps;
create policy loyalty_stamp_read on public.loyalty_stamps for select to authenticated using (
  exists (select 1 from public.loyalty_members m where m.id = member_id and m.restaurant_id = loyalty_stamps.restaurant_id)
);
drop policy if exists loyalty_reward_read on public.loyalty_rewards;
create policy loyalty_reward_read on public.loyalty_rewards for select to authenticated using (
  exists (select 1 from public.loyalty_members m where m.id = member_id and m.restaurant_id = loyalty_rewards.restaurant_id)
);
drop policy if exists loyalty_activity_read on public.loyalty_activity;
create policy loyalty_activity_read on public.loyalty_activity for select to authenticated using (
  exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
);

-- Removing default write grants prevents callers bypassing the functions.
revoke all on public.loyalty_programs, public.loyalty_members, public.loyalty_stamps, public.loyalty_rewards, public.loyalty_activity from anon, authenticated;
grant select on public.loyalty_programs to anon, authenticated;
grant insert, update on public.loyalty_programs to authenticated;
grant select on public.loyalty_members, public.loyalty_stamps, public.loyalty_rewards, public.loyalty_activity to authenticated;

create or replace function public.loyalty_protect_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.enabled then new.launched_at := coalesce(old.launched_at, now()); else new.launched_at := old.launched_at; end if;
  if new.restaurant_id <> old.restaurant_id then raise exception 'You cannot change another restaurant’s program.'; end if;
  if (new.reward_name, new.stamp_target, new.minimum_spend, new.inactivity_days, new.reward_valid_days)
    is distinct from (old.reward_name, old.stamp_target, old.minimum_spend, old.inactivity_days, old.reward_valid_days)
    and exists (select 1 from public.loyalty_members where restaurant_id = old.restaurant_id) then
    raise exception 'Program rules are locked after the first customer joins.';
  end if;
  return new;
end;
$$;
drop trigger if exists loyalty_rules_guard on public.loyalty_programs;
create trigger loyalty_rules_guard before update on public.loyalty_programs for each row execute function public.loyalty_protect_rules();

create or replace function public.loyalty_first_launch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.launched_at := case when new.enabled then now() else null end;
  return new;
end;
$$;
drop trigger if exists loyalty_first_launch on public.loyalty_programs;
create trigger loyalty_first_launch before insert on public.loyalty_programs for each row execute function public.loyalty_first_launch();

create or replace function public.loyalty_join(p_restaurant_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_phone text; v_member public.loyalty_members; v_program public.loyalty_programs;
begin
  select phone into v_phone from auth.users where id = auth.uid() and phone_confirmed_at is not null;
  if v_phone is null then raise exception 'Verify your phone number first.'; end if;
  if char_length(trim(p_name)) not between 2 and 60 then raise exception 'Enter your name.'; end if;
  select * into v_program from public.loyalty_programs where restaurant_id = p_restaurant_id for update;
  if not found or not v_program.enabled or not exists (select 1 from public.restaurants where id = p_restaurant_id and is_active) then raise exception 'Program unavailable.'; end if;
  insert into public.loyalty_members(restaurant_id, customer_id, display_name, phone_last4)
    values(p_restaurant_id, auth.uid(), trim(p_name), right(v_phone, 4)) on conflict (restaurant_id, customer_id) do nothing;
  select * into v_member from public.loyalty_members where restaurant_id = p_restaurant_id and customer_id = auth.uid();
  return to_jsonb(v_member);
end;
$$;

create or replace function public.loyalty_award(p_restaurant_id uuid, p_member_id uuid, p_bill_reference text, p_paid_amount numeric, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_program public.loyalty_programs; v_member public.loyalty_members; v_existing public.loyalty_stamps;
  v_stamp_id uuid; v_reward_id uuid; v_stamp_ids uuid[]; v_reference text := upper(trim(p_bill_reference));
begin
  if not exists (select 1 from public.restaurants where id = p_restaurant_id and owner_id = auth.uid() and is_active) then raise insufficient_privilege; end if;
  select * into v_program from public.loyalty_programs where restaurant_id = p_restaurant_id for update;
  if not found or not v_program.enabled then raise exception 'Program unavailable.'; end if;
  select * into v_member from public.loyalty_members where id = p_member_id and restaurant_id = p_restaurant_id for update;
  if not found then raise exception 'This card belongs to another restaurant.'; end if;
  if p_request_key is null or v_reference is null or char_length(v_reference) not between 2 and 80 then raise exception 'Enter a bill reference.'; end if;
  select * into v_existing from public.loyalty_stamps where restaurant_id = p_restaurant_id and request_key = p_request_key;
  if found then
    if v_existing.member_id <> p_member_id or v_existing.bill_reference <> v_reference or v_existing.paid_amount <> p_paid_amount then raise exception 'Reference already used for a different action.'; end if;
    return jsonb_build_object('stamp_id', v_existing.id, 'duplicate', true);
  end if;
  if p_paid_amount is null or p_paid_amount <= 0 or p_paid_amount < v_program.minimum_spend or p_paid_amount > 1000000 or p_paid_amount <> round(p_paid_amount, 2) then raise exception 'Enter a qualifying paid bill amount.'; end if;
  if exists (select 1 from public.loyalty_stamps where restaurant_id = p_restaurant_id and bill_reference = v_reference) then raise exception 'This bill has already earned a stamp.'; end if;
  if v_member.progress_expires_at <= now() then update public.loyalty_stamps set status = 'expired' where member_id = p_member_id and status = 'available'; end if;
  insert into public.loyalty_stamps(member_id, restaurant_id, bill_reference, paid_amount, awarded_by, request_key)
    values(p_member_id, p_restaurant_id, v_reference, p_paid_amount, auth.uid(), p_request_key) returning id into v_stamp_id;
  update public.loyalty_members set progress_expires_at = now() + make_interval(days => v_program.inactivity_days) where id = p_member_id;
  select array_agg(s.id) into v_stamp_ids from (select id from public.loyalty_stamps where member_id = p_member_id and status = 'available' order by created_at, id limit v_program.stamp_target) s;
  if cardinality(v_stamp_ids) = v_program.stamp_target then
    insert into public.loyalty_rewards(member_id, restaurant_id, reward_name, expires_at)
      values(p_member_id, p_restaurant_id, v_program.reward_name, now() + make_interval(days => v_program.reward_valid_days)) returning id into v_reward_id;
    update public.loyalty_stamps set status = 'consumed', reward_id = v_reward_id where id = any(v_stamp_ids);
  end if;
  insert into public.loyalty_activity(restaurant_id, member_id, actor_id, action, reference_id, note)
    values(p_restaurant_id, p_member_id, auth.uid(), 'award', v_stamp_id, v_reference);
  return jsonb_build_object('stamp_id', v_stamp_id, 'reward_id', v_reward_id, 'duplicate', false);
end;
$$;

create or replace function public.loyalty_redeem(p_restaurant_id uuid, p_reward_id uuid, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_reward public.loyalty_rewards; v_member_id uuid;
begin
  if not exists (select 1 from public.restaurants where id = p_restaurant_id and owner_id = auth.uid() and is_active) then raise insufficient_privilege; end if;
  select member_id into v_member_id from public.loyalty_rewards where id = p_reward_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'Reward is no longer available.'; end if;
  -- Always lock member before reward to serialize with awards and reversals.
  perform 1 from public.loyalty_members where id = v_member_id for update;
  select * into v_reward from public.loyalty_rewards where id = p_reward_id for update;
  if p_request_key is null then raise exception 'Invalid request.'; end if;
  if v_reward.redeemed_at is not null and v_reward.redemption_key = p_request_key then return jsonb_build_object('duplicate', true); end if;
  if v_reward.redeemed_at is not null or v_reward.revoked_at is not null or v_reward.expires_at <= now() then raise exception 'Reward is no longer available.'; end if;
  update public.loyalty_rewards set redeemed_at = now(), redeemed_by = auth.uid(), redemption_key = p_request_key where id = p_reward_id;
  insert into public.loyalty_activity(restaurant_id, member_id, actor_id, action, reference_id) values(p_restaurant_id, v_member_id, auth.uid(), 'redeem', p_reward_id);
  return jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.loyalty_reverse(p_restaurant_id uuid, p_stamp_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_stamp public.loyalty_stamps; v_member public.loyalty_members; v_reward public.loyalty_rewards; v_days integer; v_last timestamptz;
begin
  if not exists (select 1 from public.restaurants where id = p_restaurant_id and owner_id = auth.uid()) then raise insufficient_privilege; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 200 then raise exception 'Enter a reason.'; end if;
  select * into v_stamp from public.loyalty_stamps where id = p_stamp_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'Stamp not found.'; end if;
  select * into v_member from public.loyalty_members where id = v_stamp.member_id for update;
  select * into v_stamp from public.loyalty_stamps where id = p_stamp_id for update;
  if v_stamp.status = 'reversed' then return jsonb_build_object('duplicate', true); end if;
  if v_stamp.reward_id is not null then
    select * into v_reward from public.loyalty_rewards where id = v_stamp.reward_id for update;
    if v_reward.redeemed_at is not null then raise exception 'Reward already used; this stamp cannot be reversed.'; end if;
    update public.loyalty_rewards set revoked_at = coalesce(revoked_at, now()) where id = v_reward.id;
    update public.loyalty_stamps set status = case when v_member.progress_expires_at > now() then 'available' else 'expired' end, reward_id = null where reward_id = v_reward.id and status = 'consumed';
  end if;
  update public.loyalty_stamps set status = 'reversed', reversed_at = now() where id = p_stamp_id;
  select inactivity_days into v_days from public.loyalty_programs where restaurant_id = p_restaurant_id;
  select max(created_at) into v_last from public.loyalty_stamps where member_id = v_member.id and status <> 'reversed';
  update public.loyalty_members set progress_expires_at = v_last + make_interval(days => v_days) where id = v_member.id;
  if v_last is null or v_last + make_interval(days => v_days) <= now() then update public.loyalty_stamps set status = 'expired' where member_id = v_member.id and status = 'available'; end if;
  insert into public.loyalty_activity(restaurant_id, member_id, actor_id, action, reference_id, note) values(p_restaurant_id, v_member.id, auth.uid(), 'reverse', p_stamp_id, trim(p_reason));
  return jsonb_build_object('duplicate', false);
end;
$$;

revoke all on function public.loyalty_protect_rules() from public, anon, authenticated;
revoke all on function public.loyalty_first_launch() from public, anon, authenticated;
revoke all on function public.loyalty_join(uuid, text) from public, anon;
revoke all on function public.loyalty_award(uuid, uuid, text, numeric, uuid) from public, anon;
revoke all on function public.loyalty_redeem(uuid, uuid, uuid) from public, anon;
revoke all on function public.loyalty_reverse(uuid, uuid, text) from public, anon;
grant execute on function public.loyalty_join(uuid, text), public.loyalty_award(uuid, uuid, text, numeric, uuid), public.loyalty_redeem(uuid, uuid, uuid), public.loyalty_reverse(uuid, uuid, text) to authenticated;

commit;
