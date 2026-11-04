-- Apply after phase-9-analytics-orders.sql. Safe to re-run.
begin;
alter table public.orders add column if not exists version integer not null default 0;
alter table public.orders add column if not exists request_fingerprint text;
alter table public.orders add column if not exists order_source text not null default 'phone' check(order_source in ('phone','staff'));
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  order_id uuid not null references public.orders(id), actor_id uuid, previous_status text not null, status text not null, reason text not null default '', created_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
revoke all on public.order_events from anon,authenticated;
grant select on public.order_events to authenticated;
grant all on public.order_events to service_role;
drop policy if exists order_event_owner_read on public.order_events;
create policy order_event_owner_read on public.order_events for select to authenticated using(exists(select 1 from public.restaurants where id=restaurant_id and owner_id=auth.uid()));

-- Fail closed for verified outlets even if this migration is re-run before the
-- table-access migration restores its full session validator.
create or replace function public.orders_public_authorize(r uuid,s uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(r::text,0));
  if exists(select 1 from public.restaurants x where x.id=r and coalesce((to_jsonb(x)->>'table_verification_required')::boolean,false)) then
    raise exception 'Ask your waiter to approve this phone before ordering.' using errcode='42501';
  end if;
end $$;
create or replace function public.orders_submit_internal(p_slug text,p_key uuid,p_name text,p_phone text,p_note text,p_items jsonb,p_staff boolean,p_guest_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare restaurant public.restaurants; existing public.orders; created public.orders; canonical jsonb; fingerprint text; item_count integer; total numeric; rows_json jsonb;
begin
  if p_key is null or length(trim(p_name)) not between 2 and 100 or length(coalesce(p_phone,''))>30 or length(coalesce(p_note,''))>500
    or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Invalid order details.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'dishId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(i->'quantity') is distinct from 'number' or coalesce(i->>'quantity','') !~ '^[0-9]+$' or (i->>'quantity')::numeric not between 1 and 99) then raise exception 'Invalid order item.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('dishId',dish,'quantity',qty) order by dish),count(*) into canonical,item_count from
    (select (i->>'dishId')::uuid dish,sum((i->>'quantity')::integer) qty from jsonb_array_elements(p_items) i group by (i->>'dishId')::uuid) q;
  if exists(select 1 from jsonb_array_elements(canonical) i where (i->>'quantity')::integer>99) then raise exception 'Too many of the same dish.' using errcode='22023'; end if;
  select * into restaurant from public.restaurants where slug=p_slug and is_active;
  if not found then raise exception 'Restaurant is not accepting orders.' using errcode='P0404'; end if;
  if p_staff then perform public.orders_authorize(restaurant.id); end if;
  if not p_staff then perform public.orders_public_authorize(restaurant.id,p_guest_session); end if;
  perform pg_advisory_xact_lock(hashtextextended(restaurant.id::text||p_key::text,0));
  fingerprint:=md5(jsonb_build_object('name',trim(p_name),'phone',coalesce(p_phone,''),'note',coalesce(p_note,''),'items',canonical,'source',case when p_staff then 'staff' else 'phone' end)::text);
  select * into existing from public.orders where restaurant_id=restaurant.id and idempotency_key=p_key;
  if found then
    if existing.request_fingerprint is not null and existing.request_fingerprint<>fingerprint then raise exception 'This request key belongs to a different order.' using errcode='23505'; end if;
    return jsonb_build_object('public_token',existing.public_token,'order_number',existing.order_number,'duplicate',true);
  end if;
  if not p_staff and restaurant.menu_mode<>'ordering' then raise exception 'This restaurant takes orders verbally. Please order with a staff member.' using errcode='42501'; end if;
  -- Prices, availability and snapshots are taken together under row locks.
  perform 1 from public.dishes d join jsonb_array_elements(canonical) i on d.id=(i->>'dishId')::uuid where d.restaurant_id=restaurant.id order by d.id for share of d;
  select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'price',d.price,'quantity',(i->>'quantity')::integer)),sum(round(d.price*(i->>'quantity')::integer,2))
    into rows_json,total from public.dishes d join jsonb_array_elements(canonical) i on d.id=(i->>'dishId')::uuid
    where d.restaurant_id=restaurant.id and d.is_available and d.price is not null and d.price>=0;
  if jsonb_array_length(coalesce(rows_json,'[]'))<>item_count then raise exception 'One or more dishes are no longer available.' using errcode='P0409'; end if;
  insert into public.orders(restaurant_id,idempotency_key,request_fingerprint,order_source,customer_name,customer_phone,customer_note,currency,subtotal,total)
    values(restaurant.id,p_key,fingerprint,case when p_staff then 'staff' else 'phone' end,trim(p_name),nullif(p_phone,''),nullif(p_note,''),restaurant.currency,total,total) returning * into created;
  insert into public.order_items(order_id,restaurant_id,dish_id,dish_name,unit_price,quantity,line_total)
    select created.id,restaurant.id,(i->>'id')::uuid,i->>'name',(i->>'price')::numeric,(i->>'quantity')::integer,round((i->>'price')::numeric*(i->>'quantity')::integer,2) from jsonb_array_elements(rows_json) i;
  return jsonb_build_object('public_token',created.public_token,'order_number',created.order_number,'duplicate',false);
