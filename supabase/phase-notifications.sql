-- Apply AFTER order reliability, POS, staff permissions, table access and (if
-- used) employee management. Re-runnable; never backfills historical alerts.
begin;

create table if not exists public.notification_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  reminders_enabled boolean not null default true,
  first_seconds integer not null default 120 check(first_seconds between 30 and 3600),
  escalation_seconds integer not null default 300 check(escalation_seconds between 60 and 7200),
  repeat_seconds integer not null default 300 check(repeat_seconds between 60 and 7200),
  max_repeats integer not null default 2 check(max_repeats between 0 and 5),
  feedback_threshold integer not null default 2 check(feedback_threshold between 1 and 4),
  check(escalation_seconds>first_seconds)
);
create table if not exists public.notification_preferences (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sound_enabled boolean not null default false, volume numeric not null default .35 check(volume between 0 and 1),
  push_enabled boolean not null default false,
  categories text[] not null default array['orders','kitchen','inventory','staff','feedback','billing'],
  primary key(restaurant_id,user_id),
  check(categories <@ array['orders','kitchen','inventory','staff','feedback','billing']::text[])
);
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid, type text not null, schema_version integer not null default 1,
  actor_id uuid, resource_kind text not null, resource_id uuid not null,
  severity text not null check(severity in ('info','warning','urgent')), category text not null,
  metadata jsonb not null default '{}', recipients uuid[] not null,
  dedupe_key text not null, created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz, attempts integer not null default 0,
  available_at timestamptz not null default now(), last_error text,
  unique(restaurant_id,dedupe_key)
);
create index if not exists notification_outbox_due on public.notification_events(available_at,restaurant_id) where processed_at is null;
create index if not exists notification_event_retention on public.notification_events(processed_at) where processed_at is not null;
create table if not exists public.notification_inbox (
  id uuid primary key default gen_random_uuid(), seq bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz, created_at timestamptz not null default clock_timestamp(), unique(event_id,user_id)
);
create index if not exists notification_feed_idx on public.notification_inbox(user_id,restaurant_id,seq desc);
create index if not exists notification_unread_idx on public.notification_inbox(user_id,restaurant_id,seq desc) where read_at is null;
-- Only opaque invalidation signals are published. Event contents never travel
-- through an unfiltered restaurant broadcast.
create table if not exists public.notification_signals (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  revision bigint not null default 1, primary key(user_id,restaurant_id)
);
create table if not exists public.notification_reminders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  stage integer not null default 0, next_at timestamptz not null, last_sent_at timestamptz
);
create index if not exists notification_reminders_due on public.notification_reminders(next_at);
create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth_key text not null,
  device_id uuid not null, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  unique(user_id,device_id)
);
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(), inbox_id uuid not null references public.notification_inbox(id) on delete cascade,
  subscription_id uuid references public.notification_push_subscriptions(id) on delete set null,
  state text not null default 'pending' check(state in ('pending','sending','sent','skipped','failed','expired')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease uuid, lease_until timestamptz, last_error text, delivered_at timestamptz,
  unique(inbox_id,subscription_id)
);
create index if not exists notification_delivery_due on public.notification_deliveries(available_at) where state in ('pending','sending');

-- Authorization is evaluated again at read, link-open and delivery time. HR,
-- inventory and feedback are owner-only in the existing business application.
create or replace function public.notification_role(r uuid,u uuid) returns text language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.restaurants where id=r and owner_id=u) then 'owner'
    else (select role from public.restaurant_team where restaurant_id=r and user_id=u and active) end
