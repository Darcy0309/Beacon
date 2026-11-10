-- The dashboard's Leads and Appointments tiles on Day (client, Nov 2026): the day's figures by the
-- hour, so the chart can name the hours along its foot. Counted as production_report() counts
-- them (pay_events, chargebacks aside), and for the same people: an administrator everyone (or
-- p_user), anyone else their own.
--
-- Safe to run again.

create or replace function public.production_hours(p_day date, p_user bigint default null)
returns table (hour integer, leads bigint, appointments bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
begin
  if p_day is null then
    raise exception 'Choose a day' using errcode = '22023';
  end if;
  return query
  select extract(hour from pe.created_at at time zone v_tz)::integer,
         count(*) filter (where pe.kind = 'lead'),
         count(*) filter (where pe.kind = 'appointment')
    from public.pay_events pe
   where pe.created_at >= (p_day::timestamp at time zone v_tz)
     and pe.created_at <  ((p_day + 1)::timestamp at time zone v_tz)
     and pe.user_id is not null and not pe.is_chargeback
     and pe.kind in ('lead', 'appointment')
     and (v_user is null or pe.user_id = v_user)
   group by 1
   order by 1;
end $$;
revoke execute on function public.production_hours(date, bigint) from public, anon;
grant execute on function public.production_hours(date, bigint) to authenticated;
