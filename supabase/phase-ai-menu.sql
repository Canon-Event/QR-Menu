-- Run after schema.sql. Independent of the POS/table-access migrations.
-- One transaction: safe to rerun, preserves existing menus and template choices.
begin;

alter table public.restaurants add column if not exists menu_presentation text not null default 'template'
  check (menu_presentation in ('template','basic'));
alter table public.restaurants add column if not exists basic_menu_style jsonb not null default
  '{"font":"manrope","accent":"#92400e","background":"#fffaf3","text":"#242424","density":"comfortable"}'::jsonb;

create table if not exists public.ai_menu_jobs (
  id uuid primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  draft jsonb,
  published jsonb,
  publish_fingerprint text,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.ai_menu_jobs enable row level security;
revoke all on public.ai_menu_jobs from public,anon,authenticated;
create index if not exists ai_menu_jobs_restaurant_time on public.ai_menu_jobs(restaurant_id,created_at desc);
create index if not exists ai_menu_jobs_time on public.ai_menu_jobs(created_at desc);

create or replace function public.ai_menu_begin(p_restaurant uuid,p_request uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.ai_menu_jobs; at_time timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not exists(select 1 from public.restaurants where id=p_restaurant and owner_id=auth.uid()) then
    raise exception 'Restaurant owner access required.' using errcode='42501';
  end if;
  if p_request is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid scan request.' using errcode='22023'; end if;
  -- Short global lock prevents quota races across users, processes and replicas.
  perform pg_advisory_xact_lock(hashtext('wiit-ai-menu-quota'));
  select * into j from public.ai_menu_jobs where id=p_request;
  if found then
    if j.restaurant_id<>p_restaurant or j.fingerprint<>p_fingerprint then
      return jsonb_build_object('http_status',409,'error','This scan identifier belongs to a different upload. Start a new scan.');
    end if;
    if j.status='ready' then return jsonb_build_object('id',j.id,'draft',j.draft,'published',j.published,'cached',true); end if;
    if j.status='processing' and j.created_at>at_time-interval '90 seconds' then
      return jsonb_build_object('http_status',409,'error','This scan is still processing. Wait before starting a new scan.','retry_after',15);
    end if;
    return jsonb_build_object('http_status',409,'error','This scan did not complete. Start a new scan.');
  end if;
  if (select count(*) from public.ai_menu_jobs where created_at>at_time-interval '1 minute')>=5
    or (select count(*) from public.ai_menu_jobs where restaurant_id=p_restaurant and created_at>at_time-interval '1 minute')>=2 then
    return jsonb_build_object('http_status',429,'error','Too many menu scans. Try again in a minute.','retry_after',60);
  end if;
  if (select count(*) from public.ai_menu_jobs where created_at>at_time-interval '24 hours')>=1000
    or (select count(*) from public.ai_menu_jobs where restaurant_id=p_restaurant and created_at>at_time-interval '24 hours')>=100 then
    return jsonb_build_object('http_status',429,'error','The daily menu scan allowance has been reached. Try tomorrow.','retry_after',86400);
  end if;
  insert into public.ai_menu_jobs(id,restaurant_id,fingerprint) values(p_request,p_restaurant,p_fingerprint);
  return jsonb_build_object('id',p_request,'reserved',true);
end $$;

-- Only our trusted server can finish a provider request. Failed attempts count toward quotas.
create or replace function public.ai_menu_complete(p_request uuid,p_draft jsonb default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_draft is not null and (jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>100000) then
    raise exception 'Invalid extraction.' using errcode='22023';
  end if;
  update public.ai_menu_jobs set status=case when p_draft is null then 'failed' else 'ready' end,draft=p_draft
    where id=p_request and status='processing';
  if not found then raise exception 'Scan no longer processing.' using errcode='22023'; end if;
end $$;

create or replace function public.ai_menu_state(p_restaurant uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.restaurants; j public.ai_menu_jobs;
begin
  select * into r from public.restaurants where id=p_restaurant and owner_id=auth.uid();
  if not found or auth.uid() is null then raise exception 'Restaurant owner access required.' using errcode='42501'; end if;
  select * into j from public.ai_menu_jobs where restaurant_id=r.id and status='ready' and published is null
    and created_at>clock_timestamp()-interval '7 days' order by created_at desc limit 1;
  return jsonb_build_object('style',r.basic_menu_style,'presentation',r.menu_presentation,
    'job',case when j.id is null then null else jsonb_build_object('id',j.id,'draft',j.draft) end);
end $$;

-- Validate tokens again at the DB boundary; clients cannot store executable styling.
create or replace function public.ai_menu_discard(p_restaurant uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.restaurants where id=p_restaurant and owner_id=auth.uid()) then raise exception 'Restaurant owner access required.' using errcode='42501'; end if;
  update public.ai_menu_jobs set status='failed',draft=null where id=p_request and restaurant_id=p_restaurant and published is null and status='ready';
  return jsonb_build_object('discarded',true);
end $$;

create or replace function public.ai_menu_valid_style(p_style jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_typeof(p_style)='object' and p_style->>'font' in ('manrope','poppins','playfair')
    and p_style->>'density' in ('compact','comfortable')
    and p_style->>'accent' ~ '^#[a-fA-F0-9]{6}$' and p_style->>'background' ~ '^#[a-fA-F0-9]{6}$'
    and p_style->>'text' ~ '^#[a-fA-F0-9]{6}$'
    and (not (p_style ? 'layout') or p_style->>'layout' in ('editorial','cards'))
    and (not (p_style ? 'backdrop') or p_style->>'backdrop' in ('glow','dots','grid','none'))
    and (not (p_style ? 'motion') or p_style->>'motion' in ('none','gentle'))
    and (not (p_style ? 'showImages') or jsonb_typeof(p_style->'showImages')='boolean')
    and (not (p_style ? 'tagline') or (jsonb_typeof(p_style->'tagline')='string'
      and length(p_style->>'tagline')<=100 and p_style->>'tagline' !~ '[[:cntrl:]]'))
    and (not (p_style ? 'heroImage') or (jsonb_typeof(p_style->'heroImage')='string'
      and length(p_style->>'heroImage')<=2048 and (
        p_style->>'heroImage' in ('','/templates/green-bistro/cover-food.jpg','/templates/green-bistro/pasta.jpg','/templates/green-bistro/burrata.jpg')
        or p_style->>'heroImage' ~ '^https://[^/@[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$')))
    and p_style - array['font','density','accent','background','text','layout','backdrop','motion','showImages','tagline','heroImage'] = '{}'::jsonb,false)
$$;

create or replace function public.ai_menu_configure(p_restaurant uuid,p_style jsonb,p_presentation text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.restaurants where id=p_restaurant and owner_id=auth.uid()) then raise exception 'Restaurant owner access required.' using errcode='42501'; end if;
  if not public.ai_menu_valid_style(p_style) or p_presentation is null or p_presentation not in ('template','basic') then raise exception 'Invalid menu style.' using errcode='22023'; end if;
  update public.restaurants set basic_menu_style=p_style,menu_presentation=p_presentation where id=p_restaurant;
  return jsonb_build_object('saved',true);
end $$;

create or replace function public.ai_menu_publish(p_restaurant uuid,p_request uuid,p_draft jsonb,p_style jsonb,p_basic boolean,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  j public.ai_menu_jobs; r public.restaurants; item jsonb; cat uuid; category_order int; dish_order int;
  signature text; result jsonb; imported int:=0; created_categories int:=0;
begin
  -- Lock the restaurant before the job: consistent ordering serializes concurrent imports.
  select * into r from public.restaurants where id=p_restaurant and owner_id=auth.uid() for update;
  if not found or auth.uid() is null then raise exception 'Restaurant owner access required.' using errcode='42501'; end if;
  select * into j from public.ai_menu_jobs where id=p_request and restaurant_id=p_restaurant for update;
  if not found or j.status<>'ready' then raise exception 'A completed scan is required.' using errcode='22023'; end if;
  if p_reviewed is distinct from true or p_basic is null or not public.ai_menu_valid_style(p_style) then raise exception 'Review the draft and menu style first.' using errcode='22023'; end if;
  signature:=md5(jsonb_build_object('draft',p_draft,'style',p_style,'basic',p_basic)::text);
  if j.published is not null then
    if j.publish_fingerprint<>signature then return jsonb_build_object('http_status',409,'error','This scan has already been published with different edits.'); end if;
    return j.published || '{"replayed":true}'::jsonb;
  end if;
  if jsonb_typeof(p_draft) is distinct from 'object' or octet_length(p_draft::text)>100000
    or p_draft->>'currency' is distinct from r.currency or jsonb_typeof(p_draft->'items') is distinct from 'array' then
    raise exception 'Invalid draft or menu currency.' using errcode='22023';
  end if;
  if jsonb_array_length(p_draft->'items') not between 1 and 100 then raise exception 'Import 1–100 dishes.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_draft->'items') v group by lower(btrim(v->>'category')),lower(btrim(v->>'name')) having count(*)>1) then
    raise exception 'Duplicate dishes in the draft. Rename sizes or remove duplicates.' using errcode='22023';
  end if;
  select coalesce(max(sort_order),-1)+1 into category_order from public.categories where restaurant_id=r.id;
  select coalesce(max(sort_order),-1)+1 into dish_order from public.dishes where restaurant_id=r.id;
  for item in select value from jsonb_array_elements(p_draft->'items') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'name') is distinct from 'string'
      or length(btrim(item->>'name')) not between 1 and 120 or jsonb_typeof(item->'category') is distinct from 'string'
      or length(btrim(item->>'category')) not between 1 and 80 or jsonb_typeof(item->'description') is distinct from 'string'
      or length(item->>'description')>500 or jsonb_typeof(item->'isVeg') is distinct from 'boolean'
      or jsonb_typeof(item->'price') is distinct from 'number' then
      raise exception 'Every dish needs a valid name, category, description, price and dietary label.' using errcode='22023';
    end if;
    if (item->>'price')::numeric not between 0 and 1000000 or (item->>'price')::numeric<>round((item->>'price')::numeric,2) then raise exception 'Invalid dish price.' using errcode='22023'; end if;
    select id into cat from public.categories where restaurant_id=r.id and lower(btrim(name))=lower(btrim(item->>'category')) order by sort_order,id limit 1;
    if cat is null then
      insert into public.categories(restaurant_id,name,sort_order) values(r.id,btrim(item->>'category'),category_order) returning id into cat;
      category_order:=category_order+1; created_categories:=created_categories+1;
    end if;
    if exists(select 1 from public.dishes where restaurant_id=r.id and category_id=cat and lower(btrim(name))=lower(btrim(item->>'name'))) then
      raise exception 'A dish with this name already exists in that category. Edit or remove it from the draft.' using errcode='23505';
    end if;
    insert into public.dishes(restaurant_id,category_id,name,description,price,is_veg,is_available,sort_order)
      values(r.id,cat,btrim(item->>'name'),nullif(btrim(item->>'description'),''),(item->>'price')::numeric,(item->>'isVeg')::boolean,true,dish_order);
    dish_order:=dish_order+1; imported:=imported+1;
  end loop;
  update public.restaurants set basic_menu_style=p_style,menu_presentation=case when p_basic then 'basic' else menu_presentation end where id=r.id;
  result:=jsonb_build_object('imported',imported,'categories',created_categories,'menu_url','/menu/'||r.slug);
  update public.ai_menu_jobs set published=result,publish_fingerprint=signature where id=j.id;
  return result;
end $$;

revoke all on function public.ai_menu_begin(uuid,uuid,text),public.ai_menu_complete(uuid,jsonb),public.ai_menu_state(uuid),
  public.ai_menu_configure(uuid,jsonb,text),public.ai_menu_publish(uuid,uuid,jsonb,jsonb,boolean,boolean),public.ai_menu_valid_style(jsonb) from public,anon,authenticated;
revoke all on function public.ai_menu_discard(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_menu_begin(uuid,uuid,text),public.ai_menu_state(uuid),public.ai_menu_configure(uuid,jsonb,text),
  public.ai_menu_publish(uuid,uuid,jsonb,jsonb,boolean,boolean) to authenticated;
grant execute on function public.ai_menu_complete(uuid,jsonb) to service_role;
-- The authenticated API scopes private draft edits to the owner before using this role.
grant select,update on public.ai_menu_jobs to service_role;
grant execute on function public.ai_menu_discard(uuid,uuid) to authenticated;
commit;