$$;
create or replace function public.notification_signal_access(r uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.notification_role(r,auth.uid()) is not null
$$;
create or replace function public.notification_allowed(r uuid,t text,u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(case
    when t in ('order.new','order.reminder','order.ready') then public.notification_role(r,u) in ('owner','manager','cashier','waiter')
    when t in ('kitchen.new','kitchen.changed') then public.notification_role(r,u) in ('owner','manager','kitchen')
    when t in ('order.cancelled','kitchen.cancelled') then public.notification_role(r,u) in ('owner','manager','cashier','waiter','kitchen')
    when t in ('order.escalation','refund.failed','payment.discrepancy','cash.discrepancy') then public.notification_role(r,u) in ('owner','manager')
    when t in ('inventory.low','leave.new','feedback.poor') then public.notification_role(r,u)='owner'
    else false end,false)
$$;
create or replace function public.notification_signal(r uuid,u uuid) returns void language sql security definer set search_path='' as $$
  insert into public.notification_signals(restaurant_id,user_id) values(r,u)
    on conflict(user_id,restaurant_id) do update set revision=notification_signals.revision+1
$$;
create or replace function public.notification_enqueue(r uuid,t text,k text,x uuid,d text,m jsonb default '{}',branch uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare audience uuid[]; eid uuid; u uuid;
begin
  select coalesce(array_agg(distinct a.id),'{}') into audience from (
    select owner_id id from public.restaurants where id=r union select user_id from public.restaurant_team where restaurant_id=r and active
  ) a where public.notification_allowed(r,t,a.id);
  insert into public.notification_events(restaurant_id,branch_id,type,actor_id,resource_kind,resource_id,severity,category,metadata,recipients,dedupe_key)
    values(r,branch,t,auth.uid(),k,x,case when t in ('order.escalation','refund.failed','payment.discrepancy','cash.discrepancy') then 'urgent' when t in ('order.reminder','order.cancelled','kitchen.cancelled','inventory.low','feedback.poor') then 'warning' else 'info' end,
      case split_part(t,'.',1) when 'order' then 'orders' when 'refund' then 'billing' when 'payment' then 'billing' when 'cash' then 'billing' when 'leave' then 'staff' else split_part(t,'.',1) end,m,audience,d)
    on conflict(restaurant_id,dedupe_key) do nothing returning id into eid;
  if eid is not null then foreach u in array audience loop perform public.notification_signal(r,u); end loop; end if;
end $$;

create or replace function public.notification_actionable(e public.notification_events) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if e.type in ('order.new','order.reminder','order.escalation') then
    return exists(select 1 from public.orders o where o.id=e.resource_id and o.restaurant_id=e.restaurant_id and o.status='pending'
      and not exists(select 1 from public.pos_kitchen k where k.order_id=o.id and k.state in ('served','cancelled')));
  elsif e.type='order.ready' then
    return exists(select 1 from public.orders o where o.id=e.resource_id and o.restaurant_id=e.restaurant_id and o.status not in ('completed','cancelled')
      and case when exists(select 1 from public.pos_kitchen k where k.order_id=o.id) then exists(select 1 from public.pos_kitchen k where k.order_id=o.id and k.state='ready') else o.status='ready' end);
  elsif e.type in ('kitchen.new','kitchen.changed') then return exists(select 1 from public.pos_kitchen where order_id=e.resource_id and restaurant_id=e.restaurant_id and state in ('queued','preparing','ready'));
  elsif e.type='inventory.low' then return exists(select 1 from public.ingredients where id=e.resource_id and restaurant_id=e.restaurant_id and is_active and quantity<=low_stock_threshold);
  elsif e.type='leave.new' then return exists(select 1 from public.leave_requests where id=e.resource_id and restaurant_id=e.restaurant_id and status='pending');
  elsif e.type='feedback.poor' then return exists(select 1 from public.customer_feedback where id=e.resource_id and restaurant_id=e.restaurant_id and status in ('new','in_progress'));
  elsif e.type='refund.failed' then return exists(select 1 from public.pos_refunds where id=e.resource_id and restaurant_id=e.restaurant_id and state='failed');
  elsif e.type='payment.discrepancy' then return coalesce((public.pos_bill_data(e.resource_id)->>'overpaid_paise')::bigint,0)>0;
  else return true; end if;
end $$;

-- Serialized dispatch per restaurant makes inbox sequence cursors commit in
-- order. Business writes never take this lock and never call a network service.
create or replace function public.notification_dispatch(r uuid) returns integer language plpgsql security definer set search_path='' as $$
declare e public.notification_events; u uuid; nid uuid; n integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('notification-dispatch:'||r::text,0)) then return 0; end if;
  for e in select * from public.notification_events where restaurant_id=r and processed_at is null and available_at<=now() order by created_at,id limit 50 for update skip locked loop
    begin
      -- Items and table assignment can be written after the order INSERT in
      -- the same transaction. Snapshot safe service context after commit.
      if e.resource_kind='order' then
        e.metadata:=e.metadata||jsonb_build_object(
          'item_count',(select coalesce(sum(quantity),0) from public.order_items where order_id=e.resource_id and restaurant_id=r),
          'table',(select t.name from public.pos_visit_orders vo join public.pos_visits v on v.id=vo.visit_id join public.pos_tables t on t.id=v.table_id where vo.order_id=e.resource_id and vo.restaurant_id=r));
        update public.notification_events set metadata=e.metadata where id=e.id;
      end if;
      foreach u in array e.recipients loop
        if public.notification_allowed(r,e.type,u) then
          insert into public.notification_inbox(restaurant_id,event_id,user_id) values(r,e.id,u) on conflict(event_id,user_id) do nothing returning id into nid;
          if nid is not null then
            insert into public.notification_deliveries(inbox_id,subscription_id)
              select nid,s.id from public.notification_push_subscriptions s join public.notification_preferences p on p.user_id=s.user_id and p.restaurant_id=r
              where s.user_id=u and p.push_enabled and e.category=any(p.categories) and e.created_at>now()-interval '15 minutes' and public.notification_actionable(e)
              on conflict do nothing;
            perform public.notification_signal(r,u);
          end if;
        end if;
      end loop;
      update public.notification_events set processed_at=now(),last_error=null where id=e.id;
      n:=n+1;
    exception when others then
      update public.notification_events set attempts=attempts+1,last_error=SQLSTATE,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))) where id=e.id;
    end;
  end loop;
  return n;
