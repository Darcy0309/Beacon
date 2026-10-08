-- ---------------------------------------------------------------------------
-- Lighthouse CRM — "Open calendar" points at the appointment
--
-- An "Appointment set" or "Appointment confirmed" notification opened the
-- calendar on the right day; its link now also names the appointment
-- (/calendar?view=day&d=<date>&a=<id>), and the calendar highlights it.
-- Notifications already sent get the same, where the appointment can be told
-- from its day and company name.
-- ---------------------------------------------------------------------------

-- New appointments: as before (20260930120000_lead_lifecycle), the link naming the one appointment.
create or replace function public.tg_notify_appointments()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_to bigint[];
begin
  for r in
    select p.company_id,
           min(co.name) as company,
           count(*) as n,
           min(a.appt_date) as first_date,
           max(a.appt_date) as last_date,
           array_agg(distinct p.id) filter (where p.id is not null) as project_ids,
           array_agg(distinct l.assigned_user_id) filter (where l.assigned_user_id is not null) as reps,
           (array_agg(l.company_name order by a.appt_date, a.id))[1] as lead_name,
           (array_agg(a.appt_time order by a.appt_date, a.id))[1] as first_time,
           (array_agg(a.id order by a.appt_date, a.id))[1] as first_id,
           bool_or(coalesce(a.qa_status, 'passed') = 'passed') as client_may_know
      from new_rows a
      left join public.leads l     on l.id  = a.lead_id
      left join public.projects p  on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
     group by p.company_id
  loop
    v_to := array(
      select id from public.users where role = 'admin'
      union
      select pa.ae_user_id from public.project_assignments pa
       where pa.project_id = any(r.project_ids) and pa.ae_user_id is not null
      union
      select u.id from public.users u
       where r.client_may_know and u.role = 'client' and r.company_id is not null and u.company_id = r.company_id
      union
      select unnest(r.reps)
    );
    perform public.notify_users(
      v_to, 'appointment',
      case when r.n = 1 then 'Appointment set: ' || coalesce(r.lead_name, 'a lead')
           else r.n || ' appointments set' || coalesce(' for ' || r.company, '') end,
      case when r.n = 1
           then concat_ws(' · ',
                  to_char(r.first_date, 'Dy Mon FMDD') || coalesce(' at ' || r.first_time, ''),
                  r.company,
                  'set by ' || public.actor_name())
           else concat_ws(' · ',
                  to_char(r.first_date, 'Mon FMDD') || ' – ' || to_char(r.last_date, 'Mon FMDD'),
                  'set by ' || public.actor_name()) end,
      '/calendar?view=' || case when r.n = 1 then 'day' else 'month' end
        || '&d=' || coalesce(r.first_date, current_date)::text
        || case when r.n = 1 then '&a=' || r.first_id else '' end,
      'appt_created');
  end loop;
  return null;
end $$;

-- The client's notice: as before (20261005110000_audit_fixes), the link naming the appointment.
create or replace function public.notify_client_appointment(p_appointment bigint, p_confirmed boolean, p_first boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_confirmed boolean := p_confirmed;
begin
  select ap.appt_date, ap.appt_time, ap.user_id, l.company_name, co.id as company_id, co.name as company
    into a
    from public.appointments ap
    join public.leads l on l.id = ap.lead_id
    left join public.projects p on p.id = l.project_id
    left join public.companies co on co.id = p.company_id
   where ap.id = p_appointment;
  if a.company_id is null then return; end if;
  if p_confirmed and p_first
     and not exists (select 1 from public.alert_rules where trigger = 'appt_confirmed' and enabled) then
    v_confirmed := false;
  end if;
  perform public.notify_users(
    array(select u.id from public.users u where u.role = 'client' and u.company_id = a.company_id),
    'appointment',
    (case when v_confirmed then 'Appointment confirmed: ' else 'Appointment set: ' end) || coalesce(a.company_name, 'a lead'),
    concat_ws(' · ', to_char(a.appt_date, 'Dy Mon FMDD') || coalesce(' at ' || a.appt_time, ''), a.company),
    '/calendar?view=day&d=' || coalesce(a.appt_date, current_date)::text || '&a=' || p_appointment,
    case when v_confirmed then 'appt_confirmed' else 'appt_created' end,
    null,
    a.user_id);
end $$;
revoke execute on function public.notify_client_appointment(bigint, boolean, boolean) from public, anon, authenticated;

-- Notifications already sent: the appointment on that day for that company
-- (the one at the time the notification gives, when there are two).
update public.notifications n
   set link = n.link || '&a=' || m.appt_id
  from (
    select x.id,
           (select ap.id
              from public.appointments ap
              join public.leads l on l.id = ap.lead_id
             where ap.appt_date = substring(x.link from 'd=(\d{4}-\d{2}-\d{2})$')::date
               and l.company_name = regexp_replace(x.title, '^Appointment (set|confirmed): ', '')
             order by (ap.appt_time is not null and position(' at ' || ap.appt_time in x.body) > 0) desc, ap.id
             limit 1) as appt_id
      from public.notifications x
     where x.kind = 'appointment'
       and x.title ~ '^Appointment (set|confirmed): '
       and x.link ~ '^/calendar\?view=day&d=\d{4}-\d{2}-\d{2}$'
  ) m
 where n.id = m.id and m.appt_id is not null;
