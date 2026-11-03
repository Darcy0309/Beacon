-- The administrators' Reports count only what our managers did (Sean, Nov 2026):
-- a lead developed by one of our staff (leads.dbdv_user_id), an appointment set
-- by one (appointments.user_id) — not the names loaded onto a project, the
-- appointments a list or a client brought, or anything with no one behind it.
-- Every card and the billing listing read report_events(), so all follow.
--
-- A list from the old system gives the dates and the managers (Date Developed,
-- Developed By, Appt Create Date, Set By), read on import, so migrated leads
-- and appointments count in the months they were developed and set.
--
-- Safe to run more than once.

create or replace function public.report_events(p_from date, p_to date)
returns table (kind text, at date, project_id bigint, user_id bigint, lead_id bigint, appointment_id bigint,
               invalid boolean, confirmed boolean, rescheduled boolean)
language sql stable security definer set search_path = public as $$
  with z as (select public.business_tz() as tz)
  select 'lead', (l.promoted_at at time zone z.tz)::date, coalesce(l.source_project_id, l.project_id), l.dbdv_user_id, l.id, null::bigint,
         (l.call_result_dbdv = 'Lead-Invalid' or r.effect = 'lead_invalid'), false, false
    from public.leads l
    cross join z
    join public.users u on u.id = l.dbdv_user_id and u.role in ('admin', 'manager', 'agent')
    left join public.call_results r on r.id = l.result_id
   where l.deleted_at is null and l.promoted_at is not null
     and l.promoted_at >= (p_from::timestamp at time zone z.tz) and l.promoted_at < ((p_to + 1)::timestamp at time zone z.tz)
  union all
  select 'appointment', (coalesce(a.appt_create_date, a.created_at) at time zone z.tz)::date, coalesce(a.set_project_id, a.project_id), a.user_id, a.lead_id, a.id,
         a.invalid_at is not null, a.confirmed_at is not null and a.invalid_at is null,
         a.invalid_at is null and s.name = 'Rescheduled'
    from public.appointments a
    cross join z
    join public.users u on u.id = a.user_id and u.role in ('admin', 'manager', 'agent')
    join public.leads l on l.id = a.lead_id and l.deleted_at is null
    left join public.appointment_statuses s on s.id = a.status_id
   where a.deleted_at is null
     and coalesce(a.appt_create_date, a.created_at) >= (p_from::timestamp at time zone z.tz)
     and coalesce(a.appt_create_date, a.created_at) < ((p_to + 1)::timestamp at time zone z.tz);
$$;
revoke execute on function public.report_events(date, date) from public, anon, authenticated;