end $$;

create or replace function public.notification_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare r uuid:=new.restaurant_id; order_no bigint; branch uuid; bill uuid; cfg public.notification_settings; m jsonb;
begin
  if tg_table_name='orders' then
    m:=jsonb_build_object('order_number',new.order_number);
    if tg_op='INSERT' then
      if new.status<>'pending' then return new; end if;
      perform public.notification_enqueue(r,'order.new','order',new.id,'order.new:'||new.id,m);
      insert into public.notification_reminders(order_id,restaurant_id,next_at) values(new.id,r,now()+make_interval(secs=>coalesce((select first_seconds from public.notification_settings where restaurant_id=r),120))) on conflict do nothing;
    else
      if new.status<>'pending' then delete from public.notification_reminders where order_id=new.id; end if;
      if new.status is distinct from old.status and new.status='cancelled' then perform public.notification_enqueue(r,'order.cancelled','order',new.id,'order.cancelled:'||new.id,m);
      elsif new.status is distinct from old.status and new.status='ready' and not exists(select 1 from public.pos_kitchen where order_id=new.id) then perform public.notification_enqueue(r,'order.ready','order',new.id,'order.ready:'||new.id,m); end if;
    end if;
  elsif tg_table_name='pos_kitchen' then
    select order_number into order_no from public.orders where id=new.order_id and restaurant_id=r;
    m:=jsonb_build_object('order_number',order_no,'items',jsonb_array_length(new.lines));
    if tg_op='INSERT' then perform public.notification_enqueue(r,'kitchen.new','order',new.order_id,'kitchen.new:'||new.id,m);
    elsif new.state is distinct from old.state then
      if new.state='ready' then perform public.notification_enqueue(r,'order.ready','order',new.order_id,'order.ready:'||new.order_id,m);
      elsif new.state='cancelled' and not exists(select 1 from public.orders where id=new.order_id and status='cancelled') then perform public.notification_enqueue(r,'kitchen.cancelled','order',new.order_id,'kitchen.cancelled:'||new.id,m); end if;
      if new.state in ('served','cancelled') then delete from public.notification_reminders where order_id=new.order_id; end if;
    elsif new.lines is distinct from old.lines and new.state not in ('served','cancelled') then
      perform public.notification_enqueue(r,'kitchen.changed','order',new.order_id,'kitchen.changed:'||new.id||':'||gen_random_uuid(),m);
    end if;
  elsif tg_table_name='ingredients' then
    if new.is_active and new.quantity<=new.low_stock_threshold and (tg_op='INSERT' or not (old.is_active and old.quantity<=old.low_stock_threshold)) then
      perform public.notification_enqueue(r,'inventory.low','ingredient',new.id,'inventory.low:'||new.id||':'||gen_random_uuid(),jsonb_build_object('name',new.name,'quantity',new.quantity,'unit',new.unit));
    end if;
  elsif tg_table_name='leave_requests' then
    select outlet_id into branch from public.employees where id=new.employee_id and restaurant_id=r;
    if new.status='pending' then perform public.notification_enqueue(r,'leave.new','leave',new.id,'leave.new:'||new.id,'{}',branch); end if;
  elsif tg_table_name='customer_feedback' then
    if new.rating<=coalesce((select feedback_threshold from public.notification_settings where restaurant_id=r),2) then
      perform public.notification_enqueue(r,'feedback.poor','feedback',new.id,'feedback.poor:'||new.id,jsonb_build_object('rating',new.rating)); end if;
  elsif tg_table_name='pos_refunds' then
    if new.state='failed' and (tg_op='INSERT' or old.state is distinct from new.state) then
      perform public.notification_enqueue(r,'refund.failed','refund',new.id,'refund.failed:'||new.id,'{}'); end if;
  elsif tg_table_name='pos_payments' then
    if coalesce((public.pos_bill_data(new.bill_id)->>'overpaid_paise')::bigint,0)>0 and coalesce((public.pos_bill_data(new.bill_id)->>'overpaid_paise')::bigint,0)<=new.amount_paise then
      perform public.notification_enqueue(r,'payment.discrepancy','bill',new.bill_id,'payment.discrepancy:'||new.id,jsonb_build_object('reason','Confirmed receipts exceed the adjusted bill total.')); end if;
  elsif tg_table_name='pos_closings' then
    if new.counted_paise<>new.expected_paise then perform public.notification_enqueue(r,'cash.discrepancy','closing',new.id,'cash.discrepancy:'||new.id,jsonb_build_object('reason','Counted cash differs from the recorded expected cash.')); end if;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['orders','pos_kitchen','ingredients','pos_refunds'] loop
    execute format('drop trigger if exists notification_capture on public.%I',t);
    execute format('create trigger notification_capture after insert or update on public.%I for each row execute function public.notification_capture()',t);
  end loop;
  foreach t in array array['leave_requests','customer_feedback','pos_payments','pos_closings'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists notification_capture on public.%I',t);
      execute format('create trigger notification_capture after insert on public.%I for each row execute function public.notification_capture()',t);
    end if;
  end loop;
end $$;

create or replace function public.notification_feed(p_restaurant_id uuid,p_before bigint default null,p_after bigint default null,p_unread boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid:=p_restaurant_id; result jsonb; head bigint; unread bigint;
begin
  if auth.uid() is null or public.notification_role(r,auth.uid()) is null then raise exception 'Restaurant access denied.' using errcode='42501'; end if;
  perform public.notification_dispatch(r);
  select coalesce(max(i.seq),0),count(*) filter(where i.read_at is null) into head,unread from public.notification_inbox i join public.notification_events e on e.id=i.event_id
    where i.restaurant_id=r and i.user_id=auth.uid() and public.notification_allowed(r,e.type,auth.uid());
  select coalesce(jsonb_agg(z order by case when p_after is not null then z.seq end,case when p_after is null then z.seq end desc),'[]') into result from (
    select i.id,i.seq::text as cursor,i.seq,i.read_at,e.type,e.category,e.severity,e.metadata,e.created_at,e.resource_kind,e.resource_id,public.notification_actionable(e) actionable
    from public.notification_inbox i join public.notification_events e on e.id=i.event_id
    where i.restaurant_id=r and i.user_id=auth.uid() and public.notification_allowed(r,e.type,auth.uid())
      and (not p_unread or i.read_at is null) and (p_before is null or i.seq<p_before) and (p_after is null or i.seq>p_after)
    order by case when p_after is not null then i.seq end,case when p_after is null then i.seq end desc limit 51
  ) z;
  return jsonb_build_object('items',result,'head',head::text,'unread',unread,'server_time',now(),
    'preferences',coalesce((select to_jsonb(p)-'user_id'-'restaurant_id' from public.notification_preferences p where restaurant_id=r and user_id=auth.uid()),jsonb_build_object('sound_enabled',false,'volume',.35,'push_enabled',false,'categories',array['orders','kitchen','inventory','staff','feedback','billing'])),
    'settings',case when public.notification_role(r,auth.uid())='owner' then coalesce((select to_jsonb(s)-'restaurant_id' from public.notification_settings s where restaurant_id=r),jsonb_build_object('reminders_enabled',true,'first_seconds',120,'escalation_seconds',300,'repeat_seconds',300,'max_repeats',2,'feedback_threshold',2)) else null end);
end $$;

create or replace function public.notification_read(p_restaurant_id uuid,p_id uuid default null,p_cutoff bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or public.notification_role(p_restaurant_id,auth.uid()) is null or (p_id is null and p_cutoff is null) then raise exception 'Invalid notification request.' using errcode='42501'; end if;
  update public.notification_inbox i set read_at=now() from public.notification_events e
    where i.event_id=e.id and i.restaurant_id=p_restaurant_id and i.user_id=auth.uid() and i.read_at is null and public.notification_allowed(p_restaurant_id,e.type,auth.uid())
      and case when p_id is not null then i.id=p_id else i.seq<=p_cutoff end;
  get diagnostics n=row_count;
  if n>0 then perform public.notification_signal(p_restaurant_id,auth.uid()); end if;
  return jsonb_build_object('updated',n);
end $$;

create or replace function public.notification_configure(p_restaurant_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid:=p_restaurant_id;
begin
  if auth.uid() is null or public.notification_role(r,auth.uid()) is null then raise exception 'Restaurant access denied.' using errcode='42501'; end if;
  if p_action='preferences' then
    if jsonb_typeof(p_data->'categories') is distinct from 'array' or jsonb_array_length(p_data->'categories')>6 then raise exception 'Invalid notification categories.' using errcode='22023'; end if;
    insert into public.notification_preferences(restaurant_id,user_id,sound_enabled,volume,push_enabled,categories)
      values(r,auth.uid(),(p_data->>'sound_enabled')::boolean,(p_data->>'volume')::numeric,(p_data->>'push_enabled')::boolean,array(select jsonb_array_elements_text(p_data->'categories')))
      on conflict(restaurant_id,user_id) do update set sound_enabled=excluded.sound_enabled,volume=excluded.volume,push_enabled=excluded.push_enabled,categories=excluded.categories;
  elsif p_action='settings' then
    if public.notification_role(r,auth.uid())<>'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
    insert into public.notification_settings(restaurant_id,reminders_enabled,first_seconds,escalation_seconds,repeat_seconds,max_repeats,feedback_threshold)
      values(r,(p_data->>'reminders_enabled')::boolean,(p_data->>'first_seconds')::integer,(p_data->>'escalation_seconds')::integer,(p_data->>'repeat_seconds')::integer,(p_data->>'max_repeats')::integer,(p_data->>'feedback_threshold')::integer)
      on conflict(restaurant_id) do update set reminders_enabled=excluded.reminders_enabled,first_seconds=excluded.first_seconds,escalation_seconds=excluded.escalation_seconds,repeat_seconds=excluded.repeat_seconds,max_repeats=excluded.max_repeats,feedback_threshold=excluded.feedback_threshold;
    update public.notification_reminders set next_at=least(next_at,now()+interval '1 minute') where restaurant_id=r;
  else raise exception 'Unknown notification action.' using errcode='22023'; end if;
  perform public.notification_signal(r,auth.uid()); return jsonb_build_object('ok',true);
end $$;

-- Called by an external scheduler, never by a browser timer. Lock the order
-- first, matching order mutations, so acceptance/cancellation wins safely.
create or replace function public.notification_tick() returns jsonb language plpgsql security definer set search_path='' as $$
declare j record; current_job public.notification_reminders; cfg public.notification_settings; age_seconds numeric; next_stage integer; kind text; n integer:=0; dispatched integer:=0; r uuid;
begin
  for j in select q.*,o.created_at,o.order_number,o.status from public.notification_reminders q join public.orders o on o.id=q.order_id
    where q.next_at<=now() order by q.next_at limit 200 for update of o skip locked loop
    select * into current_job from public.notification_reminders where order_id=j.order_id for update;
    if not found or current_job.next_at>now() then continue; end if;
    j.stage:=current_job.stage;
    if j.status<>'pending' or exists(select 1 from public.pos_kitchen where order_id=j.order_id and state in ('served','cancelled')) then delete from public.notification_reminders where order_id=j.order_id; continue; end if;
    select * into cfg from public.notification_settings where restaurant_id=j.restaurant_id;
    if not found then cfg.reminders_enabled:=true; cfg.first_seconds:=120; cfg.escalation_seconds:=300; cfg.repeat_seconds:=300; cfg.max_repeats:=2; end if;
    if not cfg.reminders_enabled then update public.notification_reminders set next_at=now()+interval '5 minutes' where order_id=j.order_id; continue; end if;
    age_seconds:=extract(epoch from now()-j.created_at);
    next_stage:=case when j.stage=0 and age_seconds<cfg.escalation_seconds then 1 when j.stage<2 then 2 else j.stage+1 end;
    if age_seconds<cfg.first_seconds or (next_stage=2 and age_seconds<cfg.escalation_seconds) then
      update public.notification_reminders set next_at=j.created_at+make_interval(secs=>case when next_stage=1 then cfg.first_seconds else cfg.escalation_seconds end) where order_id=j.order_id; continue;
    end if;
    if next_stage>2+cfg.max_repeats then delete from public.notification_reminders where order_id=j.order_id; continue; end if;
    kind:=case when next_stage=1 then 'order.reminder' else 'order.escalation' end;
    perform public.notification_enqueue(j.restaurant_id,kind,'order',j.order_id,'pending:'||j.order_id||':'||next_stage,jsonb_build_object('order_number',j.order_number,'stage',next_stage));
    update public.notification_reminders set stage=next_stage,last_sent_at=now(),next_at=case when next_stage=1 then j.created_at+make_interval(secs=>cfg.escalation_seconds) else now()+make_interval(secs=>cfg.repeat_seconds) end where order_id=j.order_id;
    n:=n+1;
  end loop;
  for r in select restaurant_id from public.notification_events where processed_at is null and available_at<=now() group by restaurant_id order by min(available_at) limit 40 loop
    dispatched:=dispatched+public.notification_dispatch(r);
  end loop;
  delete from public.notification_events where id in (select id from public.notification_events where processed_at<now()-interval '90 days' order by processed_at limit 500);
  delete from public.notification_push_subscriptions where last_seen_at<now()-interval '90 days';
  return jsonb_build_object('reminders',n,'dispatched',dispatched,'pending_events',(select count(*) from public.notification_events where processed_at is null),
    'failed_events',(select count(*) from public.notification_events where processed_at is null and attempts>0),
    'pending_push',(select count(*) from public.notification_deliveries where state in ('pending','sending')),
    'failed_push',(select count(*) from public.notification_deliveries where state='failed'));
end $$;

-- All tables are private; only the opaque, per-user invalidation table is
-- directly readable. Security-definer RPCs expose narrow, authorized DTOs.
do $$ declare t text; begin
  foreach t in array array['settings','preferences','events','inbox','signals','reminders','push_subscriptions','deliveries'] loop
    execute format('alter table public.notification_%I enable row level security',t);
    execute format('revoke all on public.notification_%I from anon,authenticated',t);
    execute format('grant all on public.notification_%I to service_role',t);
  end loop;
end $$;
grant select on public.notification_signals to authenticated;
drop policy if exists notification_own_signal on public.notification_signals;
create policy notification_own_signal on public.notification_signals for select to authenticated using(user_id=auth.uid() and public.notification_signal_access(restaurant_id));
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notification_signals') then
    alter publication supabase_realtime add table public.notification_signals;
  end if;
end $$;

create or replace function public.notification_push_register(p_restaurant_id uuid,p_device uuid,p_endpoint text,p_p256dh text,p_auth text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
  if auth.uid() is null or public.notification_role(p_restaurant_id,auth.uid()) is null then raise exception 'Restaurant access denied.' using errcode='42501'; end if;
  if p_device is null or p_endpoint is null or length(p_endpoint)>4096 or p_endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^#[:space:]]+$'
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invalid push subscription.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('notification-device:'||auth.uid()::text,0));
  perform pg_advisory_xact_lock(hashtextextended('notification-endpoint:'||p_endpoint,0));
  if exists(select 1 from public.notification_push_subscriptions where endpoint=p_endpoint and user_id<>auth.uid() and (p256dh<>p_p256dh or auth_key<>p_auth)) then raise exception 'Subscription belongs to another device.' using errcode='42501'; end if;
  -- Rebinding an endpoint requires fresh browser opt-in and session auth. A
  -- device cannot retain the previous account's subscription after rebinding.
  delete from public.notification_push_subscriptions where endpoint=p_endpoint and user_id<>auth.uid();
  delete from public.notification_push_subscriptions where user_id=auth.uid() and device_id=p_device and endpoint<>p_endpoint;
  if (select count(*) from public.notification_push_subscriptions where user_id=auth.uid())>=10 and not exists(select 1 from public.notification_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid()) then raise exception 'Device limit reached. Remove an old push device.' using errcode='22023'; end if;
  insert into public.notification_push_subscriptions(user_id,device_id,endpoint,p256dh,auth_key) values(auth.uid(),p_device,p_endpoint,p_p256dh,p_auth)
    on conflict(endpoint) do update set user_id=excluded.user_id,device_id=excluded.device_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,last_seen_at=now() returning id into sid;
  return jsonb_build_object('id',sid);
end $$;
create or replace function public.notification_push_remove(p_device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  delete from public.notification_push_subscriptions where user_id=auth.uid() and device_id=p_device;
  return jsonb_build_object('ok',true);
end $$;
create or replace function public.notification_push_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare d record; result jsonb:='[]'; token uuid;
begin
  for d in select q.*,s.endpoint,s.p256dh,s.auth_key,i.restaurant_id,i.user_id,i.read_at,e as event,p.push_enabled,p.categories
    from public.notification_deliveries q join public.notification_inbox i on i.id=q.inbox_id join public.notification_events e on e.id=i.event_id
    left join public.notification_push_subscriptions s on s.id=q.subscription_id
    left join public.notification_preferences p on p.restaurant_id=i.restaurant_id and p.user_id=i.user_id
    where q.state in ('pending','sending') and q.available_at<=now() and (q.lease_until is null or q.lease_until<now()) order by q.available_at,q.id limit 20 for update of q skip locked loop
    if d.endpoint is null or d.read_at is not null or not coalesce(d.push_enabled,false) or not coalesce((d.event).category=any(d.categories),false)
      or not public.notification_allowed(d.restaurant_id,(d.event).type,d.user_id) or not public.notification_actionable(d.event) or (d.event).created_at<now()-interval '15 minutes' then
      update public.notification_deliveries set state='skipped',lease_until=null where id=d.id; continue;
    end if;
    if d.attempts>=5 then update public.notification_deliveries set state='failed',lease_until=null where id=d.id; continue; end if;
    token:=gen_random_uuid();
    update public.notification_deliveries set state='sending',attempts=attempts+1,lease=token,lease_until=now()+interval '2 minutes' where id=d.id;
    result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'lease',token,'subscription_id',d.subscription_id,'endpoint',d.endpoint,'p256dh',d.p256dh,'auth',d.auth_key,'inbox_id',d.inbox_id,'restaurant_id',d.restaurant_id));
  end loop;
  return result;
end $$;
create or replace function public.notification_push_finish(p_id uuid,p_lease uuid,p_status integer) returns void language plpgsql security definer set search_path='' as $$
declare d public.notification_deliveries;
begin
  select * into d from public.notification_deliveries where id=p_id and lease=p_lease and state='sending' for update;
  if not found then return; end if;
  update public.notification_deliveries set state=case when p_status between 200 and 299 then 'sent' when p_status in (404,410) then 'expired' when attempts>=5 then 'failed' else 'pending' end,
    delivered_at=case when p_status between 200 and 299 then now() else null end,last_error=case when p_status between 200 and 299 then null else 'push_status_'||p_status end,
    lease=null,lease_until=null,available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts))) where id=p_id;
  if p_status in (404,410) then delete from public.notification_push_subscriptions where id=d.subscription_id; end if;
