-- The morning's appointment reminder opens on its appointments (client, Nov 2026). "1 to confirm for
-- tomorrow" → Open calendar went to today's day view, where tomorrow's appointment isn't: the calendar
-- looked empty. Now it opens on the day that needs doing, those appointments highlighted (?a=<id>,…):
--   something to confirm   tomorrow, with each one still to confirm
--   only today's           today, with each of today's
-- Built on the function as it stands (follow-ups go to whoever was handed them, hand_over_work).
-- And the reminders of the last few days, still around, are pointed the same way.
--
-- Safe to run more than once.

create or replace function public.send_appointment_reminders(p_day date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  n integer := 0;
begin
  for r in
    with live as (
      select a.id, coalesce(a.follow_up_user_id, a.user_id) as user_id, a.appt_date, a.appt_time, a.confirmed_at, l.company_name
        from public.appointments a
        join public.leads l on l.id = a.lead_id and l.deleted_at is null
        left join public.appointment_statuses s on s.id = a.status_id
       where coalesce(a.follow_up_user_id, a.user_id) is not null and a.invalid_at is null and a.deleted_at is null
         and coalesce(s.name, '') not in ('Cancelled', 'No Show', 'Invalid')
         and a.appt_date in (p_day, p_day + 1)
    )
    select user_id,
           count(*) filter (where appt_date = p_day) as today,
           count(*) filter (where appt_date = p_day + 1 and confirmed_at is null) as to_confirm,
           array_to_string((array_agg(coalesce(appt_time || ' ', '') || company_name order by appt_time)
                             filter (where appt_date = p_day))[1:5], ', ') as today_list,
           array_to_string((array_agg(company_name order by company_name)
                             filter (where appt_date = p_day + 1 and confirmed_at is null))[1:5], ', ') as confirm_list,
           array_to_string((array_agg(id order by appt_time) filter (where appt_date = p_day))[1:25], ',') as today_ids,
           array_to_string((array_agg(id order by appt_time)
                             filter (where appt_date = p_day + 1 and confirmed_at is null))[1:25], ',') as confirm_ids
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
      -- The day that needs doing, with those appointments highlighted.
      case when r.to_confirm > 0
        then '/calendar?view=day&d=' || (p_day + 1) || '&a=' || r.confirm_ids
        else '/calendar?view=day&d=' || p_day || '&a=' || r.today_ids end,
      'appt_reminder');
  end loop;
  return n;
end $function$;

-- The reminders already sent these last days: to tomorrow's appointments still to confirm, when they
-- had some (else today's, highlighted).
with sent as (
  select n.id, n.user_id, substring(n.link from 'd=(\d{4}-\d{2}-\d{2})$')::date as day,
         n.title like '%to confirm for tomorrow%' as confirming
    from public.notifications n
   where n.kind = 'appointment'
     and n.link ~ '^/calendar\?view=day&d=\d{4}-\d{2}-\d{2}$'
     and (n.title like '%to confirm for tomorrow%' or n.title like '% today')
     and n.created_at > now() - interval '4 days'
),
pointed as (
  select s.id,
         '/calendar?view=day&d=' || case when s.confirming then s.day + 1 else s.day end
           || coalesce('&a=' || (select string_agg(a.id::text, ',' order by a.appt_time)
                                   from public.appointments a
                                  where coalesce(a.follow_up_user_id, a.user_id) = s.user_id
                                    and a.deleted_at is null and a.invalid_at is null
                                    and a.appt_date = case when s.confirming then s.day + 1 else s.day end
                                    and (not s.confirming or a.confirmed_at is null)), '') as link
    from sent s
)
update public.notifications n set link = p.link from pointed p where n.id = p.id and n.link is distinct from p.link;
