-- Apply after the UPDATED phase-order-reliability.sql, POS, reporting and staff
-- permissions migrations. Re-run this file last. Safe to re-run; opt-in only.
begin;
do $$ begin
 if to_regprocedure('public.orders_submit_internal(text,uuid,text,text,text,jsonb,boolean,uuid)') is null then raise exception 'Apply the updated order reliability migration first.'; end if;
end $$;
alter table public.restaurants add column if not exists table_verification_required boolean not null default false;
alter table public.pos_tables add column if not exists scan_token uuid not null default gen_random_uuid();
create unique index if not exists pos_table_scan_token on public.pos_tables(scan_token);

create table if not exists public.table_guest_sessions (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 table_id uuid not null, visit_id uuid, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 code text check(code ~ '^[0-9]{4}$'), code_expires_at timestamptz not null, code_reuse_after timestamptz not null,
 state text not null default 'pending' check(state in ('pending','approved','revoked')),
 created_at timestamptz not null default now(), approved_at timestamptz, approved_by uuid, expires_at timestamptz,
 foreign key(table_id,restaurant_id) references public.pos_tables(id,restaurant_id),
 foreign key(visit_id,restaurant_id) references public.pos_visits(id,restaurant_id),
 unique(restaurant_id,code)
);
create index if not exists table_guest_visit on public.table_guest_sessions(visit_id) where state='approved';
create index if not exists table_guest_pending on public.table_guest_sessions(restaurant_id,table_id,code_expires_at) where state='pending';
create table if not exists public.table_guest_orders (
 order_id uuid primary key references public.orders(id), session_id uuid not null references public.table_guest_sessions(id)
);
create table if not exists public.table_access_limits (
 key text primary key check(length(key)<=240), count integer not null, reset_at timestamptz not null
);
create index if not exists table_access_limit_expiry on public.table_access_limits(reset_at);
create table if not exists public.table_access_events (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 actor_id uuid, session_id uuid references public.table_guest_sessions(id), action text not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['table_guest_sessions','table_guest_orders','table_access_limits','table_access_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

-- Atomic fixed-window budgets, shared by every application replica. A denied
-- attempt returns a value rather than raising, so failed attempts remain counted.
create or replace function public.table_access_take(k text,n integer,w integer) returns integer language plpgsql security definer set search_path='' as $$
declare entry public.table_access_limits; checked_at timestamptz:=clock_timestamp();
begin
 delete from public.table_access_limits where key in (select key from public.table_access_limits where reset_at<checked_at-interval '1 day' limit 100);
 insert into public.table_access_limits(key,count,reset_at) values(k,1,checked_at+make_interval(secs=>w))
 on conflict(key) do update set count=case when table_access_limits.reset_at<=checked_at then 1 else least(table_access_limits.count+1,n+1) end,
 reset_at=case when table_access_limits.reset_at<=checked_at then checked_at+make_interval(secs=>w) else table_access_limits.reset_at end returning * into entry;
 return case when entry.count<=n then 0 else greatest(1,ceil(extract(epoch from entry.reset_at-checked_at))::integer) end;
end $$;
create or replace function public.table_access_error(message text,status integer,retry integer default 0) returns jsonb language sql immutable as $$
 select jsonb_build_object('error',message,'http_status',status,'retry_after',retry)
$$;
create or replace function public.table_access_session_data(s public.table_guest_sessions) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',case
   when s.id is null then 'scan_required'
   when s.state='revoked' then 'revoked'
   when not exists(select 1 from public.restaurants where id=s.restaurant_id and is_active and table_verification_required and menu_mode='ordering') then 'unavailable'
   when s.state='pending' and s.code_expires_at<=now() then 'expired'
   when s.state='approved' and (s.expires_at<=now() or not exists(select 1 from public.pos_visits where id=s.visit_id and closed_at is null and table_id=s.table_id)) then 'expired'
   else s.state end,
 'code',case when s.state='pending' and s.code_expires_at>now() then s.code else null end,
 'expires_at',case when s.state='pending' then s.code_expires_at else s.expires_at end,
 'reference',s.id,'table_name',(select name from public.pos_tables where id=s.table_id));
$$;

-- Only the server can issue/status-check a browser session. The four-digit code
-- is an in-person lookup, never a public login credential or order bearer token.
create or replace function public.table_access_guest(p_slug text,p_action text,p_scan uuid,p_hash text,p_new_hash text,p_ip text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.restaurants; t public.pos_tables; s public.table_guest_sessions; existing public.table_guest_sessions; retry integer; candidate text; attempts integer:=0; result jsonb;
begin
 if coalesce(p_ip,'') !~ '^[a-f0-9]{64}$' or (p_hash is not null and p_hash !~ '^[a-f0-9]{64}$') then return public.table_access_error('Invalid session request.',400); end if;
 retry:=public.table_access_take('guest-http:'||p_ip,2400,60);
 if retry>0 then return public.table_access_error('Too many requests. Try again shortly.',429,retry); end if;
 select * into r from public.restaurants where slug=p_slug and is_active;
 if not found then return public.table_access_error('Restaurant unavailable.',404); end if;
 if not r.table_verification_required or r.menu_mode<>'ordering' then return jsonb_build_object('state','unavailable'); end if;
 if p_action='status' then
  retry:=public.table_access_take('poll:'||coalesce(p_hash,p_ip),24,60);
  if retry>0 then return public.table_access_error('Please wait before refreshing.',429,retry); end if;
  select * into s from public.table_guest_sessions where restaurant_id=r.id and token_hash=p_hash;
  return public.table_access_session_data(s);
 elsif p_action<>'issue' or p_new_hash is null or p_new_hash !~ '^[a-f0-9]{64}$' then return public.table_access_error('Invalid scan request.',400); end if;
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
 select * into t from public.pos_tables where restaurant_id=r.id and scan_token=p_scan;
 if not found then return public.table_access_error('Scan the QR code at your table.',404); end if;
 select * into existing from public.table_guest_sessions where restaurant_id=r.id and token_hash=p_hash and table_id=t.id;
 result:=public.table_access_session_data(existing);
 if result->>'state' in ('pending','approved') then return result||jsonb_build_object('reuse_cookie',true); end if;
 -- Deterministic server token makes concurrent/lost scan retries idempotent.
 select * into s from public.table_guest_sessions where token_hash=p_new_hash;
 if found then
  if s.restaurant_id<>r.id or s.table_id<>t.id then return public.table_access_error('Invalid scan request.',400); end if;
  if s.state='approved' then return public.table_access_error('Scan again to request fresh approval.',409); end if;
  result:=public.table_access_session_data(s);
  if result->>'state'='pending' then return result; end if;
  return public.table_access_error('This code expired. Request a new code.',410);
 end if;
 retry:=public.table_access_take('scan-ip:'||p_ip,200,600);
 if retry>0 then return public.table_access_error('Too many scan requests. Please ask a staff member.',429,retry); end if;
 retry:=public.table_access_take('scan-table:'||t.id::text,greatest(12,t.seats*3),300);
 if retry>0 then return public.table_access_error('This table has too many pending scans. Please ask a staff member.',429,retry); end if;
 if (select count(*) from public.table_guest_sessions where restaurant_id=r.id and state='pending' and code_expires_at>now())>=500 then return public.table_access_error('Too many pending scans. Please ask a staff member.',429,300); end if;
 update public.table_guest_sessions set code=null where restaurant_id=r.id and code_reuse_after<=now() and code is not null;
 delete from public.table_guest_sessions where id in (select id from public.table_guest_sessions where restaurant_id=r.id and state='pending' and code_reuse_after<now()-interval '1 day' limit 100);
 loop
  -- UUID entropy comes from PostgreSQL's cryptographic UUID generator.
  candidate:=((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,7))::bit(28)::integer %9000)+1000)::text;
  exit when not exists(select 1 from public.table_guest_sessions where restaurant_id=r.id and code=candidate);
  attempts:=attempts+1;
  if attempts>100 then return public.table_access_error('Unable to prepare a code. Try again shortly.',503); end if;
 end loop;
 insert into public.table_guest_sessions(restaurant_id,table_id,visit_id,token_hash,code,code_expires_at,code_reuse_after)
 values(r.id,t.id,(select id from public.pos_visits where table_id=t.id and closed_at is null),p_new_hash,candidate,now()+interval '5 minutes',now()+interval '30 minutes') returning * into s;
 -- A deliberate scan of another table replaces this browser's previous access.
 update public.table_guest_sessions set state='revoked' where restaurant_id=r.id and token_hash=p_hash and id<>s.id and state<>'revoked';
 return public.table_access_session_data(s);