end $$;
create or replace function public.notification_push_check(p_id uuid,p_subscription uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.notification_inbox; e public.notification_events;
begin
  select * into i from public.notification_inbox where id=p_id and user_id=auth.uid();
  if not found or not exists(select 1 from public.notification_push_subscriptions where id=p_subscription and user_id=auth.uid()) then raise exception 'Notification unavailable.' using errcode='42501'; end if;
  select * into e from public.notification_events where id=i.event_id;
  if i.read_at is not null or not public.notification_allowed(i.restaurant_id,e.type,auth.uid()) or not public.notification_actionable(e)
    or not exists(select 1 from public.notification_preferences where restaurant_id=i.restaurant_id and user_id=auth.uid() and push_enabled and e.category=any(categories)) then return jsonb_build_object('show',false); end if;
  return jsonb_build_object('show',true,'href','/staff/'||i.restaurant_id||'/notifications/'||i.id);
end $$;

-- Exact resource lookup: no arbitrary URLs or unbounded dashboard history.
create or replace function public.notification_open(p_restaurant_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.notification_events; details jsonb; destination text; owner boolean;
begin
  select v.* into e from public.notification_events v join public.notification_inbox i on i.event_id=v.id
    where i.id=p_id and i.restaurant_id=p_restaurant_id and i.user_id=auth.uid() and public.notification_allowed(i.restaurant_id,v.type,auth.uid());
  if not found then raise exception 'This notification is unavailable or access has changed.' using errcode='42501'; end if;
  owner:=public.notification_role(p_restaurant_id,auth.uid())='owner';
  if e.resource_kind='order' then
    select jsonb_build_object('order_number',o.order_number,'status',o.status,'created_at',o.created_at,
      'kitchen_status',(select state from public.pos_kitchen where order_id=o.id),
      'table',(select t.name from public.pos_visit_orders vo join public.pos_visits v on v.id=vo.visit_id join public.pos_tables t on t.id=v.table_id where vo.order_id=o.id and vo.restaurant_id=p_restaurant_id),
      'items',(select coalesce(jsonb_agg(jsonb_build_object('name',dish_name,'quantity',quantity)),'[]') from public.order_items where order_id=o.id and restaurant_id=p_restaurant_id)) into details
      from public.orders o where o.id=e.resource_id and o.restaurant_id=p_restaurant_id;
    destination:='/staff/'||p_restaurant_id||'?tab='||case when public.notification_role(p_restaurant_id,auth.uid())='kitchen' or e.type like 'kitchen.%' then 'Kitchen' else 'Orders' end||'&order='||e.resource_id;
  elsif e.resource_kind='ingredient' then
    select jsonb_build_object('name',name,'quantity',quantity,'unit',unit,'threshold',low_stock_threshold,'active',is_active) into details from public.ingredients where id=e.resource_id and restaurant_id=p_restaurant_id;
    destination:='/dashboard/menu?tab=ingredients&ingredient='||e.resource_id;
  elsif e.resource_kind='leave' then
    select jsonb_build_object('employee',p.full_name,'type',l.leave_type,'from',l.starts_on,'to',l.ends_on,'reason',l.reason,'status',l.status,'outlet',o.name) into details
      from public.leave_requests l join public.employees p on p.id=l.employee_id and p.restaurant_id=l.restaurant_id left join public.outlets o on o.id=p.outlet_id and o.restaurant_id=l.restaurant_id where l.id=e.resource_id and l.restaurant_id=p_restaurant_id;
    destination:='/dashboard/employees?tab=leave&request='||e.resource_id;
  elsif e.resource_kind='feedback' then
    select jsonb_build_object('rating',rating,'category',category,'message',message,'status',status,'created_at',created_at) into details from public.customer_feedback where id=e.resource_id and restaurant_id=p_restaurant_id;
  elsif e.resource_kind='refund' then
    select jsonb_build_object('invoice',b.invoice_number,'amount_paise',f.amount_paise,'state',f.state,'reason',f.reason,'created_at',f.created_at) into details from public.pos_refunds f join public.pos_payments p on p.id=f.payment_id join public.pos_bills b on b.id=p.bill_id where f.id=e.resource_id and f.restaurant_id=p_restaurant_id;
    select '/staff/'||p_restaurant_id||'?tab=Billing&bill='||p.bill_id into destination from public.pos_refunds f join public.pos_payments p on p.id=f.payment_id where f.id=e.resource_id and f.restaurant_id=p_restaurant_id;
  elsif e.resource_kind='bill' then
    select jsonb_build_object('invoice',b.invoice_number,'total_paise',b.total_paise,'overpaid_paise',public.pos_bill_data(b.id)->'overpaid_paise') into details from public.pos_bills b where b.id=e.resource_id and b.restaurant_id=p_restaurant_id;
    destination:='/staff/'||p_restaurant_id||'?tab=Billing&bill='||e.resource_id;
  elsif e.resource_kind='closing' then
    select jsonb_build_object('date',business_date,'counted_paise',counted_paise,'expected_paise',expected_paise,'note',note) into details from public.pos_closings where id=e.resource_id and restaurant_id=p_restaurant_id;
    destination:='/staff/'||p_restaurant_id||'?tab=Billing';
  end if;
  if owner and destination like '/staff/%' then
    destination:=case when e.resource_kind='order' then
      case when e.type like 'kitchen.%' then '/dashboard/billing?tab=kitchen&order=' else '/dashboard/orders?order=' end||e.resource_id
      when e.resource_kind='closing' then '/dashboard/billing?tab=Daily%20close'
      else replace(destination,'/staff/'||p_restaurant_id||'?tab=Billing','/dashboard/billing?tab=Bills') end;
  end if;
  return jsonb_build_object('id',p_id,'type',e.type,'metadata',e.metadata,'severity',e.severity,'created_at',e.created_at,'actionable',public.notification_actionable(e),'details',details,'destination',case when details is not null then destination else null end);
end $$;

-- Operational orders are a bounded, oldest-first cursor feed. Completed and
-- cancelled history has its own newest-first cursor. Counts share one snapshot.
create index if not exists orders_active_cursor on public.orders(restaurant_id,created_at,id) where status not in ('completed','cancelled');
create index if not exists orders_history_cursor on public.orders(restaurant_id,created_at desc,id desc) where status in ('completed','cancelled');
create or replace function public.orders_page(p_restaurant_id uuid,p_history boolean default false,p_cursor_time timestamptz default null,p_cursor_id uuid default null,p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint; active_count bigint;
begin
  perform public.team_require(p_restaurant_id,'orders.read');
  select count(*) filter(where status not in ('completed','cancelled')),count(*) filter(where (status in ('completed','cancelled'))=p_history) into active_count,total from public.orders where restaurant_id=p_restaurant_id;
  select coalesce(jsonb_agg(z order by case when not p_history then z.created_at end,case when p_history then z.created_at end desc,case when not p_history then z.id end,case when p_history then z.id end desc),'[]') into result from (
    select o.id,o.order_number,o.customer_name,o.customer_note,o.status,o.version,o.currency,o.total,o.created_at,
      case when public.team_role(p_restaurant_id)='owner' then o.customer_phone else null end customer_phone,
      coalesce((select jsonb_agg(jsonb_build_object('dish_name',i.dish_name,'quantity',i.quantity,'line_total',i.line_total)) from public.order_items i where i.order_id=o.id),'[]') order_items
    from public.orders o where o.restaurant_id=p_restaurant_id and (case when p_id is not null then o.id=p_id else
      (o.status in ('completed','cancelled'))=p_history and (p_cursor_time is null or case when p_history then (o.created_at,o.id)<(p_cursor_time,p_cursor_id) else (o.created_at,o.id)>(p_cursor_time,p_cursor_id) end) end)
    order by case when not p_history then o.created_at end,case when p_history then o.created_at end desc,case when not p_history then o.id end,case when p_history then o.id end desc limit 51
  ) z;
  return jsonb_build_object('orders',result,'total',total,'active_count',active_count,'history',p_history);
end $$;

-- A separate, customer-safe DTO. Tokens retain the existing bearer-token
-- semantics: replacing/deleting public_token revokes the old URL immediately.
create or replace function public.order_tracking(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('order_number',o.order_number,'status',o.status,'kitchen_status',k.state,'updated_at',greatest(o.updated_at,k.updated_at),
    'currency',o.currency,'total',o.total,'restaurant_name',r.name,'slug',r.slug,
    'items',coalesce((select jsonb_agg(jsonb_build_object('dish_name',i.dish_name,'quantity',i.quantity,'line_total',i.line_total)) from public.order_items i where i.order_id=o.id),'[]'))
  from public.orders o join public.restaurants r on r.id=o.restaurant_id left join public.pos_kitchen k on k.order_id=o.id where o.public_token=p_token
$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'notification_%' or p.proname in ('orders_page','order_tracking')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant execute on function public.notification_signal_access(uuid),public.notification_feed(uuid,bigint,bigint,boolean),public.notification_read(uuid,uuid,bigint),public.notification_configure(uuid,text,jsonb),public.notification_open(uuid,uuid),public.notification_push_register(uuid,uuid,text,text,text),public.notification_push_remove(uuid),public.notification_push_check(uuid,uuid),public.orders_page(uuid,boolean,timestamptz,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
