-- Apply after phase-pos.sql. Collections, invoice values and tax are distinct.
begin;
create or replace function public.reporting_authorize(r uuid) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.restaurants where id=r and owner_id=auth.uid()) then raise exception 'Report access denied.' using errcode='42501'; end if; end $$;
create or replace function public.restaurant_financial_report(p_restaurant_id uuid,p_start timestamptz default null,p_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid:=p_restaurant_id; collected bigint; refunded bigint; invoiced bigint; credited bigint; due bigint; excess bigint;
begin
  perform public.reporting_authorize(r);
  if p_start is not null and p_end is not null and p_end<=p_start then raise exception 'Invalid report period.' using errcode='22023'; end if;
  select coalesce(sum(amount_paise),0) into collected from public.pos_payments where restaurant_id=r and (p_start is null or created_at>=p_start) and (p_end is null or created_at<p_end);
  select coalesce(sum(amount_paise),0) into refunded from public.pos_refunds where restaurant_id=r and state='processed' and (p_start is null or processed_at>=p_start) and (p_end is null or processed_at<p_end);
  select coalesce(sum(total_paise),0) into invoiced from public.pos_bills where restaurant_id=r and (p_start is null or issued_at>=p_start) and (p_end is null or issued_at<p_end);
  select coalesce(sum(amount_paise),0) into credited from public.pos_credits where restaurant_id=r and (p_start is null or created_at>=p_start) and (p_end is null or created_at<p_end);
  select coalesce(sum((s->>'balance_paise')::bigint),0),coalesce(sum((s->>'overpaid_paise')::bigint),0) into due,excess from
    (select public.pos_bill_data(id) s from public.pos_bills where restaurant_id=r) b;
  return jsonb_build_object('currency','INR','collected_paise',collected,'refunded_paise',refunded,'net_collected_paise',collected-refunded,
    'invoiced_paise',invoiced,'credited_paise',credited,'net_invoiced_paise',invoiced-credited,'outstanding_paise',due,'overpaid_paise',excess,
    'cash_paise',coalesce((select sum(amount_paise) from public.pos_payments where restaurant_id=r and method='cash' and (p_start is null or created_at>=p_start) and (p_end is null or created_at<p_end)),0),
    'online_paise',coalesce((select sum(amount_paise) from public.pos_payments where restaurant_id=r and method='razorpay' and (p_start is null or created_at>=p_start) and (p_end is null or created_at<p_end)),0));
end $$;
revoke all on function public.reporting_authorize(uuid) from public,anon,authenticated;
revoke all on function public.restaurant_financial_report(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.restaurant_financial_report(uuid,timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