end $$;

create or replace function public.table_access_staff(p_restaurant_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid:=p_restaurant_id; s public.table_guest_sessions; v public.pos_visits; retry integer; enabled boolean;
begin
 perform public.team_require(r,case when p_action='settings' then 'settings' else 'tables.manage' end);
 retry:=public.table_access_take('staff-http:'||auth.uid()::text,120,60);
 if retry>0 then return public.table_access_error('Too many staff requests. Try again shortly.',429,retry); end if;
 perform pg_advisory_xact_lock(hashtextextended(r::text,0));
 select table_verification_required into enabled from public.restaurants where id=r;
 if p_action='settings' then
  if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then return public.table_access_error('Choose a valid verification setting.',400); end if;
  if (p_data->>'enabled')::boolean and (not exists(select 1 from public.pos_tables where restaurant_id=r) or not exists(select 1 from public.restaurants where id=r and menu_mode='ordering')) then return public.table_access_error('Enable phone ordering and add a table before enabling waiter verification.',409); end if;
  if enabled is distinct from (p_data->>'enabled')::boolean then
   update public.restaurants set table_verification_required=(p_data->>'enabled')::boolean where id=r;
   update public.table_guest_sessions set state='revoked' where restaurant_id=r and state<>'revoked';
   insert into public.table_access_events(restaurant_id,actor_id,action) values(r,auth.uid(),'settings.changed');
  end if;
  return jsonb_build_object('saved',true);
 elsif p_action='state' then
  return jsonb_build_object('enabled',enabled,'can_configure',public.team_can(r,'settings'),'slug',(select slug from public.restaurants where id=r),
   'tables',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'scan_token',t.scan_token,'visit_id',(select id from public.pos_visits where table_id=t.id and closed_at is null),
    'approved',coalesce((select jsonb_agg(jsonb_build_object('id',gs.id,'approved_at',gs.approved_at,'expires_at',gs.expires_at)) from public.table_guest_sessions gs join public.pos_visits live_visit on live_visit.id=gs.visit_id where gs.table_id=t.id and gs.state='approved' and gs.expires_at>now() and live_visit.closed_at is null),'[]')) order by t.name) from public.pos_tables t where t.restaurant_id=r),'[]'));
 elsif p_action in ('find','approve') then
  if not enabled then return public.table_access_error('Waiter verification is switched off.',409); end if;
  retry:=public.table_access_take('staff-find:'||r::text||auth.uid()::text,60,60);
  if retry>0 then return public.table_access_error('Too many code lookups. Try again shortly.',429,retry); end if;
  -- Check the failure budget without clearing it on successful lookups.
  if exists(select 1 from public.table_access_limits where key='staff-miss:'||r::text||auth.uid()::text and count>8 and reset_at>clock_timestamp()) then
   return public.table_access_error('Too many incorrect codes. Try again in a few minutes.',429,300);
  end if;
  select * into s from public.table_guest_sessions where restaurant_id=r and code=p_data->>'code' and state in ('pending','approved') and code_expires_at>now();
  if not found or (p_action='approve' and (s.id is distinct from (p_data->>'session_id')::uuid)) then
   retry:=public.table_access_take('staff-miss:'||r::text||auth.uid()::text,8,300);
   return public.table_access_error(case when retry>0 then 'Too many incorrect codes. Try again in a few minutes.' else 'Code unavailable. Check the code shown on the guest phone.' end,case when retry>0 then 429 else 404 end,retry);
  end if;
  select * into v from public.pos_visits where table_id=s.table_id and restaurant_id=r and closed_at is null;
  if p_action='find' then return jsonb_build_object('session_id',s.id,'state',s.state,'table_name',(select name from public.pos_tables where id=s.table_id),'visit_id',v.id,'code_expires_at',s.code_expires_at); end if;
  if v.id is null or v.id is distinct from (p_data->>'visit_id')::uuid then return public.table_access_error('Seat the guests at this table, then look up the code again.',409); end if;
  if s.visit_id is not null and s.visit_id<>v.id then return public.table_access_error('This code belongs to a previous visit. Ask the guest to scan again.',409); end if;
  if s.state='approved' then
   if s.visit_id=v.id and s.expires_at>now() then return jsonb_build_object('approved',true); end if;
   return public.table_access_error('This phone needs a fresh scan.',409);
  end if;
  if (select count(*) from public.table_guest_sessions where visit_id=v.id and state='approved' and expires_at>now())>=40 then return public.table_access_error('This table visit already has the maximum approved phones.',409); end if;
  update public.table_guest_sessions set state='approved',visit_id=v.id,approved_by=auth.uid(),approved_at=now(),expires_at=now()+interval '8 hours' where id=s.id;
  insert into public.table_access_events(restaurant_id,actor_id,session_id,action) values(r,auth.uid(),s.id,'phone.approved');
  return jsonb_build_object('approved',true);
 elsif p_action='revoke' then
  update public.table_guest_sessions set state='revoked' where restaurant_id=r and id=(p_data->>'session_id')::uuid and state<>'revoked' returning * into s;
  if found then insert into public.table_access_events(restaurant_id,actor_id,session_id,action) values(r,auth.uid(),s.id,'phone.revoked'); end if;
  return jsonb_build_object('revoked',true);
 else return public.table_access_error('Unknown table access action.',400); end if;
