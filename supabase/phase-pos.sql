-- Independent billing and restaurant operations. Run AFTER schema.sql and
-- phase-9-analytics-orders.sql. Existing menus and ordering stay unchanged.
begin;

create table if not exists public.pos_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  kitchen_enabled boolean not null default false,
  legal_name text not null default '', address text not null default '',
  state_code text not null default '29', gstin text not null default '',
  tax_status text not null default 'unregistered' check (tax_status in ('unregistered','composition','regular')),
  restaurant_class text not null default 'standard' check (restaurant_class in ('standard','specified')),
  price_mode text not null default 'inclusive' check (price_mode in ('inclusive','exclusive')),
  sac text not null default '996331', updated_at timestamptz not null default now()
);
create table if not exists public.pos_counters (
  restaurant_id uuid not null references public.restaurants(id), fy text not null,
  kind text not null, last_number integer not null, primary key (restaurant_id,fy,kind)
);
create table if not exists public.pos_bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  public_token uuid not null unique default gen_random_uuid(), request_key uuid not null,
  invoice_number text not null, issued_at timestamptz not null default now(),
  seller jsonb not null, customer jsonb not null, lines jsonb not null,
  price_mode text not null, tax_status text not null, rate_bps integer not null,
  gross_paise bigint not null, discount_paise bigint not null, taxable_paise bigint not null,
  cgst_paise bigint not null, state_tax_paise bigint not null, rounding_paise bigint not null,
  total_paise bigint not null check (total_paise > 0),
  created_by uuid not null, unique (restaurant_id,request_key), unique (restaurant_id,invoice_number),
  unique(id,restaurant_id)
);
create table if not exists public.pos_bill_orders (
  order_id uuid not null references public.orders(id) on delete restrict,
  bill_id uuid not null, restaurant_id uuid not null,
  active boolean not null default true, primary key(order_id,bill_id),
  foreign key(bill_id,restaurant_id) references public.pos_bills(id,restaurant_id)
);
create table if not exists public.pos_payments (
  id uuid primary key default gen_random_uuid(), bill_id uuid not null,
  restaurant_id uuid not null, method text not null check (method in ('cash','razorpay')),
  amount_paise bigint not null check (amount_paise > 0),
  request_key uuid, provider_payment_id text unique, account_key_id text,
  created_at timestamptz not null default now(),
  foreign key(bill_id,restaurant_id) references public.pos_bills(id,restaurant_id),
  unique (restaurant_id,request_key), unique(id,restaurant_id)
);
create table if not exists public.pos_checkouts (
  id uuid primary key default gen_random_uuid(), bill_id uuid not null,
  restaurant_id uuid not null, request_key uuid not null, account_key_id text not null,
  amount_paise bigint not null check(amount_paise > 0), provider_order_id text unique,
  state text not null default 'creating' check(state in ('creating','ready','failed')),
  created_at timestamptz not null default now(),
  foreign key(bill_id,restaurant_id) references public.pos_bills(id,restaurant_id), unique(bill_id,request_key)
);
create table if not exists public.pos_refunds (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null,
  restaurant_id uuid not null, request_key uuid not null,
  amount_paise bigint not null check(amount_paise > 0), reason text not null,
  state text not null default 'pending' check(state in ('pending','processed','failed')),
  provider_refund_id text unique, created_at timestamptz not null default now(), processed_at timestamptz,
  foreign key(payment_id,restaurant_id) references public.pos_payments(id,restaurant_id),
  unique(restaurant_id,request_key)
);
create table if not exists public.pos_credits (
  id uuid primary key default gen_random_uuid(), bill_id uuid not null,
  restaurant_id uuid not null, refund_id uuid unique references public.pos_refunds(id),
  credit_number text not null, amount_paise bigint not null,
  taxable_paise bigint not null, cgst_paise bigint not null, state_tax_paise bigint not null,
  rounding_paise bigint not null, reason text not null, created_at timestamptz not null default now(),
  foreign key(bill_id,restaurant_id) references public.pos_bills(id,restaurant_id)
);
create table if not exists public.pos_tables (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  name text not null check(char_length(name) between 1 and 40),
  seats integer not null default 2 check(seats between 1 and 40),
  unique(restaurant_id,name), unique(id,restaurant_id)
);
create table if not exists public.pos_visits (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null,
  table_id uuid not null, guest_name text not null default 'Guest',
  opened_at timestamptz not null default now(), closed_at timestamptz,
  foreign key(table_id,restaurant_id) references public.pos_tables(id,restaurant_id), unique(id,restaurant_id)
);
create unique index if not exists pos_one_open_visit on public.pos_visits(table_id) where closed_at is null;
create table if not exists public.pos_visit_orders (
  order_id uuid primary key references public.orders(id) on delete restrict,
  visit_id uuid not null, restaurant_id uuid not null,
  foreign key(visit_id,restaurant_id) references public.pos_visits(id,restaurant_id)
);
create table if not exists public.pos_kitchen (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  state text not null default 'queued' check(state in ('queued','preparing','ready','served','cancelled')),
  version integer not null default 0, lines jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pos_closings (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  business_date date not null, opening_paise bigint not null, expected_paise bigint not null,
  counted_paise bigint not null, note text not null, report jsonb not null,
  created_at timestamptz not null default now(), unique(restaurant_id,business_date)
);
create table if not exists public.pos_activity (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  actor_id uuid, action text not null, reference_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists pos_bills_recent on public.pos_bills(restaurant_id,issued_at desc);
create unique index if not exists pos_one_active_bill on public.pos_bill_orders(order_id) where active;
create index if not exists pos_payment_bill on public.pos_payments(bill_id);
create index if not exists pos_refund_payment on public.pos_refunds(payment_id);
create index if not exists pos_credit_bill on public.pos_credits(bill_id);
create index if not exists pos_checkout_bill on public.pos_checkouts(bill_id,created_at desc);
create index if not exists pos_kitchen_recent on public.pos_kitchen(restaurant_id,created_at desc);

-- New financial records can only be mutated through the transaction functions.
do $$ declare t text; begin
  foreach t in array array['settings','counters','bills','bill_orders','payments','checkouts','refunds','credits','tables','visits','visit_orders','kitchen','closings','activity'] loop
    execute format('alter table public.pos_%I enable row level security',t);
    execute format('revoke all on public.pos_%I from anon, authenticated',t);
    execute format('grant select on public.pos_%I to authenticated',t);
    execute format('grant all on public.pos_%I to service_role',t);
    execute format('drop policy if exists pos_owner_read on public.pos_%I',t);
    execute format('create policy pos_owner_read on public.pos_%I for select to authenticated using (exists(select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()))',t);
  end loop;
end $$;

create or replace function public.pos_gstin_valid(v text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; total integer := 0; n integer; i integer;
begin
  if v !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then return false; end if;
  for i in 1..14 loop
    n := (strpos(alphabet,substr(v,i,1))-1) * case when i % 2 = 0 then 2 else 1 end;
    total := total + n / 36 + n % 36;
  end loop;
  return substr(v,15,1) = substr(alphabet,((36-total%36)%36)+1,1);
end $$;

create or replace function public.pos_number(r uuid, k text) returns text
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; y integer; f text; n integer;
begin
  y := extract(year from d)::integer - case when extract(month from d)<4 then 1 else 0 end;
  f := right(y::text,2)||right((y+1)::text,2);
  insert into public.pos_counters values(r,f,k,1)
    on conflict(restaurant_id,fy,kind) do update set last_number=pos_counters.last_number+1 returning last_number into n;
  if n>999999 then raise exception 'Invoice series exhausted. Contact support.'; end if;
  return k||'/'||f||'/'||lpad(n::text,6,'0');
end $$;

-- One tax rate per restaurant-service invoice. All arithmetic is in paise.
create or replace function public.pos_amounts(lines jsonb, mode text, rate integer, discount bigint) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare gross bigint; base bigint; half_tax bigint; total bigint; adjustment bigint := 0;
begin
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) not between 1 and 200 or mode not in ('inclusive','exclusive') or rate not in (0,500,1800) then raise exception 'Invalid bill.'; end if;
  if exists(select 1 from jsonb_array_elements(lines) l where (l->>'quantity')::integer not between 1 and 99 or (l->>'unit_paise')::bigint not between 0 and 100000000) then raise exception 'Invalid bill item.'; end if;
  select sum((l->>'quantity')::integer * (l->>'unit_paise')::bigint) into gross from jsonb_array_elements(lines) l;
  if gross not between 1 and 1000000000 or discount is null or discount<0 or discount>=gross then raise exception 'Discount must be less than the bill.'; end if;
  if mode='inclusive' then
    total := gross-discount; base := round(total::numeric*10000/(10000+rate));
    half_tax := round(base::numeric*rate/20000); adjustment := total-base-2*half_tax;
  else
    base := gross-discount; half_tax := round(base::numeric*rate/20000); total := base+2*half_tax;
  end if;
  return jsonb_build_object('gross_paise',gross,'discount_paise',discount,'taxable_paise',base,'cgst_paise',half_tax,'state_tax_paise',half_tax,'rounding_paise',adjustment,'total_paise',total);
end $$;

create or replace function public.pos_bill_data(b uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(x)||jsonb_build_object(
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.pos_payments p where p.bill_id=x.id),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.pos_refunds f join public.pos_payments p on p.id=f.payment_id where p.bill_id=x.id),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.pos_credits c where c.bill_id=x.id),'[]'::jsonb),
    'paid_paise',paid-refunded,'credited_paise',credited,
    'balance_paise',greatest(x.total_paise-credited-paid+refunded,0),
    'overpaid_paise',greatest(paid-refunded-x.total_paise+credited,0))
  from public.pos_bills x
  cross join lateral(select coalesce(sum(amount_paise),0) paid from public.pos_payments where bill_id=x.id) p
  cross join lateral(select coalesce(sum(f.amount_paise),0) refunded from public.pos_refunds f join public.pos_payments z on z.id=f.payment_id where z.bill_id=x.id and f.state='processed') f
  cross join lateral(select coalesce(sum(amount_paise),0) credited from public.pos_credits where bill_id=x.id) c
  where x.id=b;
