-- A manager's dashboard, opened from Daily Production, slow to come up (client, Nov 2026). Daily Production and
-- the hours worked (work_minutes(), under work_days()) read the business's clock from a CTE, so the time window
-- was not one an index could use: every minute of work_activity ever kept, and every call, read to find the
-- day's. Each now works its window out first (plpgsql), and the date indexes these "everyone's day" questions
-- need are added. Same answers, same signatures.
--
-- Safe to run more than once.

create index if not exists work_activity_minute on public.work_activity (minute);
create index if not exists call_records_call_date on public.call_records (call_date);
create index if not exists pay_events_created_at on public.pay_events (created_at);

create or replace function public.work_minutes(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, day date, hour integer, minutes integer)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare
  v_rules   jsonb   := public.pay_rules()->'time';
  v_tz      text    := public.business_tz();
  v_idle    int     := greatest(coalesce((v_rules->>'idle_minutes')::int, 5), 0);
  v_cap     int     := greatest(coalesce((v_rules->>'call_minutes')::int, 30), 0);
  v_t0      timestamptz := (p_from::timestamp at time zone v_tz);
  v_t1      timestamptz := ((p_to + 1)::timestamp at time zone v_tz);
  v_uid     bigint  := case when public.is_admin() then p_user else public.app_user_id() end;
  v_allowed boolean := public.is_admin() or public.app_user_id() is not null;
  v_from    timestamptz := v_t0 - make_interval(mins => v_idle);
  v_calls   timestamptz := v_t0 - make_interval(mins => v_cap);
begin
  if not v_allowed then return; end if;
  return query
  with marks as (
    select a.user_id as uid, a.minute as m
      from public.work_activity a
     where a.minute >= v_from and a.minute < v_t1
       and (v_uid is null or a.user_id = v_uid)
    union
    select c.user_id, date_trunc('minute', c.call_date)
      from public.call_records c
     where c.call_date >= v_from and c.call_date < v_t1
       and c.user_id is not null and (v_uid is null or c.user_id = v_uid)
    union
    select a.user_id, gs.m
      from public.work_activity a
      cross join lateral (
        select min(c.call_date) as ended
          from public.call_records c
         where c.user_id = a.user_id and c.lead_id = a.lead_id
           and c.call_date >= a.at and c.call_date <= a.at + make_interval(mins => v_cap)
      ) e
      cross join lateral generate_series(a.minute, date_trunc('minute', e.ended), interval '1 minute') as gs(m)
     where a.kind = 'call' and v_cap > 0 and e.ended is not null
       and a.minute >= v_calls and a.minute < v_t1
       and (v_uid is null or a.user_id = v_uid)
  ), ordered as (
    select d.uid, d.m, lag(d.m) over (partition by d.uid order by d.m) as prev
      from (select distinct mk.uid, mk.m from marks mk) d
  ), covered as (
    select o.uid, o.m from ordered o
    union
    select o.uid, gs.m
      from ordered o
      cross join lateral generate_series(o.prev + interval '1 minute', o.m - interval '1 minute', interval '1 minute') as gs(m)
     where o.prev is not null and o.m - o.prev <= make_interval(mins => v_idle)
  )
  select c.uid, (c.m at time zone v_tz)::date, extract(hour from c.m at time zone v_tz)::int, count(*)::int
    from covered c
   where c.m >= v_t0 and c.m < v_t1
   group by 1, 2, 3;
end $$;

create or replace function public.daily_production(p_day date default null)
returns table (user_id bigint, first_name text, last_name text, role text, started_at timestamptz, calls bigint, leads bigint,
               appointments bigint, worked_minutes integer, paid_minutes integer, leads_goal integer, appts_goal integer)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare
  v_tz  text := public.business_tz();
  v_day date := coalesce(p_day, (now() at time zone public.business_tz())::date);
  v_t0  timestamptz := (v_day::timestamp at time zone v_tz);
  v_t1  timestamptz := ((v_day + 1)::timestamp at time zone v_tz);
  v_admin boolean := public.is_admin();
  v_me  bigint := public.app_user_id();
