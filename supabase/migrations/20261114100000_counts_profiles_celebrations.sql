-- Lighthouse CRM — counting leads as leads, more on each person, and their
-- birthdays and work anniversaries (Sean, Oct 2026).
--
--   projects_lead_stats()   every project's figures at once, as lead_stats()
--                           counts one: its leads (an appointment project's
--                           own; a DB dev project's, those it developed and
--                           sent on), what is still to call (names on a DB
--                           dev project, leads on an appointment project),
--                           and a total row (project_id null), each lead
--                           once. The Projects page's tiles and Leads column
--                           counted every name loaded instead.
--   user_workload           adds names_left (DB dev names a person holds,
--                           still to call) and leads_held (leads they hold);
--                           lead_count, every record held, stays as it was.
--   users                   timezone_id, birth_date and start_date (the day
--                           they started: a manager's hire date).
--   send_celebrations()     each morning, every active manager and
--                           administrator hears of a colleague's birthday or
--                           work anniversary that day ("Happy 5 yr work
--                           anniversary Kristy W"). Run by run_daily_alerts()
--                           (pg_cron, hourly from 7 a.m.), once a day each;
--                           switched off with its rule on the Alerts page.

create or replace function public.projects_lead_stats()
returns table(project_id bigint, names bigint, names_left bigint, leads bigint, leads_active bigint, developed bigint)
language sql stable set search_path = public as $$
  with scoped as (
    -- A project's names: those on it, and those it sent on to another (as lead_stats() has them).
    select p.id as pid, c.*, (c.project_id = p.id) as here
      from public.projects p join public.lead_classes c
        on c.project_id = p.id or (c.source_project_id = p.id and c.source_project_id <> c.project_id)
  )
  select pid, count(*),
         count(*) filter (where here and stage = 'dbdev' and viable),
         count(*) filter (where stage = 'appt'),
         count(*) filter (where stage = 'appt' and viable),
         count(*) filter (where developed)
    from scoped group by pid
  union all
  -- Every lead once, whichever projects it passed through.
  select null, count(*),
         count(*) filter (where stage = 'dbdev' and viable),
         count(*) filter (where stage = 'appt'),
         count(*) filter (where stage = 'appt' and viable),
         count(*) filter (where developed)
    from public.lead_classes;
$$;
revoke execute on function public.projects_lead_stats() from public, anon;
grant execute on function public.projects_lead_stats() to authenticated;

-- Added at the end: a view keeps its columns in order when it is replaced.
create or replace view public.user_workload with (security_invoker = true) as
  select u.id as user_id,
    (select count(*) from public.leads l where l.assigned_user_id = u.id) as lead_count,
    (select count(*) from public.appointments a where a.user_id = u.id and a.invalid_at is null) as appt_count,
    (select count(*) from public.lead_classes c join public.leads l on l.id = c.id
      where l.assigned_user_id = u.id and c.stage = 'dbdev' and c.viable) as names_left,
    (select count(*) from public.leads l where l.assigned_user_id = u.id and l.stage = 'appt') as leads_held
  from public.users u;
grant select on public.user_workload to authenticated;

alter table public.users
  add column if not exists timezone_id bigint references public.timezones(id),
  add column if not exists birth_date date check (birth_date between date '1900-01-01' and date '2100-01-01'),
  add column if not exists start_date date check (start_date between date '1950-01-01' and date '2100-01-01');

insert into public.alert_rules (name, trigger, channel)
select 'Birthdays and work anniversaries', 'celebrations', 'inapp'
 where not exists (select 1 from public.alert_rules where trigger = 'celebrations');

/**
 * The day's birthdays and work anniversaries (`p_day`, the business's day):
 * one notification each to every active manager and administrator, the one
 * celebrated too. A birthday on Feb 29 is kept on Feb 28 in other years.
 * Returns how many were told.
 */
create or replace function public.send_celebrations(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r      record;
  n      integer := 0;
  v_team bigint[];
  v_leap boolean := extract(month from p_day) = 2 and extract(day from p_day) = 28
                    and not (extract(year from p_day)::int % 4 = 0 and (extract(year from p_day)::int % 100 <> 0 or extract(year from p_day)::int % 400 = 0));
begin
  select coalesce(array_agg(id), '{}') into v_team
    from public.users where role in ('admin', 'manager') and status = 'active' and deleted_at is null;
  if cardinality(v_team) = 0 then
    return 0;
  end if;
  for r in
    select u.id, 'birthday' as what, null::int as years,
           concat_ws(' ', u.first_name, left(nullif(u.last_name, ''), 1)) as who
      from public.users u
     where u.role in ('admin', 'manager') and u.status = 'active' and u.deleted_at is null and u.birth_date is not null
       and ((extract(month from u.birth_date) = extract(month from p_day) and extract(day from u.birth_date) = extract(day from p_day))
            or (v_leap and extract(month from u.birth_date) = 2 and extract(day from u.birth_date) = 29))
    union all
    select u.id, 'anniversary', extract(year from p_day)::int - extract(year from u.start_date)::int,
           concat_ws(' ', u.first_name, left(nullif(u.last_name, ''), 1))
      from public.users u
     where u.role in ('admin', 'manager') and u.status = 'active' and u.deleted_at is null and u.start_date is not null
       and u.start_date < p_day
       and ((extract(month from u.start_date) = extract(month from p_day) and extract(day from u.start_date) = extract(day from p_day))
            or (v_leap and extract(month from u.start_date) = 2 and extract(day from u.start_date) = 29))
  loop
    if exists (select 1 from public.alert_sends where rule = 'celebrations' and key = r.what || ':' || r.id || ':' || p_day) then
      continue;
    end if;
    insert into public.alert_sends (rule, key) values ('celebrations', r.what || ':' || r.id || ':' || p_day);
    n := n + public.notify_users(
      v_team, 'system',
      case when r.what = 'birthday' then 'Happy Birthday ' || r.who || '!'
           else 'Happy ' || r.years || ' yr work anniversary ' || r.who || '!' end,
      case when r.what = 'birthday' then 'Wish them a happy birthday today.'
           else r.years || case when r.years = 1 then ' year' else ' years' end || ' with the team today.' end,
      null, 'celebrations');
  end loop;
  return n;
end $$;
revoke execute on function public.send_celebrations(date) from public, anon, authenticated;

create or replace function public.run_daily_alerts()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone public.business_tz();
begin
  if extract(hour from v_now) < 7 then
    return 0;
  end if;
  return public.send_xdate_warnings(v_now::date) + public.send_appointment_reminders(v_now::date)
       + public.send_celebrations(v_now::date);
end $$;
revoke execute on function public.run_daily_alerts() from public, anon, authenticated;
