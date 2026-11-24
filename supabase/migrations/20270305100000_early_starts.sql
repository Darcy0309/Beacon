-- Early Starts (Sean and Darcy, Nov 2026: "their average first-call time in the business's local time, how many calls
-- they make before 9 AM local and how those turn out, and how long from their first call to their first lead. That's
-- the 'paying an hour for no results' piece"). On the Production Heat Map, by manager, with its filters.
--
--   early_starts(...)   for each manager over the days: the days they called; their first call's average time in the
--                       business's local time; their calls before 9 AM local and after, each with the leads and
--                       appointments they made; and, on the days they made a lead, the average minutes from their
--                       first call to their first lead.
--
-- A day is the business's (Lighthouse's) day; a call's hour is its business's local time (its lead's state, else its
-- project's time zone, else Lighthouse's). Administrators: every manager; a manager: their own, on the projects
-- they're assigned to. Safe to run more than once.

create or replace function public.early_starts(
  p_from date, p_to date,
  p_company bigint default null, p_project bigint default null, p_user bigint default null,
  p_sic text default null, p_state text default null
)
returns table(user_id bigint, name text, days bigint, avg_first_minute numeric,
              early_calls bigint, early_leads bigint, early_appts bigint,
              later_calls bigint, later_leads bigint, later_appts bigint,
              lead_days bigint, avg_minutes_to_lead numeric)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_tz text := public.business_tz();
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
end $$;
revoke execute on function public.early_starts(date, date, bigint, bigint, bigint, text, text) from public, anon;
grant execute on function public.early_starts(date, date, bigint, bigint, bigint, text, text) to authenticated;

notify pgrst, 'reload schema';