end $$;

create or replace function public.orders_public_authorize(r uuid,s uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(r::text,0));
 if not exists(select 1 from public.restaurants where id=r and table_verification_required) and s is null then return; end if;
 if not exists(select 1 from public.table_guest_sessions g join public.pos_visits v on v.id=g.visit_id where g.id=s and g.restaurant_id=r and g.state='approved' and g.expires_at>now() and v.closed_at is null and v.table_id=g.table_id) then
  raise exception 'Ask your waiter to approve this phone before ordering.' using errcode='42501';
 end if;
end $$;
drop function if exists public.orders_submit_table(text,uuid,text,text,text,jsonb,text,text);
create or replace function public.orders_submit_table(p_slug text,p_key uuid,p_name text,p_phone text,p_note text,p_items jsonb,p_hash text,p_ip text,p_scan uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.restaurants; s public.table_guest_sessions; result jsonb; retry integer; oid uuid; old_session uuid; is_retry boolean;
begin
 if coalesce(p_ip,'') !~ '^[a-f0-9]{64}$' then return public.table_access_error('Invalid order request.',400); end if;
 retry:=public.table_access_take('order-ip:'||p_ip,300,60);
 if retry>0 then return public.table_access_error('Too many orders. Try again shortly.',429,retry); end if;
 select * into r from public.restaurants where slug=p_slug and is_active;
 if not found then return public.table_access_error('Restaurant unavailable.',404); end if;
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
 if r.table_verification_required then
  select * into s from public.table_guest_sessions where restaurant_id=r.id and token_hash=p_hash;
  if s.id is null then return public.table_access_error('Ask your waiter to approve this phone before ordering.',403); end if;
  if p_scan is not null and not exists(select 1 from public.pos_tables where id=s.table_id and scan_token=p_scan) then return public.table_access_error('This phone is approved for another table. Scan again and ask your waiter.',403); end if;
  retry:=public.table_access_take('order-phone:'||s.id::text,6,60);
  if retry=0 then retry:=public.table_access_take('order-hour:'||s.id::text,30,3600); end if;
  if retry>0 then return public.table_access_error('Too many orders from this phone. Please wait or ask your waiter.',429,retry); end if;
 end if;
 -- A subtransaction rolls back every order/item/ticket/visit write on error,
 -- while the outer transaction commits rate counters, including failed orders.
 begin
  perform public.orders_public_authorize(r.id,s.id);
  if s.id is not null then
   select o.id,g.session_id into oid,old_session from public.orders o left join public.table_guest_orders g on g.order_id=o.id where o.restaurant_id=r.id and o.idempotency_key=p_key;
   is_retry:=oid is not null;
   if is_retry and old_session is distinct from s.id then raise exception 'Request key belongs to another phone.' using errcode='23505'; end if;
   if not is_retry and exists(select 1 from public.pos_visit_orders vo join public.pos_bill_orders bo on bo.order_id=vo.order_id and bo.active where vo.visit_id=s.visit_id) then raise exception 'This table bill has been issued. Please ask your waiter before adding items.' using errcode='P0409'; end if;
   if not is_retry then
    retry:=public.table_access_take('order-table:'||s.visit_id::text,20,60);
    if retry>0 then return public.table_access_error('Too many orders at this table. Please wait.',429,retry); end if;
   end if;
  end if;
  result:=public.orders_submit_internal(p_slug,p_key,p_name,p_phone,p_note,p_items,false,s.id);
  if s.id is not null and not (result->>'duplicate')::boolean then
   select id into oid from public.orders where restaurant_id=r.id and idempotency_key=p_key;
   insert into public.pos_visit_orders(order_id,visit_id,restaurant_id) values(oid,s.visit_id,r.id);
   insert into public.table_guest_orders(order_id,session_id) values(oid,s.id);
  end if;
  return result;
 exception when others then
  return public.table_access_error(case when sqlstate in ('42501','22023','P0404','P0409','23505') then sqlerrm else 'Ordering is temporarily unavailable. Refresh and try again.' end,
    case when sqlstate='42501' then 403 when sqlstate='22023' then 400 when sqlstate='P0404' then 404 when sqlstate in ('P0409','23505') then 409 else 503 end);
 end;
end $$;
create or replace function public.table_access_close_visit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.table_guest_sessions set state='revoked' where state<>'revoked' and (visit_id=new.id or (state='pending' and table_id=old.table_id));
 return new;
end $$;
drop trigger if exists table_access_on_visit_close on public.pos_visits;
create trigger table_access_on_visit_close after update of closed_at,table_id on public.pos_visits for each row when((old.closed_at is null and new.closed_at is not null) or old.table_id is distinct from new.table_id) execute function public.table_access_close_visit();

revoke all on function public.table_access_take(text,integer,integer),public.table_access_error(text,integer,integer),public.table_access_session_data(public.table_guest_sessions),public.table_access_guest(text,text,uuid,text,text,text),public.table_access_staff(uuid,text,jsonb),public.orders_submit_table(text,uuid,text,text,text,jsonb,text,text,uuid),public.table_access_close_visit(),public.orders_public_authorize(uuid,uuid) from public,anon,authenticated;
grant execute on function public.table_access_guest(text,text,uuid,text,text,text),public.orders_submit_table(text,uuid,text,text,text,jsonb,text,text,uuid) to service_role;
grant execute on function public.table_access_staff(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
