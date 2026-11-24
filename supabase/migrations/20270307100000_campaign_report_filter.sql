-- Campaign Types phase 4 (Sean, Nov 2026: "dashboards/reports get a campaign-type filter, default Insurance, so IT
-- stats stay separate"). The campaign type a page is showing comes with each request as the X-Campaign-Type header
-- ('insurance', a campaign type's id, or 'all'), and the figures below count only its clients' projects:
--
--   campaign_companies()   the clients of the campaign type chosen (Insurance: those without one), or null for all
--                          (no header: every caller as before).
--
-- The administrator's dashboard (its tiles' hours, Active Clients, Conversion, the production chart) and the
-- Production Heat Map (with Early Starts) read it; the rest filter by client in the app. Each function as installed,
-- with that one condition more. rep_client_stats() takes no Sales Rep too (every client). Safe to run more than once.

create or replace function public.campaign_companies()
returns bigint[] language plpgsql stable security definer set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-campaign-type'), '');
begin
  if v is null or v = 'all' then return null; end if;
  -- Insurance: the clients without a campaign type (0 for a project without a client).
  if v = 'insurance' then
    return array(select c.id from public.companies c where c.campaign_type_id is null) || array[0::bigint];
  end if;
  if v ~ '^[1-9][0-9]{0,17}$' then
    return array(select c.id from public.companies c where c.campaign_type_id = v::bigint);
  end if;
  return null;
end $$;
revoke execute on function public.campaign_companies() from public, anon;
grant execute on function public.campaign_companies() to authenticated, service_role;

-- production_hours
CREATE OR REPLACE FUNCTION public.production_hours(p_day date, p_user bigint DEFAULT NULL::bigint, p_rep bigint DEFAULT NULL::bigint)
 RETURNS TABLE(hour integer, leads bigint, appointments bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
  v_rep  bigint := case when public.is_admin() then p_rep else null end;
  v_cos  bigint[] := public.campaign_companies();
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
     -- The campaign type chosen (Nov 2026).
     and (v_cos is null or pe.project_id in (select p.id from public.projects p where coalesce(p.company_id, 0) = any(v_cos)))
     and (v_rep is null or pe.project_id in (select p.id from public.projects p join public.companies c on c.id = p.company_id where c.sales_rep_id = v_rep))
   group by 1
   order by 1;
end $function$;

-- rep_client_stats
CREATE OR REPLACE FUNCTION public.rep_client_stats(p_rep bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cos bigint[] := public.campaign_companies();
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_clients', (select count(*) from public.companies c where c.status = 'active' and c.deleted_at is null
        and (p_rep is null or c.sales_rep_id = p_rep) and (v_cos is null or c.id = any(v_cos))),
    'project_leads', (select coalesce(jsonb_agg(n order by pid), '[]'::jsonb) from (
        select p.id as pid, (select count(*) from public.leads l where l.project_id = p.id and l.deleted_at is null) as n
          from public.projects p join public.companies c on c.id = p.company_id
         where (p_rep is null or c.sales_rep_id = p_rep) and (v_cos is null or c.id = any(v_cos))
           and p.deleted_at is null and c.deleted_at is null) x));
end $function$;

-- renewal_conversion
CREATE OR REPLACE FUNCTION public.renewal_conversion(p_year integer, p_rep bigint DEFAULT NULL::bigint)
 RETURNS TABLE(year integer, month integer, leads bigint, appointments bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
declare
  v_cos bigint[] := public.campaign_companies();
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
       and (v_cos is null or coalesce(p.company_id, 0) = any(v_cos))
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
end $function$;

-- production_chart
CREATE OR REPLACE FUNCTION public.production_chart(p_from date, p_to date, p_user bigint DEFAULT NULL::bigint, p_project bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_tz  text := public.business_tz();
  v_lo  timestamptz;
  v_hi  timestamptz;
  v     jsonb;
  v_cos bigint[] := public.campaign_companies();
begin
  if not public.is_admin() then
    raise exception 'Only an administrator sees the team''s production' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then
    raise exception 'Choose up to two years' using errcode = '22023';
  end if;
  v_lo := p_from::timestamp at time zone v_tz;
  v_hi := (p_to + 1)::timestamp at time zone v_tz;

  with ev as (
    select (pe.created_at at time zone v_tz)::date as d, extract(hour from pe.created_at at time zone v_tz)::int as h, pe.kind
      from public.pay_events pe
     where pe.kind in ('lead', 'appointment') and not pe.is_chargeback
       and pe.created_at >= v_lo and pe.created_at < v_hi
       and (p_user is null or pe.user_id = p_user)
       and (p_project is null or pe.project_id = p_project)
       and (v_cos is null or pe.project_id in (select p.id from public.projects p where coalesce(p.company_id, 0) = any(v_cos)))
  ), wm as (
    select w.user_id, w.day, sum(w.minutes)::numeric as m
      from public.work_minutes(p_from, p_to, p_user) w
     group by 1, 2
  ), calls as (
    select c.user_id, (c.call_date at time zone v_tz)::date as d, c.project_id, count(*)::numeric as n
      from public.call_records c
     where c.call_date >= v_lo and c.call_date < v_hi and c.project_id is not null
       and (p_user is null or c.user_id = p_user)
     group by 1, 2, 3
  ), kinds as (
    select p.id, t.code from public.projects p join public.project_types t on t.id = p.project_type_id
  ), share as (
    -- Each person-day's minutes, over the projects called that day by their calls…
    select wm.day, c.project_id, wm.m * c.n / sum(c.n) over (partition by wm.user_id, wm.day) as mins
      from wm join calls c on c.user_id = wm.user_id and c.d = wm.day
    union all
    -- …or, with no calls that day, over the projects they are assigned to.
    select wm.day, pa.project_id, wm.m / count(*) over (partition by wm.user_id, wm.day)
      from wm join public.project_assignments pa on pa.ae_user_id = wm.user_id
     where not exists (select 1 from calls c where c.user_id = wm.user_id and c.d = wm.day)
  ), worked as (
    select s.day,
           sum(s.mins) filter (where k.code = 'DBDV') as lead_minutes,
           sum(s.mins) filter (where k.code = 'APPT') as appt_minutes
      from share s join kinds k on k.id = s.project_id
     where (p_project is null or s.project_id = p_project)
       and (v_cos is null or s.project_id in (select p.id from public.projects p where coalesce(p.company_id, 0) = any(v_cos)))
     group by 1
  ), days as (
    select d from ev union select day from worked
  )
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', x.d,
               'leads', (select count(*) from ev where ev.d = x.d and ev.kind = 'lead'),
               'appts', (select count(*) from ev where ev.d = x.d and ev.kind = 'appointment'),
               'lead_minutes', round(coalesce(w.lead_minutes, 0)),
               'appt_minutes', round(coalesce(w.appt_minutes, 0))) order by x.d)
        from days x left join worked w on w.day = x.d), '[]'::jsonb),
    'hours', case when p_from = p_to then coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'leads', l, 'appts', a) order by h)
        from (select h, count(*) filter (where kind = 'lead') as l, count(*) filter (where kind = 'appointment') as a
                from ev group by h) q), '[]'::jsonb) end)
  into v;
  return v;
