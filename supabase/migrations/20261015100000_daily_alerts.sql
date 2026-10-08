-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the two alert rules that had nothing behind them
--
--   xdate_30d      "X-date 30-day warning": each morning, every rep hears of
--                  the names they hold whose renewal is 30 days out (one
--                  notification: the name itself, or how many and which)
--   appt_reminder  "Appointment reminder": each morning, whoever set them
--                  hears of the day's appointments, and of tomorrow's still
--                  to confirm
--
-- Both go through notify_users(), so switching a rule off on the Alerts page
-- stops it and each send is logged there; and like every notification they
-- reach the bell, the desktop and push. Sent once a day each (alert_sends),
-- at 7 a.m. on the business's clock or the first hour after: pg_cron runs
-- run_daily_alerts() every hour.
-- ---------------------------------------------------------------------------

create table if not exists public.alert_sends (
  rule     text not null,
  key      text not null,
  sent_at  timestamptz not null default now(),
  primary key (rule, key)
);
alter table public.alert_sends enable row level security;   -- no policies: the jobs alone use it
revoke all on public.alert_sends from anon, authenticated;

/** The renewal-in-30-days warnings for the business's day `p_day`. Returns how many people were told. */
create or replace function public.send_xdate_warnings(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r     record;
  n     integer := 0;
  v_due date := p_day + 30;
begin
  for r in
    with due as (
      select l.id, l.company_name, coalesce(l.assigned_user_id, pa.ae_user_id) as rep
        from public.leads l
        join public.insurance_details i on i.lead_id = l.id
        left join public.call_results cr on cr.id = l.result_id
        -- Nobody holds it: whoever is on its project hears instead.
        left join lateral (select a.ae_user_id from public.project_assignments a
                            where a.project_id = l.project_id and l.assigned_user_id is null) pa on true
       where coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                              i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)) = v_due
         and (cr.id is null or cr.viable)          -- still worth a call: not off the list
    )
    select rep, count(*) as total, min(id) as first_id,
           (array_agg(company_name order by company_name))[1:5] as names
      from due where rep is not null
     group by rep
  loop
    if exists (select 1 from public.alert_sends where rule = 'xdate_30d' and key = r.rep || ':' || p_day) then
      continue;
    end if;
    insert into public.alert_sends (rule, key) values ('xdate_30d', r.rep || ':' || p_day);
    n := n + public.notify_users(
      array[r.rep], 'lead',
      case when r.total = 1 then 'X-date in 30 days: ' || r.names[1]
           else r.total || ' X-dates in 30 days' end,
      'Renewing ' || to_char(v_due, 'FMMon FMDD') ||
        case when r.total = 1 then '' else ': ' || array_to_string(r.names, ', ') ||
          case when r.total > 5 then ' and ' || (r.total - 5) || ' more' else '' end end,
      case when r.total = 1 then '/leads/' || r.first_id else '/work' end,
      'xdate_30d');
  end loop;
  return n;
end $$;

/** The appointment reminders for the business's day `p_day`. Returns how many people were told. */
create or replace function public.send_appointment_reminders(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    with live as (
      select a.user_id, a.appt_date, a.appt_time, a.confirmed_at, l.company_name
        from public.appointments a
        join public.leads l on l.id = a.lead_id
        left join public.appointment_statuses s on s.id = a.status_id
       where a.user_id is not null and a.invalid_at is null
         and coalesce(s.name, '') not in ('Cancelled', 'No Show', 'Invalid')
         and a.appt_date in (p_day, p_day + 1)
    )
    select user_id,
           count(*) filter (where appt_date = p_day) as today,
           count(*) filter (where appt_date = p_day + 1 and confirmed_at is null) as to_confirm,
           array_to_string((array_agg(coalesce(appt_time || ' ', '') || company_name order by appt_time)
                             filter (where appt_date = p_day))[1:5], ', ') as today_list,
           array_to_string((array_agg(company_name order by company_name)
                             filter (where appt_date = p_day + 1 and confirmed_at is null))[1:5], ', ') as confirm_list
      from live
     group by user_id
  loop
    if r.today = 0 and r.to_confirm = 0 then continue; end if;
    if exists (select 1 from public.alert_sends where rule = 'appt_reminder' and key = r.user_id || ':' || p_day) then
      continue;
    end if;
    insert into public.alert_sends (rule, key) values ('appt_reminder', r.user_id || ':' || p_day);
    n := n + public.notify_users(
      array[r.user_id], 'appointment',
      concat_ws(', ',
        case when r.today > 0 then r.today || ' appointment' || case when r.today = 1 then '' else 's' end || ' today' end,
        case when r.to_confirm > 0 then r.to_confirm || ' to confirm for tomorrow' end),
      concat_ws(' · ',
        case when r.today > 0 then 'Today: ' || r.today_list end,
        case when r.to_confirm > 0 then 'Confirm: ' || r.confirm_list end),
      '/calendar?view=day&d=' || p_day,
      'appt_reminder');
  end loop;
  return n;
end $$;

/**
 * Every hour: from 7 a.m. on the business's clock, today's X-date warnings
 * and appointment reminders, each to each person once (later runs that day
 * find them sent and send nothing).
 */
create or replace function public.run_daily_alerts()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone public.business_tz();
begin
  if extract(hour from v_now) < 7 then
    return 0;
  end if;
  return public.send_xdate_warnings(v_now::date) + public.send_appointment_reminders(v_now::date);
end $$;

revoke execute on function public.send_xdate_warnings(date) from public, anon, authenticated;
revoke execute on function public.send_appointment_reminders(date) from public, anon, authenticated;
revoke execute on function public.run_daily_alerts() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'daily-alerts';
select cron.schedule('daily-alerts', '5 * * * *', 'select public.run_daily_alerts()');

-- The Alerts page said these two were not sending yet; now they do.
update public.alert_rules set channel = 'inapp' where trigger in ('xdate_30d', 'appt_reminder');
