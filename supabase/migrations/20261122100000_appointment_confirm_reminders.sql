-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a reminder the day before to confirm an appointment
-- (Sean, Oct 2026)
--
-- A manager calls the business back the day before an appointment to confirm
-- it. Each appointment they set now brings its own reminder: at 9:00 AM (the
-- business's time) the day before, a notification "Confirm tomorrow's
-- appointment: <company>", also on their own calendar like any reminder.
-- Moved with the appointment, gone once it is confirmed, found invalid or
-- deleted; none when that morning has already passed (set this afternoon for
-- tomorrow: they have just spoken).
--
--   reminders.appointment_id   the appointment a reminder is for (null: a
--                              call-back reminder a person set)
--   appointment_confirm_reminder()   keeps it in step (trigger)
--   deliver_reminders()        as before, with the confirm reminder's wording
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

alter table public.reminders
  add column if not exists appointment_id bigint references public.appointments(id) on delete cascade;
create unique index if not exists reminders_appointment_unsent
  on public.reminders (appointment_id) where appointment_id is not null and sent_at is null;

/** The appointment's confirm reminder, as it now stands: removed, then set again if it should be. */
create or replace function public.appointment_confirm_reminder()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tz  text := public.business_tz();
  v_at  timestamptz;
begin
  delete from public.reminders where appointment_id = new.id and sent_at is null;
  if new.user_id is null or new.lead_id is null or new.appt_date is null
     or new.confirmed_at is not null or new.invalid_at is not null or new.deleted_at is not null then
    return new;
  end if;
  v_at := ((new.appt_date - 1)::timestamp + time '09:00') at time zone v_tz;
  if v_at <= now() then
    return new;
  end if;
  insert into public.reminders (lead_id, user_id, remind_at, note, appointment_id)
  values (new.lead_id, new.user_id, v_at,
          left('Appointment ' || to_char(new.appt_date, 'FMDy, Mon FMDD') || coalesce(' at ' || new.appt_time, '')
               || ': call the business to confirm it', 300),
          new.id);
  return new;
end $$;
revoke execute on function public.appointment_confirm_reminder() from public, anon, authenticated;

drop trigger if exists appointment_confirm_reminder on public.appointments;
create trigger appointment_confirm_reminder
  after insert or update of appt_date, appt_time, user_id, lead_id, confirmed_at, invalid_at, deleted_at
  on public.appointments
  for each row execute function public.appointment_confirm_reminder();

/** Due reminders become notifications: a call-back's as before; an appointment's asks to confirm it. */
create or replace function public.deliver_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_id  bigint;
  n     integer := 0;
begin
  for r in
    select m.id, m.user_id, m.lead_id, m.note, m.remind_at, m.appointment_id, l.company_name
      from public.reminders m
      join public.leads l on l.id = m.lead_id and l.deleted_at is null
     where m.sent_at is null and m.remind_at <= now()
     order by m.remind_at
     for update of m skip locked
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      r.user_id, 'reminder',
      left(case when r.appointment_id is not null then 'Confirm tomorrow''s appointment: ' else 'Call back: ' end
           || coalesce(r.company_name, 'a lead'), 120),
      left(case when r.appointment_id is not null then coalesce(r.note, '')
                else concat_ws(' · ', 'Reminder for ' || to_char(r.remind_at at time zone public.business_tz(), 'FMHH12:MI AM'), r.note) end, 1000),
      '/leads/' || r.lead_id
    )
    returning id into v_id;
    update public.reminders set sent_at = now(), notification_id = v_id where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.deliver_reminders() from public, anon, authenticated;

-- The appointments already set and still to confirm get theirs.
insert into public.reminders (lead_id, user_id, remind_at, note, appointment_id)
select a.lead_id, a.user_id, ((a.appt_date - 1)::timestamp + time '09:00') at time zone public.business_tz(),
       left('Appointment ' || to_char(a.appt_date, 'FMDy, Mon FMDD') || coalesce(' at ' || a.appt_time, '')
            || ': call the business to confirm it', 300),
       a.id
  from public.appointments a
 where a.user_id is not null and a.lead_id is not null and a.appt_date is not null
   and a.confirmed_at is null and a.invalid_at is null and a.deleted_at is null
   and ((a.appt_date - 1)::timestamp + time '09:00') at time zone public.business_tz() > now()
   and not exists (select 1 from public.reminders m where m.appointment_id = a.id and m.sent_at is null);

notify pgrst, 'reload schema';