end $function$;

-- best_times
CREATE OR REPLACE FUNCTION public.best_times(p_from date, p_to date, p_company bigint DEFAULT NULL::bigint, p_project bigint DEFAULT NULL::bigint, p_user bigint DEFAULT NULL::bigint, p_sic text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_by text DEFAULT NULL::text)
 RETURNS TABLE(dim text, dim_label text, dow integer, hour integer, calls bigint, leads bigint, appts bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
declare
  v_tz text := public.business_tz();
  v_cos bigint[] := public.campaign_companies();
  -- A manager: the projects they're assigned to (an administrator: every project).
  v_mine bigint := case when public.is_admin() then null else public.app_user_id() end;
begin
  if not public.is_admin() and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'The Production Heat Map is for administrators and managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.call_date, cr.user_id, l.state, l.sic_code, t.code as type_code, cres.effect,
           coalesce(public.us_state_tz(l.state), z.iana, v_tz) as tz
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.project_types t on t.id = p.project_type_id
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
       and (v_cos is null or coalesce(p.company_id, 0) = any(v_cos))
       and (v_mine is null or p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_mine))
  ), local as (
    select case p_by
             when 'sic' then coalesce(nullif(left(replace(c.sic_code, '-', ''), 4), ''), '—')
             when 'state' then coalesce(nullif(upper(c.state), ''), '—')
             when 'type' then coalesce(c.type_code, '—')
             when 'manager' then coalesce(c.user_id::text, '—')
             else null end as dim,
           extract(isodow from c.call_date at time zone c.tz)::integer as dow,
           extract(hour from c.call_date at time zone c.tz)::integer as hour,
           c.effect
      from c
  )
  select x.dim,
         case p_by
           when 'sic' then (select s.description from public.sic_codes s where s.code = x.dim limit 1)
           when 'manager' then (select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') from public.users u where u.id::text = x.dim)
           when 'type' then case x.dim when 'APPT' then 'Appointment projects' when 'DBDV' then 'DB Dev projects' else x.dim end
           else x.dim end,
         x.dow, x.hour, count(*)::bigint,
         count(*) filter (where x.effect = 'promote')::bigint,
         count(*) filter (where x.effect = 'appointment')::bigint
    from local x
   group by x.dim, x.dow, x.hour
   order by x.dim nulls first, x.dow, x.hour;
end $function$;

-- early_starts
CREATE OR REPLACE FUNCTION public.early_starts(p_from date, p_to date, p_company bigint DEFAULT NULL::bigint, p_project bigint DEFAULT NULL::bigint, p_user bigint DEFAULT NULL::bigint, p_sic text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
 RETURNS TABLE(user_id bigint, name text, days bigint, avg_first_minute numeric, early_calls bigint, early_leads bigint, early_appts bigint, later_calls bigint, later_leads bigint, later_appts bigint, lead_days bigint, avg_minutes_to_lead numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
declare
  v_tz text := public.business_tz();
  v_cos bigint[] := public.campaign_companies();
  v_admin boolean := public.is_admin();
  v_me bigint := public.app_user_id();
begin
  if not v_admin and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'Early Starts is for administrators and managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.user_id as uid, cr.call_date,
           (cr.call_date at time zone v_tz)::date as day,
           cr.call_date at time zone coalesce(public.us_state_tz(l.state), z.iana, v_tz) as local_at,
           cres.effect
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.user_id is not null
       and cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
       and (v_cos is null or coalesce(p.company_id, 0) = any(v_cos))
       -- A manager: their own calls, on the projects they're assigned to.
       and (v_admin or (cr.user_id = v_me and p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_me)))
  ), daily as (
    -- Each manager's day: their first call (and its local time), and their first lead.
    select c.uid, c.day,
           min(c.call_date) as first_call,
           (array_agg(c.local_at order by c.call_date))[1] as first_local,
           min(c.call_date) filter (where c.effect = 'promote') as first_lead
      from c group by c.uid, c.day
  ), per as (
    select d.uid,
           count(*) as days,
           avg(extract(hour from d.first_local) * 60 + extract(minute from d.first_local)) as avg_first_minute,
           count(d.first_lead) as lead_days,
           avg(extract(epoch from (d.first_lead - d.first_call)) / 60) filter (where d.first_lead is not null) as avg_minutes_to_lead
      from daily d group by d.uid
  ), split as (
    select c.uid,
           count(*) filter (where extract(hour from c.local_at) < 9) as early_calls,
           count(*) filter (where extract(hour from c.local_at) < 9 and c.effect = 'promote') as early_leads,
           count(*) filter (where extract(hour from c.local_at) < 9 and c.effect = 'appointment') as early_appts,
           count(*) filter (where extract(hour from c.local_at) >= 9) as later_calls,
           count(*) filter (where extract(hour from c.local_at) >= 9 and c.effect = 'promote') as later_leads,
           count(*) filter (where extract(hour from c.local_at) >= 9 and c.effect = 'appointment') as later_appts
      from c group by c.uid
  )
  select p.uid, coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email),
         p.days, round(p.avg_first_minute, 1),
         s.early_calls, s.early_leads, s.early_appts, s.later_calls, s.later_leads, s.later_appts,
         p.lead_days, round(p.avg_minutes_to_lead, 1)
    from per p
    join split s on s.uid = p.uid
    join public.users u on u.id = p.uid
   order by p.avg_first_minute nulls last;
end $function$;

notify pgrst, 'reload schema';