$$;

create or replace function public.pos_report(r uuid, d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; start_at timestamptz := d::timestamp at time zone 'Asia/Kolkata'; finish_at timestamptz := (d+1)::timestamp at time zone 'Asia/Kolkata';
begin
  select jsonb_build_object('date',d,'invoice_count',count(*),'invoiced_paise',coalesce(sum(total_paise),0),
    'taxable_paise',coalesce(sum(taxable_paise),0),'cgst_paise',coalesce(sum(cgst_paise),0),'state_tax_paise',coalesce(sum(state_tax_paise),0))
    into result from public.pos_bills where restaurant_id=r and issued_at>=start_at and issued_at<finish_at;
  return result||jsonb_build_object(
    'cash_paise',coalesce((select sum(amount_paise) from public.pos_payments where restaurant_id=r and method='cash' and created_at>=start_at and created_at<finish_at),0),
    'online_paise',coalesce((select sum(amount_paise) from public.pos_payments where restaurant_id=r and method='razorpay' and created_at>=start_at and created_at<finish_at),0),
    'refunds_paise',coalesce((select sum(amount_paise) from public.pos_refunds where restaurant_id=r and state='processed' and processed_at>=start_at and processed_at<finish_at),0),
    'cash_refunds_paise',coalesce((select sum(f.amount_paise) from public.pos_refunds f join public.pos_payments p on p.id=f.payment_id where f.restaurant_id=r and f.state='processed' and p.method='cash' and f.processed_at>=start_at and f.processed_at<finish_at),0),
    'credits_paise',coalesce((select sum(amount_paise) from public.pos_credits where restaurant_id=r and created_at>=start_at and created_at<finish_at),0),
    'credited_taxable_paise',coalesce((select sum(taxable_paise) from public.pos_credits where restaurant_id=r and created_at>=start_at and created_at<finish_at),0),
    'credited_cgst_paise',coalesce((select sum(cgst_paise) from public.pos_credits where restaurant_id=r and created_at>=start_at and created_at<finish_at),0),
    'credited_state_tax_paise',coalesce((select sum(state_tax_paise) from public.pos_credits where restaurant_id=r and created_at>=start_at and created_at<finish_at),0),
    'closing',(select to_jsonb(c) from public.pos_closings c where restaurant_id=r and business_date=d));
end $$;

create or replace function public.pos_finish_refund(f uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare rf public.pos_refunds; p public.pos_payments; b public.pos_bills; summary jsonb; credit bigint; previous public.pos_credits; base bigint; ct bigint; st bigint;
begin
  select * into rf from public.pos_refunds where id=f for update;
  if rf.state='processed' then return; end if;
  select * into p from public.pos_payments where id=rf.payment_id;
  if rf.amount_paise>p.amount_paise-coalesce((select sum(amount_paise) from public.pos_refunds where payment_id=p.id and state='processed'),0) then raise exception 'Refund exceeds payment remainder.'; end if;
  select * into b from public.pos_bills where id=p.bill_id for update;
  summary := public.pos_bill_data(b.id);
  credit := greatest(rf.amount_paise-(summary->>'overpaid_paise')::bigint,0);
  if credit>0 then
    if credit > b.total_paise-(summary->>'credited_paise')::bigint then raise exception 'Refund exceeds invoice remainder.'; end if;
    select coalesce(sum(taxable_paise),0),coalesce(sum(cgst_paise),0),coalesce(sum(state_tax_paise),0) into base,ct,st from public.pos_credits where bill_id=b.id;
    if credit=b.total_paise-(summary->>'credited_paise')::bigint then
      base:=b.taxable_paise-base; ct:=b.cgst_paise-ct; st:=b.state_tax_paise-st;
    else
      base:=least(b.taxable_paise-base,round(credit::numeric*b.taxable_paise/b.total_paise));
      ct:=least(b.cgst_paise-ct,round(credit::numeric*b.cgst_paise/b.total_paise));
      st:=least(b.state_tax_paise-st,round(credit::numeric*b.state_tax_paise/b.total_paise));
    end if;
    insert into public.pos_credits(bill_id,restaurant_id,refund_id,credit_number,amount_paise,taxable_paise,cgst_paise,state_tax_paise,rounding_paise,reason)
      values(b.id,b.restaurant_id,rf.id,public.pos_number(b.restaurant_id,'C'),credit,base,ct,st,credit-base-ct-st,rf.reason);
  end if;
  update public.pos_refunds set state='processed',processed_at=now() where id=f;
  insert into public.pos_activity(restaurant_id,actor_id,action,reference_id) values(b.restaurant_id,auth.uid(),'refund.processed',f);
end $$;

create or replace function public.pos_authorize(r uuid, a text) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.restaurants where id=r and owner_id=auth.uid()) then raise exception 'Restaurant access denied.' using errcode='42501'; end if; end $$;
create or replace function public.pos_filter_state(r uuid, data jsonb) returns jsonb language sql security definer set search_path='' as $$ select data $$;
create or replace function public.pos_owner_action(p_restaurant_id uuid, p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r uuid := p_restaurant_id; s public.pos_settings; b public.pos_bills; pay public.pos_payments; rf public.pos_refunds;
  visit public.pos_visits; ticket public.pos_kitchen; settings_data jsonb; lines jsonb := '[]'; x record;
  amounts jsonb; result jsonb; summary jsonb; ids uuid[]; action_id uuid; key uuid; a bigint; rate integer; d date; old_request public.pos_bills;
begin
  perform public.pos_authorize(r,p_action);
  perform pg_advisory_xact_lock(hashtextextended(r::text,0));
  select * into s from public.pos_settings where restaurant_id=r;
  if p_action='state' then
    if coalesce(p_data->>'bill_id','')<>'' then
      select * into b from public.pos_bills where id=(p_data->>'bill_id')::uuid and restaurant_id=r;
      if not found then raise exception 'Bill not found.'; end if;
      return public.pos_bill_data(b.id);
    end if;
    return public.pos_filter_state(r,jsonb_build_object('settings',case when s.restaurant_id is null then null else to_jsonb(s) end,
      'bills',coalesce((select jsonb_agg(public.pos_bill_data(z.id) order by z.issued_at desc) from (select id,issued_at from public.pos_bills where restaurant_id=r order by issued_at desc limit 100) z),'[]'::jsonb),
      'orders',coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at desc) from (
        select o.id,o.order_number,o.customer_name,o.customer_note,o.status,o.created_at,o.total,bo.bill_id,vo.visit_id,
          coalesce((select jsonb_agg(jsonb_build_object('name',i.dish_name,'quantity',i.quantity)) from public.order_items i where i.order_id=o.id),'[]'::jsonb) as items
        from public.orders o left join public.pos_bill_orders bo on bo.order_id=o.id and bo.active left join public.pos_visit_orders vo on vo.order_id=o.id where o.restaurant_id=r order by o.created_at desc limit 100) z),'[]'::jsonb),
      'tables',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('visit',(select to_jsonb(v) from public.pos_visits v where v.table_id=t.id and v.closed_at is null)) order by t.name) from public.pos_tables t where t.restaurant_id=r),'[]'::jsonb),
      'kitchen',coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at) from (select k.*,o.order_number,o.customer_name,o.customer_note from public.pos_kitchen k join public.orders o on o.id=k.order_id where k.restaurant_id=r and (k.state not in ('served','cancelled') or k.updated_at>now()-interval '2 hours') order by (k.state in ('served','cancelled')),k.created_at limit 200) z),'[]'::jsonb),
      'report',public.pos_report(r,coalesce((p_data->>'date')::date,(now() at time zone 'Asia/Kolkata')::date))));
  elsif p_action='settings' then
    settings_data:=p_data;
    if length(trim(coalesce(p_data->>'legal_name',''))) not between 1 and 120 or length(trim(coalesce(p_data->>'address',''))) not between 1 and 500
      or coalesce(p_data->>'state_code','') !~ '^(0[1-9]|1[0-9]|2[0-4]|2[679]|3[0-8])$' or coalesce(p_data->>'sac','') !~ '^[0-9]{6}$'
      or coalesce(p_data->>'tax_status','') not in ('unregistered','composition','regular')
      or coalesce(p_data->>'restaurant_class','') not in ('standard','specified') or coalesce(p_data->>'price_mode','') not in ('inclusive','exclusive') then raise exception 'Complete the billing details.'; end if;
    if p_data->>'tax_status'<>'unregistered' and (not public.pos_gstin_valid(coalesce(p_data->>'gstin','')) or left(p_data->>'gstin',2)<>p_data->>'state_code') then raise exception 'Enter a valid GSTIN matching the outlet state.'; end if;
    if not exists(select 1 from public.restaurants where id=r and currency='INR') then raise exception 'Billing currently supports INR outlets.'; end if;
    insert into public.pos_settings(restaurant_id,enabled,kitchen_enabled,legal_name,address,state_code,gstin,tax_status,restaurant_class,price_mode,sac)
      values(r,coalesce((p_data->>'enabled')::boolean,false),coalesce((p_data->>'kitchen_enabled')::boolean,false),trim(p_data->>'legal_name'),trim(p_data->>'address'),p_data->>'state_code',case when p_data->>'tax_status'='unregistered' then '' else p_data->>'gstin' end,p_data->>'tax_status',p_data->>'restaurant_class',p_data->>'price_mode',p_data->>'sac')
      on conflict(restaurant_id) do update set enabled=excluded.enabled,kitchen_enabled=excluded.kitchen_enabled,legal_name=excluded.legal_name,address=excluded.address,state_code=excluded.state_code,gstin=excluded.gstin,tax_status=excluded.tax_status,restaurant_class=excluded.restaurant_class,price_mode=excluded.price_mode,sac=excluded.sac,updated_at=now();
    result:=jsonb_build_object('ok',true);
  elsif p_action in ('preview','issue') then
    if not coalesce(s.enabled,false) then raise exception 'Enable billing in Billing settings first.'; end if;
    key:=(p_data->>'request_key')::uuid;
    if p_action='issue' then
      select * into old_request from public.pos_bills where restaurant_id=r and request_key=key;
      if found then return public.pos_bill_data(old_request.id); end if;
    end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(coalesce(p_data->'order_ids','[]'));
    if cardinality(ids)>50 or cardinality(ids)<>(select count(distinct i) from unnest(ids) i) then raise exception 'Select distinct orders.'; end if;
    if exists(select 1 from unnest(ids) i where not exists(select 1 from public.orders o where o.id=i and o.restaurant_id=r and o.status<>'cancelled') or exists(select 1 from public.pos_bill_orders z where z.order_id=i and z.active)) then raise exception 'An order is unavailable or already invoiced.'; end if;
    -- Lock the source orders before taking their price/name snapshots.
    perform 1 from public.orders where id=any(ids) order by id for update;
    select coalesce(jsonb_agg(jsonb_build_object('name',i.dish_name,'quantity',i.quantity,'unit_paise',round(i.unit_price*100)::bigint) order by i.id),'[]'::jsonb) into lines from public.order_items i where i.order_id=any(ids) and i.restaurant_id=r;
    if jsonb_array_length(coalesce(p_data->'items','[]'))>100 then raise exception 'Too many dishes.'; end if;
    for x in select value from jsonb_array_elements(coalesce(p_data->'items','[]')) loop
      if (x.value->>'quantity')::integer not between 1 and 99 then raise exception 'Invalid quantity.'; end if;
      select jsonb_build_object('name',name,'quantity',(x.value->>'quantity')::integer,'unit_paise',round(price*100)::bigint) into result from public.dishes where id=(x.value->>'dish_id')::uuid and restaurant_id=r and is_available and price is not null;
      if result is null then raise exception 'A dish is no longer available.'; end if;
      lines:=lines||jsonb_build_array(result);
    end loop;
    rate:=case when s.tax_status<>'regular' then 0 when s.restaurant_class='specified' then 1800 else 500 end;
    amounts:=public.pos_amounts(lines,s.price_mode,rate,coalesce((p_data->>'discount_paise')::bigint,0));
    result:=amounts||jsonb_build_object('lines',lines,'rate_bps',rate,'price_mode',s.price_mode);
    if p_action='preview' then return result; end if;
    if key is null then raise exception 'A request key is required.'; end if;
    if length(coalesce(p_data->>'customer_name',''))>100 or length(coalesce(p_data->>'customer_address',''))>500 or length(coalesce(p_data->>'note',''))>500 then raise exception 'Bill details are too long.'; end if;
    if coalesce(p_data->>'customer_gstin','')<>'' and not public.pos_gstin_valid(p_data->>'customer_gstin') then raise exception 'Invalid customer GSTIN.'; end if;
    if coalesce(p_data->>'customer_gstin','')<>'' and (length(trim(coalesce(p_data->>'customer_name','')))<2 or length(trim(coalesce(p_data->>'customer_address','')))<3) then raise exception 'Business invoices require the recipient name and address.'; end if;
    insert into public.pos_bills(restaurant_id,request_key,invoice_number,seller,customer,lines,price_mode,tax_status,rate_bps,gross_paise,discount_paise,taxable_paise,cgst_paise,state_tax_paise,rounding_paise,total_paise,created_by)
      values(r,key,public.pos_number(r,'W'),to_jsonb(s)-'enabled'-'kitchen_enabled'-'updated_at',jsonb_build_object('name',coalesce(nullif(trim(p_data->>'customer_name'),''),'Guest'),'gstin',coalesce(p_data->>'customer_gstin',''),'address',coalesce(p_data->>'customer_address',''),'note',coalesce(p_data->>'note','')),lines,s.price_mode,s.tax_status,rate,(amounts->>'gross_paise')::bigint,(amounts->>'discount_paise')::bigint,(amounts->>'taxable_paise')::bigint,(amounts->>'cgst_paise')::bigint,(amounts->>'state_tax_paise')::bigint,(amounts->>'rounding_paise')::bigint,(amounts->>'total_paise')::bigint,auth.uid()) returning * into b;
    insert into public.pos_bill_orders(order_id,bill_id,restaurant_id) select i,b.id,r from unnest(ids) i;
    result:=public.pos_bill_data(b.id); action_id:=b.id;
  elsif p_action='void' then
    select * into b from public.pos_bills where id=(p_data->>'bill_id')::uuid and restaurant_id=r for update;
    if not found then raise exception 'Bill not found.'; end if;
    summary:=public.pos_bill_data(b.id); a:=b.total_paise-(summary->>'credited_paise')::bigint;
    if a=0 then return summary; end if;
    if (summary->>'paid_paise')::bigint<>0 then raise exception 'Refund received payments before crediting the remainder.'; end if;
    if length(trim(coalesce(p_data->>'reason',''))) not between 3 and 300 then raise exception 'Enter a reason for crediting this invoice.'; end if;
    insert into public.pos_credits(bill_id,restaurant_id,credit_number,amount_paise,taxable_paise,cgst_paise,state_tax_paise,rounding_paise,reason)
      select b.id,r,public.pos_number(r,'C'),a,b.taxable_paise-coalesce(sum(c.taxable_paise),0),b.cgst_paise-coalesce(sum(c.cgst_paise),0),b.state_tax_paise-coalesce(sum(c.state_tax_paise),0),b.rounding_paise-coalesce(sum(c.rounding_paise),0),trim(p_data->>'reason') from public.pos_credits c where c.bill_id=b.id;
    update public.pos_bill_orders set active=false where bill_id=b.id;
    action_id:=b.id; result:=public.pos_bill_data(b.id);
  elsif p_action='cash' then
    select * into b from public.pos_bills where id=(p_data->>'bill_id')::uuid and restaurant_id=r for update;
    if not found then raise exception 'Bill not found.'; end if;
    key:=(p_data->>'request_key')::uuid; a:=(p_data->>'amount_paise')::bigint;
    select * into pay from public.pos_payments where restaurant_id=r and request_key=key;
    if found then
      if pay.bill_id<>b.id or pay.amount_paise<>a then raise exception 'Request key was already used.'; end if;
      return public.pos_bill_data(b.id);
    end if;
    summary:=public.pos_bill_data(b.id);
    if a is null or a<=0 or a>(summary->>'balance_paise')::bigint then raise exception 'Cash must not exceed the outstanding amount.'; end if;
    insert into public.pos_payments(bill_id,restaurant_id,method,amount_paise,request_key) values(b.id,r,'cash',a,key) returning id into action_id;
    result:=public.pos_bill_data(b.id);
  elsif p_action='refund' then
    key:=(p_data->>'request_key')::uuid; a:=(p_data->>'amount_paise')::bigint;
    select * into pay from public.pos_payments where id=(p_data->>'payment_id')::uuid and restaurant_id=r for update;
    if not found then raise exception 'Payment not found.'; end if;
    select * into rf from public.pos_refunds where restaurant_id=r and request_key=key;
    if found then
      if rf.payment_id<>pay.id or rf.amount_paise<>a then raise exception 'Request key was already used.'; end if;
      return to_jsonb(rf)||jsonb_build_object('fresh',false,'method',pay.method,'provider_payment_id',pay.provider_payment_id,'account_key_id',pay.account_key_id);
    end if;
    if a is null or a<=0 or a>pay.amount_paise-coalesce((select sum(amount_paise) from public.pos_refunds where payment_id=pay.id and state<>'failed'),0) or length(trim(coalesce(p_data->>'reason',''))) not between 3 and 300 then raise exception 'Enter a valid refund amount and reason.'; end if;
    insert into public.pos_refunds(payment_id,restaurant_id,request_key,amount_paise,reason) values(pay.id,r,key,a,trim(p_data->>'reason')) returning * into rf;
    if pay.method='cash' then perform public.pos_finish_refund(rf.id); select * into rf from public.pos_refunds where pos_refunds.id=rf.id; end if;
    result:=to_jsonb(rf)||jsonb_build_object('fresh',true,'method',pay.method,'provider_payment_id',pay.provider_payment_id,'account_key_id',pay.account_key_id); action_id:=rf.id;
  elsif p_action='table_create' then
    if not coalesce(s.enabled,false) then raise exception 'Enable billing first.'; end if;
    insert into public.pos_tables(restaurant_id,name,seats) values(r,trim(p_data->>'name'),(p_data->>'seats')::integer) returning pos_tables.id into action_id;
    result:=jsonb_build_object('id',action_id);
  elsif p_action='visit_open' then
    if not coalesce(s.enabled,false) then raise exception 'Enable billing first.'; end if;
    if length(coalesce(p_data->>'guest_name',''))>100 then raise exception 'Guest name is too long.'; end if;
    insert into public.pos_visits(restaurant_id,table_id,guest_name) values(r,(p_data->>'table_id')::uuid,coalesce(nullif(trim(p_data->>'guest_name'),''),'Guest')) returning pos_visits.id into action_id;
    result:=jsonb_build_object('id',action_id);
  elsif p_action in ('visit_assign','visit_transfer','visit_close') then
    select * into visit from public.pos_visits where pos_visits.id=(p_data->>'visit_id')::uuid and restaurant_id=r and closed_at is null for update;
    if not found then raise exception 'Open table visit not found.'; end if;
    if p_action='visit_assign' then
      action_id:=(p_data->>'order_id')::uuid;
      if not exists(select 1 from public.orders where orders.id=action_id and restaurant_id=r and status<>'cancelled') or exists(select 1 from public.pos_bill_orders where order_id=action_id and active) then raise exception 'Select an unbilled order from this restaurant.'; end if;
      insert into public.pos_visit_orders values(action_id,visit.id,r);
    elsif p_action='visit_transfer' then
      update public.pos_visits set table_id=(p_data->>'table_id')::uuid where pos_visits.id=visit.id;
    else
      if exists(select 1 from public.pos_visit_orders v join public.orders o on o.id=v.order_id left join public.pos_bill_orders bo on bo.order_id=o.id and bo.active where v.visit_id=visit.id and o.status<>'cancelled' and (bo.bill_id is null or (public.pos_bill_data(bo.bill_id)->>'balance_paise')::bigint>0)) then raise exception 'Invoice and settle this table before closing its visit.'; end if;
      if exists(select 1 from public.pos_visit_orders v join public.pos_kitchen k on k.order_id=v.order_id where v.visit_id=visit.id and k.state not in ('served','cancelled')) then raise exception 'Finish the kitchen tickets before closing this visit.'; end if;
      update public.pos_visits set closed_at=now() where pos_visits.id=visit.id;
    end if;
    action_id:=visit.id; result:=jsonb_build_object('ok',true);
  elsif p_action='kitchen_send' then
    if not coalesce(s.enabled and s.kitchen_enabled,false) then raise exception 'Enable the kitchen queue first.'; end if;
    action_id:=(p_data->>'order_id')::uuid;
    if not exists(select 1 from public.orders where orders.id=action_id and restaurant_id=r and status<>'cancelled') then raise exception 'Order not found.'; end if;
    insert into public.pos_kitchen(restaurant_id,order_id,lines) select r,action_id,jsonb_agg(jsonb_build_object('name',dish_name,'quantity',quantity)) from public.order_items where order_id=action_id and restaurant_id=r having count(*)>0 on conflict(order_id) do nothing;
    result:=jsonb_build_object('ok',true);
  elsif p_action='kitchen_move' then
    select * into ticket from public.pos_kitchen where pos_kitchen.id=(p_data->>'ticket_id')::uuid and restaurant_id=r for update;
    if not found then raise exception 'Kitchen ticket not found.'; end if;
    if p_data->>'version' is null or ticket.version<>(p_data->>'version')::integer then raise exception 'Ticket changed. Refresh and try again.' using errcode='40001'; end if;
    if not ((ticket.state='queued' and p_data->>'state' in ('preparing','cancelled')) or (ticket.state='preparing' and p_data->>'state' in ('ready','cancelled')) or (ticket.state='ready' and p_data->>'state'='served')) then raise exception 'Invalid kitchen transition.'; end if;
    if p_data->>'state'='cancelled' and length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'A kitchen cancellation needs a reason.'; end if;
    update public.pos_kitchen set state=p_data->>'state',version=version+1,updated_at=now() where pos_kitchen.id=ticket.id;
    action_id:=ticket.id; result:=jsonb_build_object('ok',true);
  elsif p_action='close_day' then
    d:=(p_data->>'date')::date;
    if d>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Cannot close a future date.'; end if;
    a:=(p_data->>'opening_paise')::bigint; summary:=public.pos_report(r,d);
    if a is null or a<0 or (p_data->>'counted_paise')::bigint<0 or length(coalesce(p_data->>'note',''))>500 then raise exception 'Invalid cash closing.'; end if;
    insert into public.pos_closings(restaurant_id,business_date,opening_paise,expected_paise,counted_paise,note,report)
      values(r,d,a,a+(summary->>'cash_paise')::bigint-(summary->>'cash_refunds_paise')::bigint,(p_data->>'counted_paise')::bigint,coalesce(p_data->>'note',''),summary) returning pos_closings.id into action_id;
    result:=jsonb_build_object('ok',true);
  else raise exception 'Unknown billing action.';
  end if;
  insert into public.pos_activity(restaurant_id,actor_id,action,reference_id,detail) values(r,auth.uid(),p_action,action_id,jsonb_build_object('reason',left(coalesce(p_data->>'reason',''),300)));
  return result;
