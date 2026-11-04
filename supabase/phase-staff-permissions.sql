-- Apply after order reliability, POS and reporting. If table access is installed,
-- apply its migration after this one. Re-running reliability/POS/reporting restores
-- owner-only helpers; re-run this migration afterwards to restore staff access.
begin;
create table if not exists public.restaurant_team (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check(role in ('waiter','kitchen','cashier','manager')),
  display_name text not null check(length(display_name) between 1 and 100),
  active boolean not null default true, updated_at timestamptz not null default now(),
  primary key(restaurant_id,user_id)
);
create table if not exists public.team_access_events (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  actor_id uuid not null, user_id uuid not null, role text not null, active boolean not null, created_at timestamptz not null default now()
);
alter table public.restaurant_team enable row level security;
alter table public.team_access_events enable row level security;
revoke all on public.restaurant_team,public.team_access_events from anon,authenticated;
grant all on public.restaurant_team,public.team_access_events to service_role;

create or replace function public.team_role(r uuid) returns text language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.restaurants where id=r and owner_id=auth.uid()) then 'owner'
    else (select role from public.restaurant_team where restaurant_id=r and user_id=auth.uid() and active) end
$$;
create or replace function public.team_can(r uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(case public.team_role(r)
    when 'owner' then p=any(array['orders.read','orders.manage','tables.manage','tables.create','kitchen.manage','billing.read','billing.issue','billing.collect','billing.refund','reports.read','reports.close','settings','team'])
    when 'manager' then p=any(array['orders.read','orders.manage','tables.manage','tables.create','kitchen.manage','billing.read','billing.issue','billing.collect','billing.refund','reports.read','reports.close'])
    when 'cashier' then p=any(array['orders.read','orders.manage','tables.manage','billing.read','billing.issue','billing.collect'])
    when 'waiter' then p=any(array['orders.read','orders.manage','tables.manage'])
    when 'kitchen' then p='kitchen.manage' else false end,false)
$$;
create or replace function public.team_require(r uuid,p text) returns void language plpgsql security definer set search_path='' as $$
begin if not public.team_can(r,p) then raise exception 'Restaurant access denied for this action.' using errcode='42501'; end if; end $$;
create or replace function public.team_context() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'currency',r.currency,'role',public.team_role(r.id)) order by r.name),'[]')
 from public.restaurants r where public.team_role(r.id) is not null
$$;
create or replace function public.team_admin(p_restaurant_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; member public.restaurant_team; r uuid:=p_restaurant_id;
begin
  perform public.team_require(r,'team');
  perform pg_advisory_xact_lock(hashtextextended(r::text,0));
  if p_action='grant' then
    if coalesce(p_data->>'role','') not in ('waiter','kitchen','cashier','manager') or length(trim(coalesce(p_data->>'name',''))) not between 1 and 100 then raise exception 'Choose a staff name and role.' using errcode='22023'; end if;
    select id into u from auth.users where lower(email)=lower(trim(p_data->>'email')) and email_confirmed_at is not null;
    if u is null then raise exception 'Ask this staff member to sign in with email OTP first, then grant access to that verified email.' using errcode='22023'; end if;
    if exists(select 1 from public.restaurants where id=r and owner_id=u) then raise exception 'The owner already has full access.' using errcode='22023'; end if;
    insert into public.restaurant_team(restaurant_id,user_id,role,display_name) values(r,u,p_data->>'role',trim(p_data->>'name'))
      on conflict(restaurant_id,user_id) do update set role=excluded.role,display_name=excluded.display_name,active=true,updated_at=now() returning * into member;
  elsif p_action='revoke' then
    update public.restaurant_team set active=false,updated_at=now() where restaurant_id=r and user_id=(p_data->>'user_id')::uuid returning * into member;
    if not found then raise exception 'Staff member not found.' using errcode='P0404'; end if;
  elsif p_action<>'list' then raise exception 'Unknown team action.' using errcode='22023'; end if;
  if p_action<>'list' then insert into public.team_access_events(restaurant_id,actor_id,user_id,role,active) values(r,auth.uid(),member.user_id,member.role,member.active); end if;
  return coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('email',u.email) order by t.display_name) from public.restaurant_team t join auth.users u on u.id=t.user_id where t.restaurant_id=r),'[]');
end $$;

