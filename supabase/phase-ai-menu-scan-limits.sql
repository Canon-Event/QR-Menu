-- Existing installations: run in Supabase SQL Editor after phase-ai-menu.sql.
-- Raises daily limits from 6 to 100 per restaurant and 50 to 1000 globally.
-- Preserves all drafts, dishes, scan history and permissions. Safe to rerun.
-- Refresh the importer afterwards to clear any previous 24-hour countdown.
begin;

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

commit;
