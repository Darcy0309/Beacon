-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the account manager's dashboard, rows two and three
-- (Sean, Oct 2026)
--
--   production_days(from, to)   each person's production day by day over a
--                               range (a day, a week, a pay period, a month):
--                               when they started using Lighthouse, calls,
--                               leads, appointments, minutes worked, goals.
--                               Everyone's for an administrator; anyone
--                               else, their own.
--   team_production(day)        every active account manager's leads and
--                               appointments for the day, for the Daily Team
--                               Production list every manager sees. Counts
--                               only: no pay, hours or calls.
--   move_appointment()          the person who set an appointment (or an
--                               administrator) moves it to another day or
--                               time, from the dashboard's calendar.
--   move_reminder()             one's own call-back reminder, not yet gone
--                               off, moved to another day or time.
-- ---------------------------------------------------------------------------

/**
 * Production per person and day from `p_from` to `p_to` (the business's
 * days): account managers always, and anyone else who worked or set a goal
 * in the range. A person with nothing in the range has one row with a null
 * day, so they are still listed. Counts as daily_production() does.
 */
create or replace function public.production_days(p_from date, p_to date)
returns table (
  user_id bigint, first_name text, last_name text, role text, day date,
  started_at timestamptz, calls bigint, leads bigint, appointments bigint,
  worked_minutes int, paid_minutes int, leads_goal int, appts_goal int
)
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), pr as (
    select p.user_id, p.day, sum(p.calls) as calls, sum(p.leads) as leads, sum(p.appointments) as appts
      from public.production_report(p_from, p_to) p
     group by 1, 2
  ), wd as (
    select w.user_id, w.day, w.worked, w.paid from public.work_days(p_from, p_to) w
  ), st as (
    select a.user_id, (a.minute at time zone z.tz)::date as day, min(a.minute) as started
      from public.work_activity a, z
     where a.minute >= (p_from::timestamp at time zone z.tz) and a.minute < ((p_to + 1)::timestamp at time zone z.tz)
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
       and (public.is_admin() or u.id = public.app_user_id())
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
$$;
revoke execute on function public.production_days(date, date) from public, anon;
grant execute on function public.production_days(date, date) to authenticated;

/**
 * Every active account manager's leads and appointments developed on the
 * day (the business's; today by default), as the production report counts
 * them, for staff: the Daily Team Production list. Counts only.
 */
create or replace function public.team_production(p_day date default null)
returns table (user_id bigint, first_name text, last_name text, leads bigint, appointments bigint)
language sql stable security definer set search_path = public as $$
  with d as (
    select coalesce(p_day, (now() at time zone public.business_tz())::date) as day, public.business_tz() as tz
  )
  select u.id, u.first_name, u.last_name,
         count(pe.id) filter (where pe.kind = 'lead'),
         count(pe.id) filter (where pe.kind = 'appointment')
    from d
    cross join public.users u
    left join public.pay_events pe
      on pe.user_id = u.id and pe.kind in ('lead', 'appointment') and not pe.is_chargeback
     and pe.created_at >= (d.day::timestamp at time zone d.tz)
     and pe.created_at <  ((d.day + 1)::timestamp at time zone d.tz)
   where public.is_staff() and public.mfa_satisfied()
     and u.role = 'manager' and u.status = 'active'
   group by u.id, u.first_name, u.last_name
   order by u.first_name, u.last_name, u.id;
$$;
revoke execute on function public.team_production(date) from public, anon;
grant execute on function public.team_production(date) to authenticated;

/** "9:30 am" -> "9:30 AM", or an error saying what a time looks like. */
create or replace function public.parse_clock_time(p_time text)
returns time
language plpgsql immutable set search_path = public as $$
begin
  if p_time is null or upper(btrim(p_time)) !~ '^(1[0-2]|0?[1-9]):[0-5]\d\s?(AM|PM)$' then
    raise exception 'Choose a time like 2:00 PM' using errcode = '22023';
  end if;
  return to_timestamp(upper(btrim(p_time)), 'HH12:MI AM')::time;
end $$;

/**
 * Move an appointment to another day and time ("2:00 PM", the business's
 * clock): the person who set it, or an administrator. Not one marked
 * invalid or already past, and not to a day already gone. A Scheduled one
 * becomes Rescheduled, as when it is moved from a call.
 */
create or replace function public.move_appointment(p_id bigint, p_date date, p_time text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_today date := (now() at time zone public.business_tz())::date;
  v_time  text;
  a       public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or v_me is null or not (a.user_id = v_me or public.is_admin()) then
    raise exception 'Only the person who set this appointment can move it' using errcode = '42501';
  end if;
  if a.invalid_at is not null then
    raise exception 'This appointment was marked invalid' using errcode = '22023';
  end if;
  if a.appt_date < v_today then
    raise exception 'This appointment has already passed' using errcode = '22023';
  end if;
  if p_date is null or p_date < v_today then
    raise exception 'Choose a day from today on' using errcode = '22023';
  end if;
  v_time := to_char(public.parse_clock_time(coalesce(p_time, a.appt_time)), 'FMHH12:MI AM');

  update public.appointments set
    appt_date = p_date,
    appt_time = v_time,
    status_id = case when status_id = (select id from public.appointment_statuses where name = 'Scheduled')
                      and (appt_date, coalesce(appt_time, '')) is distinct from (p_date, v_time)
                     then (select id from public.appointment_statuses where name = 'Rescheduled')
                     else status_id end,
    status_update_date = now()
  where id = a.id
  returning * into a;
  return jsonb_build_object('id', a.id, 'appt_date', a.appt_date, 'appt_time', a.appt_time);
end $$;
revoke execute on function public.move_appointment(bigint, date, text) from public, anon;
grant execute on function public.move_appointment(bigint, date, text) to authenticated;

/**
 * Move one of my call-back reminders that has not gone off to another day
 * and time ("2:00 PM", the business's clock), still ahead.
 */
create or replace function public.move_reminder(p_id bigint, p_date date, p_time text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
  r    public.reminders;
begin
  if p_date is null then
    raise exception 'Choose the day to be reminded' using errcode = '22023';
  end if;
  v_at := (p_date + public.parse_clock_time(p_time)) at time zone public.business_tz();
  if v_at < now() - interval '1 minute' then
    raise exception 'That time has already passed' using errcode = '22023';
  end if;
  select * into r from public.reminders where id = p_id and user_id = public.app_user_id() for update;
  if r.id is null then
    raise exception 'This is not one of your reminders' using errcode = '42501';
  end if;
  if r.sent_at is not null then
    raise exception 'This reminder has already gone off' using errcode = '22023';
  end if;
  update public.reminders set remind_at = v_at where id = r.id returning * into r;
  return jsonb_build_object('id', r.id, 'remind_at', r.remind_at);
end $$;
revoke execute on function public.move_reminder(bigint, date, text) from public, anon;
grant execute on function public.move_reminder(bigint, date, text) to authenticated;