create or replace function public.orders_authorize(r uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform public.team_require(r,'orders.manage'); end $$;
create or replace function public.reporting_authorize(r uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform public.team_require(r,'reports.read'); end $$;
create or replace function public.pos_authorize(r uuid,a text) returns void language plpgsql security definer set search_path='' as $$
begin perform public.team_require(r,case
 when a='state' then 'billing.read' when a in ('preview','issue') then 'billing.issue'
 when a='cash' then 'billing.collect' when a in ('refund','void') then 'billing.refund'
 when a='table_create' then 'tables.create' when a in ('visit_open','visit_assign','visit_transfer','visit_close') then 'tables.manage'
 when a in ('kitchen_send','kitchen_move') then 'kitchen.manage' when a='close_day' then 'reports.close'
 when a='settings' then 'settings' else 'invalid' end); end $$;
create or replace function public.pos_filter_state(r uuid,data jsonb) returns jsonb language sql security definer set search_path='' as $$
 select case when public.team_can(r,'reports.read') then data else data||jsonb_build_object('report','{}'::jsonb) end
$$;

create or replace function public.team_workspace(p_restaurant_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r uuid:=p_restaurant_id; role text:=public.team_role(r); result jsonb;
begin
  if role is null then raise exception 'Restaurant access denied.' using errcode='42501'; end if;
  result:=jsonb_build_object('role',role,'restaurant',(select jsonb_build_object('id',id,'name',name,'currency',currency) from public.restaurants where id=r),
    'settings',(select jsonb_build_object('enabled',enabled,'kitchen_enabled',kitchen_enabled) from public.pos_settings where restaurant_id=r),
    'dishes',case when public.team_can(r,'orders.manage') then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'price',price) order by name) from public.dishes where restaurant_id=r and is_available),'[]') else '[]'::jsonb end,
    'orders',case when public.team_can(r,'orders.read') then coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at desc) from (
      select o.id,o.order_number,o.customer_name,o.customer_note,o.status,o.version,o.currency,o.total,o.created_at,bo.bill_id,vo.visit_id,
      coalesce((select jsonb_agg(jsonb_build_object('dish_name',i.dish_name,'name',i.dish_name,'quantity',i.quantity,'line_total',i.line_total)) from public.order_items i where i.order_id=o.id),'[]') order_items,
      coalesce((select jsonb_agg(jsonb_build_object('name',i.dish_name,'quantity',i.quantity)) from public.order_items i where i.order_id=o.id),'[]') items
      from public.orders o left join public.pos_bill_orders bo on bo.order_id=o.id and bo.active left join public.pos_visit_orders vo on vo.order_id=o.id where o.restaurant_id=r order by o.created_at desc limit 100) z),'[]') else '[]'::jsonb end,
    'tables',case when public.team_can(r,'tables.manage') then coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'seats',t.seats,'visit',(select jsonb_build_object('id',v.id,'guest_name',v.guest_name,'opened_at',v.opened_at) from public.pos_visits v where v.table_id=t.id and v.closed_at is null)) order by t.name) from public.pos_tables t where t.restaurant_id=r),'[]') else '[]'::jsonb end,
    'kitchen',case when public.team_can(r,'kitchen.manage') then coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at) from (select k.id,k.order_id,k.state,k.version,k.lines,k.created_at,o.order_number,o.customer_name,o.customer_note from public.pos_kitchen k join public.orders o on o.id=k.order_id where k.restaurant_id=r and (k.state not in ('served','cancelled') or k.updated_at>now()-interval '2 hours') order by k.created_at desc limit 200) z),'[]') else '[]'::jsonb end);
  return result;
end $$;
create or replace function public.team_order(p_restaurant_id uuid,p_key uuid,p_name text,p_note text,p_items jsonb,p_visit_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid:=p_restaurant_id; slug text; result jsonb; oid uuid; linked uuid;
begin
  perform public.team_require(r,'orders.manage');
  perform pg_advisory_xact_lock(hashtextextended(r::text,0));
  if p_visit_id is not null and not exists(select 1 from public.pos_visits where id=p_visit_id and restaurant_id=r and closed_at is null) then raise exception 'Visit is no longer open.' using errcode='22023'; end if;
  select restaurants.slug into slug from public.restaurants where id=r;
  result:=public.orders_submit_internal(slug,p_key,p_name,'',p_note,p_items,true);
  select id into oid from public.orders where restaurant_id=r and idempotency_key=p_key;
  select visit_id into linked from public.pos_visit_orders where order_id=oid;
  if coalesce((result->>'duplicate')::boolean,false) then
    if linked is distinct from p_visit_id then raise exception 'Retry belongs to a different table visit.' using errcode='23505'; end if;
  elsif p_visit_id is not null then insert into public.pos_visit_orders(order_id,visit_id,restaurant_id) values(oid,p_visit_id,r); end if;
  return result;
end $$;
create or replace function public.pos_refund_payment(p_restaurant_id uuid,p_payment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.team_require(p_restaurant_id,'billing.refund');
 return (select jsonb_build_object('method',method,'account_key_id',account_key_id) from public.pos_payments where restaurant_id=p_restaurant_id and id=p_payment_id); end $$;

-- All helpers stay private. Only these checked entry points are callable by sessions.
revoke all on function public.team_role(uuid),public.team_can(uuid,text),public.team_require(uuid,text),public.orders_authorize(uuid),public.reporting_authorize(uuid),public.pos_authorize(uuid,text),public.pos_filter_state(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.team_context(),public.team_admin(uuid,text,jsonb),public.team_workspace(uuid),public.team_order(uuid,uuid,text,text,jsonb,uuid),public.pos_refund_payment(uuid,uuid) from public,anon;
grant execute on function public.team_context(),public.team_admin(uuid,text,jsonb),public.team_workspace(uuid),public.team_order(uuid,uuid,text,text,jsonb,uuid),public.pos_refund_payment(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
