-- Valid-Not Updated (Sean, Oct 29 and Nov 2026): "If no update was made by the client or an Admin for that appt by the
-- due date, can the system automatically change the Update Status to Valid-Not Updated (we'd need to add that result
-- for reporting). The red overdue date that's already listed will stay", "…and send the sales rep a notification."
--
--   client_result 'valid_not_updated'   Valid-Not Updated: given by the system, not offered to pick. The client (or an
--                                       administrator) can still give it a status afterwards, Sold and the rest.
--   mark_appointments_not_updated()     every hour: an appointment held, past its update's due date (update_due_on: 5
--                                       business days after it) with no status yet, is Valid-Not Updated, kept in its
--                                       update history as "Not updated by the due date". Not one found invalid (it
--                                       needs no update), nor one still waiting for QA (the client hasn't seen it).
--                                       The client's watchers (its Sales Rep) are told of one due in the last week;
--                                       the ones overdue before this ran (and an import's old appointments) quietly.
--   client_dashboard()                  counts them among the appointment results.
--
-- Safe to run more than once. It runs once at the end, so the appointments already overdue change straight away.

alter table public.appointments drop constraint if exists appointments_client_result_check;
alter table public.appointments add constraint appointments_client_result_check check (client_result in ('pending_appointment', 'no_status',
  'valid', 'valid_quoting', 'valid_not_quoting', 'quoted_not_sold', 'sold', 'invalid', 'reschedule', 'valid_not_updated'));

create or replace function public.appointment_update_label(p_status text)
returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'pending_appointment' then 'Pending Appointment' when 'no_status' then 'No Status'
    when 'valid' then 'Valid Appointment' when 'valid_quoting' then 'Valid-Quoting'
    when 'valid_not_quoting' then 'Valid-Not Quoting' when 'quoted_not_sold' then 'Quoted-Not Sold'
    when 'sold' then 'Sold Account' when 'invalid' then 'Invalid' when 'reschedule' then 'Please Reschedule'
    when 'valid_not_updated' then 'Valid-Not Updated'
    else p_status end;
$$;

-- The client dashboard's appointment results: Valid-Not Updated among them.
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = 'client_dashboard' and p.pronamespace = 'public'::regnamespace;
  if def is not null and def not like '%valid_not_updated%' then
    execute replace(def, '''reschedule'']', '''reschedule'', ''valid_not_updated'']');
  end if;
end $$;

create or replace function public.mark_appointments_not_updated()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_today   date := public.business_today();
  v_invalid bigint;
  v_n       integer := 0;
  r         record;
begin
  select id into v_invalid from public.appointment_statuses where name = 'Invalid';
  for r in
    select a.id, a.lead_id, a.appt_date, coalesce(a.project_id, a.set_project_id) as project_id, p.company_id,
           l.company_name, public.update_due_on(a.appt_date) as due
      from public.appointments a
      join public.leads l on l.id = a.lead_id and l.deleted_at is null
      join public.projects p on p.id = coalesce(a.project_id, a.set_project_id) and p.deleted_at is null
     where a.deleted_at is null and a.appt_date is not null
       and a.invalid_at is null and a.status_id is distinct from v_invalid
       and coalesce(a.qa_status, 'passed') = 'passed'
       and public.appointment_update_status(a.client_result, a.appt_date, a.appt_time) = 'no_status'
       and v_today > public.update_due_on(a.appt_date)
       for update of a skip locked
  loop
    update public.appointments
       set client_result = 'valid_not_updated', client_result_at = now(), client_result_by = null
     where id = r.id;
    insert into public.appointment_updates (appointment_id, lead_id, project_id, company_id, status, previous_status, note, created_by)
    values (r.id, r.lead_id, r.project_id, r.company_id, 'valid_not_updated', 'no_status',
            'Not updated by the due date, ' || to_char(r.due, 'FMMM/FMDD/YYYY'), null);
    if r.due >= v_today - 7 then
      perform public.notify_client_watchers(r.company_id, 'appointment',
        left('Not updated by the due date · ' || coalesce(r.company_name, 'an appointment'), 160),
        'Appointment ' || to_char(r.appt_date, 'FMMM/FMDD/YYYY') || ' · was due ' || to_char(r.due, 'FMMM/FMDD/YYYY')
          || ' · now Valid-Not Updated',
        '/leads/' || r.lead_id || '?tab=updates');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.mark_appointments_not_updated() from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not enabled: appointments are not marked Valid-Not Updated on a schedule';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'mark-appointments-not-updated') then
    perform cron.unschedule('mark-appointments-not-updated');
  end if;
  perform cron.schedule('mark-appointments-not-updated', '20 * * * *', 'select public.mark_appointments_not_updated()');
end $$;

-- The ones already overdue, now.
select public.mark_appointments_not_updated();
