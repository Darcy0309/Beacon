-- The administrator's dashboard tiles (Sean, Nov 2026):
--
--   A Sales Rep to show: the Leads and Appointments tiles count what the managers developed on that rep's
--   clients' projects (production_hours gains p_rep, for a day by the hour), and Active Clients counts their
--   clients (rep_client_stats).
--
--   Conversion by renewal month (renewal_conversion): "how many appts did we set vs leads that have/had a Jan
--   renewal month … this year vs last year … all or by sales rep clients". For a renewal month M of a year Y:
--     leads         the leads on appointment projects whose renewal month is M (their Ultimate X-date, else
--                   their soonest line's), developed before M/Y was out, and not closed out before its calling
--                   window began (still in the pipeline for that renewal);
--     appointments  those of them with an appointment set in its calling window: the four months before M/Y
--                   and M/Y itself (as the Match Tool's "renew in the next four months").
--   By renewal month, not the date itself: renewal dates are moved on a year as they come round.
--
-- Administrators only. Safe to run more than once.

drop function if exists public.production_hours(date, bigint);
create or replace function public.production_hours(p_day date, p_user bigint default null, p_rep bigint default null)
 returns table(hour integer, leads bigint, appointments bigint)
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
  v_rep  bigint := case when public.is_admin() then p_rep else null end;
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
     -- A Sales Rep's clients' projects (Nov 2026).
     and (v_rep is null or pe.project_id in (select p.id from public.projects p join public.companies c on c.id = p.company_id where c.sales_rep_id = v_rep))
   group by 1
   order by 1;
end $function$;
grant execute on function public.production_hours(date, bigint, bigint) to authenticated;

-- A Sales Rep's clients for the Active Clients tile: how many are active, and each of their projects' leads.
create or replace function public.rep_client_stats(p_rep bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_clients', (select count(*) from public.companies c where c.status = 'active' and c.deleted_at is null and c.sales_rep_id = p_rep),
    'project_leads', (select coalesce(jsonb_agg(n order by pid), '[]'::jsonb) from (
        select p.id as pid, (select count(*) from public.leads l where l.project_id = p.id and l.deleted_at is null) as n
          from public.projects p join public.companies c on c.id = p.company_id
         where c.sales_rep_id = p_rep and p.deleted_at is null and c.deleted_at is null) x));
end $$;
grant execute on function public.rep_client_stats(bigint) to authenticated;

create or replace function public.renewal_conversion(p_year integer, p_rep bigint default null)
returns table(year integer, month integer, leads bigint, appointments bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Choose a year' using errcode = '22023';
  end if;
  return query
  with cohorts as (
    -- Each renewal month of the year chosen and the year before, with its calling window.
    select y::int as year, m::int as month,
           (make_date(y::int, m::int, 1) - interval '4 months')::date as opens,
           (make_date(y::int, m::int, 1) + interval '1 month')::date as closes
      from generate_series(p_year - 1, p_year) y, generate_series(1, 12) m
  ), pipeline as (
    -- The leads on appointment projects (a Sales Rep's clients' only, when one is chosen), each with its renewal month.
    select l.id, coalesce(l.promoted_at, l.created_at) as developed, l.resolved_at,
           extract(month from r.renewal)::int as month
      from public.leads l
      join public.projects p on p.id = l.project_id and p.deleted_at is null
      join public.project_types t on t.id = p.project_type_id and t.code = 'APPT'
      left join public.companies c on c.id = p.company_id
      cross join lateral (
        select min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                     i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
          from public.insurance_details i where i.lead_id = l.id
      ) r
     where l.deleted_at is null and l.stage = 'appt' and r.renewal is not null
       and (p_rep is null or c.sales_rep_id = p_rep)
  ), set_on as (
    -- When each of those leads had an appointment set (not one found invalid).
    select a.lead_id, a.appt_create_date as at
      from public.appointments a
     where a.deleted_at is null and a.invalid_at is null and a.lead_id in (select id from pipeline)
  )
  select k.year, k.month,
         count(pl.id)::bigint,
         count(pl.id) filter (where exists (
           select 1 from set_on s where s.lead_id = pl.id and s.at >= k.opens and s.at < k.closes))::bigint
    from cohorts k
    left join pipeline pl on pl.month = k.month
                         and pl.developed < k.closes
                         and (pl.resolved_at is null or pl.resolved_at >= k.opens)
   group by k.year, k.month
   order by k.year, k.month;
end $$;
revoke execute on function public.renewal_conversion(integer, bigint) from public, anon;
grant execute on function public.renewal_conversion(integer, bigint) to authenticated;

notify pgrst, 'reload schema';
