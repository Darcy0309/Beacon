-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the administrator's production chart (Sean, Oct 2026)
--
-- In place of Lead Volume (every lead loaded, a client's own lists too):
-- the leads and appointments the team developed, over a day (by the hour,
-- 5 AM – 6 PM) or a range, with the hours worked behind them, so the chart
-- can say how many of each were developed per hour, and against the monthly
-- goals administrators set. Company-wide, or one manager's, or one project's.
--
-- Hours are split by the kind of project they went to: a person's minutes
-- on a day are shared out over the projects they called that day, by their
-- calls (with no calls, over the projects they are assigned to), so lead
-- managers' (DB dev) and appointment managers' hours count apart, as
-- leads per hour and appointments per hour need. An appointment set on a
-- DB dev project still counts as an appointment.
--
--   production_goals     a month's goals: leads, appointments, and the rates
--                        per hour aimed for
--   production_chart()   per day (and, for one day, per hour): leads and
--                        appointments developed (pay events, as the
--                        production report counts them), minutes worked on
--                        lead projects and on appointment projects
-- ---------------------------------------------------------------------------

create table if not exists public.production_goals (
  month           date primary key check (extract(day from month) = 1),
  leads_goal      int check (leads_goal between 0 and 1000000),
  appts_goal      int check (appts_goal between 0 and 1000000),
  leads_per_hour  numeric(5, 2) check (leads_per_hour between 0 and 100),
  appts_per_hour  numeric(5, 2) check (appts_per_hour between 0 and 100),
  updated_by      bigint references public.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.production_goals enable row level security;
drop policy if exists production_goals_admin on public.production_goals;
create policy production_goals_admin on public.production_goals
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.production_goals;
create policy mfa_required on public.production_goals as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on public.production_goals from anon;
grant select, insert, update, delete on public.production_goals to authenticated;
grant all on public.production_goals to service_role;

/**
 * The team's production from `p_from` to `p_to` (the business's days), for
 * an administrator: everyone's, or one person's (`p_user`), or one
 * project's (`p_project`). Returns
 *   { days:  [{ day, leads, appts, lead_minutes, appt_minutes }],
 *     hours: [{ hour, leads, appts }]   (one day only) }
 */
create or replace function public.production_chart(p_from date, p_to date, p_user bigint default null, p_project bigint default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz  text := public.business_tz();
  v_lo  timestamptz;
  v_hi  timestamptz;
  v     jsonb;
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
     where p_project is null or s.project_id = p_project
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
end $$;
revoke execute on function public.production_chart(date, date, bigint, bigint) from public, anon;
grant execute on function public.production_chart(date, date, bigint, bigint) to authenticated;