end $$;
-- Keep the existing private signature for staff ordering and older callers.
create or replace function public.orders_submit_internal(p_slug text,p_key uuid,p_name text,p_phone text,p_note text,p_items jsonb,p_staff boolean)
returns jsonb language sql security definer set search_path='' as $$ select public.orders_submit_internal(p_slug,p_key,p_name,p_phone,p_note,p_items,p_staff,null) $$;
create or replace function public.orders_submit(p_slug text,p_key uuid,p_name text,p_phone text,p_note text,p_items jsonb)
returns jsonb language sql security definer set search_path='' as $$ select public.orders_submit_internal(p_slug,p_key,p_name,p_phone,p_note,p_items,false) $$;

create or replace function public.orders_authorize(r uuid) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.restaurants where id=r and owner_id=auth.uid()) then raise exception 'Restaurant access denied.' using errcode='42501'; end if; end $$;
create or replace function public.orders_change(p_restaurant_id uuid,p_order_id uuid,p_version integer,p_status text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; allowed boolean; previous text;
begin
  perform public.orders_authorize(p_restaurant_id);
  select * into o from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if not found then raise exception 'Order not found.' using errcode='P0404'; end if;
  if o.status=p_status then return to_jsonb(o)||jsonb_build_object('order_items',(select coalesce(jsonb_agg(i),'[]') from public.order_items i where order_id=o.id)); end if;
  if p_version is null or o.version<>p_version then raise exception 'This order changed. Refresh and try again.' using errcode='40001'; end if;
  allowed:=case o.status when 'pending' then p_status in ('confirmed','cancelled') when 'confirmed' then p_status in ('preparing','cancelled') when 'preparing' then p_status in ('ready','cancelled') when 'ready' then p_status in ('completed','cancelled') else false end;
  if not coalesce(allowed,false) then raise exception 'That order status transition is not allowed.' using errcode='22023'; end if;
  if p_status='cancelled' and length(trim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Enter a cancellation reason.' using errcode='22023'; end if;
  previous:=o.status;
  update public.orders set status=p_status,version=version+1,updated_at=now() where id=o.id returning * into o;
  insert into public.order_events(restaurant_id,order_id,actor_id,previous_status,status,reason) values(p_restaurant_id,o.id,auth.uid(),previous,p_status,coalesce(p_reason,''));
  return to_jsonb(o)||jsonb_build_object('order_items',(select coalesce(jsonb_agg(i),'[]') from public.order_items i where order_id=o.id));
end $$;
revoke all on function public.orders_submit(text,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.orders_submit_internal(text,uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.orders_submit_internal(text,uuid,text,text,text,jsonb,boolean,uuid),public.orders_public_authorize(uuid,uuid) from public,anon,authenticated;
revoke all on function public.orders_authorize(uuid) from public,anon,authenticated;
grant execute on function public.orders_submit(text,uuid,text,text,text,jsonb) to service_role;
revoke all on function public.orders_change(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.orders_change(uuid,uuid,integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