begin
  return query
  with pr as (
    select p.user_id, sum(p.calls)::bigint as calls, sum(p.leads)::bigint as leads, sum(p.appointments)::bigint as appts
      from public.production_report(v_day, v_day) p
     group by 1
  ), wd as (
    select w.user_id, w.worked, w.paid from public.work_days(v_day, v_day) w
  ), st as (
    select a.user_id, min(a.minute) as started
      from public.work_activity a
     where a.minute >= v_t0 and a.minute < v_t1
     group by 1
  ), people as (
    select u.id, u.first_name, u.last_name, u.role
      from public.users u
     where u.status = 'active'
       and (v_admin or u.id = v_me)
       and (u.role = 'manager'
            or u.id in (select st.user_id from st) or u.id in (select pr.user_id from pr))
  )
  select p.id, p.first_name, p.last_name, p.role, st.started,
         coalesce(pr.calls, 0), coalesce(pr.leads, 0), coalesce(pr.appts, 0),
         coalesce(wd.worked, 0), coalesce(wd.paid, 0), g.leads_goal, g.appts_goal
    from people p
    left join pr on pr.user_id = p.id
    left join wd on wd.user_id = p.id
    left join st on st.user_id = p.id
    left join public.daily_goals g on g.user_id = p.id and g.day = v_day
   order by p.first_name, p.last_name, p.id;
end $$;

create or replace function public.production_days(p_from date, p_to date)
returns table (user_id bigint, first_name text, last_name text, role text, day date, started_at timestamptz, calls bigint,
               leads bigint, appointments bigint, worked_minutes integer, paid_minutes integer, leads_goal integer, appts_goal integer)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare
  v_tz  text := public.business_tz();
  v_t0  timestamptz := (p_from::timestamp at time zone v_tz);
  v_t1  timestamptz := ((p_to + 1)::timestamp at time zone v_tz);
  v_admin boolean := public.is_admin();
  v_me  bigint := public.app_user_id();
begin
  return query
  with pr as (
    select p.user_id, p.day, sum(p.calls)::bigint as calls, sum(p.leads)::bigint as leads, sum(p.appointments)::bigint as appts
      from public.production_report(p_from, p_to) p
     group by 1, 2
  ), wd as (
    select w.user_id, w.day, w.worked, w.paid from public.work_days(p_from, p_to) w
  ), st as (
    select a.user_id, (a.minute at time zone v_tz)::date as day, min(a.minute) as started
      from public.work_activity a
     where a.minute >= v_t0 and a.minute < v_t1
     group by 1, 2
  ), g as (
    select g.user_id, g.day, g.leads_goal, g.appts_goal
      from public.daily_goals g
     where g.day between p_from and p_to
  ), days as (
    select pr.user_id, pr.day from pr
    union select wd.user_id, wd.day from wd
    union select st.user_id, st.day from st
    union select g.user_id, g.day from g
  ), people as (
    select u.id, u.first_name, u.last_name, u.role
      from public.users u
     where u.status = 'active'
       and (v_admin or u.id = v_me)
       and (u.role = 'manager' or u.id in (select days.user_id from days))
  )
  select p.id, p.first_name, p.last_name, p.role, x.day, st.started,
         coalesce(pr.calls, 0), coalesce(pr.leads, 0), coalesce(pr.appts, 0),
         coalesce(wd.worked, 0), coalesce(wd.paid, 0), g.leads_goal, g.appts_goal
    from people p
    left join days x on x.user_id = p.id
    left join pr on pr.user_id = p.id and pr.day = x.day
    left join wd on wd.user_id = p.id and wd.day = x.day
    left join st on st.user_id = p.id and st.day = x.day
    left join g  on g.user_id  = p.id and g.day  = x.day
   order by p.first_name, p.last_name, p.id, x.day;
end $$;

revoke execute on function public.work_minutes(date, date, bigint) from public, anon;
grant execute on function public.work_minutes(date, date, bigint) to authenticated;
revoke execute on function public.daily_production(date) from public, anon;
grant execute on function public.daily_production(date) to authenticated;
revoke execute on function public.production_days(date, date) from public, anon;
grant execute on function public.production_days(date, date) to authenticated;