end $$;

create or replace function public.pos_gateway_action(p_action text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.pos_bills; c public.pos_checkouts; p public.pos_payments; f public.pos_refunds; summary jsonb; a bigint; rid uuid;
begin
  if p_action in ('lookup','checkout') then
    select * into b from public.pos_bills where public_token=(p_data->>'token')::uuid;
    if not found then raise exception 'Bill not found.'; end if;
    if p_action='lookup' then return public.pos_bill_data(b.id); end if;
    rid:=b.restaurant_id;
  elsif p_action in ('attach','checkout_failed','checkout_get') then
    select * into c from public.pos_checkouts where id=(p_data->>'checkout_id')::uuid;
    rid:=c.restaurant_id;
  elsif p_action='capture' then
    select * into c from public.pos_checkouts where provider_order_id=p_data->>'provider_order_id' and restaurant_id=(p_data->>'restaurant_id')::uuid;
    rid:=c.restaurant_id;
  elsif p_action='refund_update' then
    select * into p from public.pos_payments where provider_payment_id=p_data->>'provider_payment_id' and restaurant_id=(p_data->>'restaurant_id')::uuid;
    rid:=p.restaurant_id;
  elsif p_action='refund_rejected' then
    select * into f from public.pos_refunds where id=(p_data->>'refund_id')::uuid;
    rid:=f.restaurant_id;
  end if;
  if rid is null then raise exception 'Payment reference not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
  if p_action='checkout' then
    summary:=public.pos_bill_data(b.id); a:=(summary->>'balance_paise')::bigint;
    if a<=0 then raise exception 'This bill is already settled.'; end if;
    select * into c from public.pos_checkouts where bill_id=b.id and account_key_id=p_data->>'account_key_id' and amount_paise=a and state in ('creating','ready') order by created_at desc limit 1;
    if found then return to_jsonb(c)||jsonb_build_object('fresh',false); end if;
    insert into public.pos_checkouts(bill_id,restaurant_id,request_key,account_key_id,amount_paise) values(b.id,rid,(p_data->>'request_key')::uuid,p_data->>'account_key_id',a) returning * into c;
    return to_jsonb(c)||jsonb_build_object('fresh',true);
  elsif p_action='checkout_get' then return to_jsonb(c);
  elsif p_action='attach' then
    if c.account_key_id<>p_data->>'account_key_id' or (c.provider_order_id is not null and c.provider_order_id<>p_data->>'provider_order_id') then raise exception 'Payment account mismatch.'; end if;
    update public.pos_checkouts set provider_order_id=p_data->>'provider_order_id',state='ready' where id=c.id;
    return jsonb_build_object('ok',true);
  elsif p_action='checkout_failed' then
    update public.pos_checkouts set state='failed' where id=c.id and provider_order_id is null;
    return jsonb_build_object('ok',true);
  elsif p_action='capture' then
    if c.state<>'ready' or c.amount_paise<>(p_data->>'amount_paise')::bigint or c.account_key_id<>p_data->>'account_key_id' or p_data->>'currency'<>'INR' then raise exception 'Payment does not match the bill.'; end if;
    select * into p from public.pos_payments where provider_payment_id=p_data->>'provider_payment_id';
    if found then
      if p.bill_id<>c.bill_id or p.amount_paise<>c.amount_paise then raise exception 'Payment was already linked elsewhere.'; end if;
    else
      insert into public.pos_payments(bill_id,restaurant_id,method,amount_paise,provider_payment_id,account_key_id) values(c.bill_id,rid,'razorpay',c.amount_paise,p_data->>'provider_payment_id',c.account_key_id) returning * into p;
      insert into public.pos_activity(restaurant_id,action,reference_id) values(rid,'payment.captured',p.id);
    end if;
    return public.pos_bill_data(c.bill_id);
  elsif p_action='refund_rejected' then
    update public.pos_refunds set state='failed' where id=f.id and state='pending' and provider_refund_id is null;
    return jsonb_build_object('ok',true);
  elsif p_action='refund_update' then
    if p.account_key_id<>p_data->>'account_key_id' or p_data->>'currency'<>'INR' or coalesce(p_data->>'provider_refund_id','')='' or coalesce(p_data->>'state','') not in ('pending','processed','failed') then raise exception 'Invalid refund confirmation.'; end if;
    select * into f from public.pos_refunds where provider_refund_id=p_data->>'provider_refund_id';
    if not found and coalesce(p_data->>'refund_id','')<>'' then select * into f from public.pos_refunds where id=(p_data->>'refund_id')::uuid and restaurant_id=rid; end if;
    a:=(p_data->>'amount_paise')::bigint;
    if f.id is null then
      if a is null or a<=0 or a>p.amount_paise-coalesce((select sum(amount_paise) from public.pos_refunds where payment_id=p.id and state<>'failed'),0) then raise exception 'Refund exceeds payment.'; end if;
      insert into public.pos_refunds(payment_id,restaurant_id,request_key,amount_paise,reason,provider_refund_id) values(p.id,rid,gen_random_uuid(),a,'Payment provider refund',p_data->>'provider_refund_id') returning * into f;
    end if;
    if f.payment_id<>p.id or f.amount_paise<>a or (f.provider_refund_id is not null and f.provider_refund_id<>p_data->>'provider_refund_id') then raise exception 'Refund reference mismatch.'; end if;
    update public.pos_refunds set provider_refund_id=p_data->>'provider_refund_id' where id=f.id;
    if f.state<>'processed' then
      if p_data->>'state'='processed' then perform public.pos_finish_refund(f.id);
      else update public.pos_refunds set state=p_data->>'state' where id=f.id; end if;
    end if;
    return public.pos_bill_data(p.bill_id);
  end if;
  raise exception 'Unknown payment action.';
end $$;

-- Opt-in ticket creation: the existing ordering API does not need to change.
create or replace function public.pos_order_items_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pos_kitchen(restaurant_id,order_id,lines)
  select n.restaurant_id,n.order_id,jsonb_agg(jsonb_build_object('name',n.dish_name,'quantity',n.quantity))
  from new_items n join public.orders o on o.id=n.order_id and o.restaurant_id=n.restaurant_id
  join public.pos_settings s on s.restaurant_id=n.restaurant_id and s.enabled and s.kitchen_enabled
  group by n.restaurant_id,n.order_id on conflict(order_id) do nothing;
  return null;
end $$;
drop trigger if exists pos_new_order_ticket on public.order_items;
create trigger pos_new_order_ticket after insert on public.order_items referencing new table as new_items for each statement execute function public.pos_order_items_ticket();

create or replace function public.pos_cancel_order_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.pos_kitchen set state='cancelled',version=version+1,updated_at=now()
    where order_id=new.id and restaurant_id=new.restaurant_id and state in ('queued','preparing','ready');
  return new;
end $$;
drop trigger if exists pos_cancelled_order_ticket on public.orders;
create trigger pos_cancelled_order_ticket after update of status on public.orders for each row
  when (new.status='cancelled' and old.status is distinct from new.status) execute function public.pos_cancel_order_ticket();

-- Helpers and gateway functions are never callable by guests or owner JWTs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,4)='pos_' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant execute on function public.pos_owner_action(uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
