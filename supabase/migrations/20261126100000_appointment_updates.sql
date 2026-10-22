-- ---------------------------------------------------------------------------
-- Lighthouse CRM — clients update their appointments (Sean, Oct 2026)
--
-- The client's people say how each appointment went, from Appointments (and
-- the lead page): one of nine statuses, a note, a potential premium while
-- quoting, and for a sold account the premium and carrier on each policy line.
-- Every update is kept, for administrators and managers to read on the lead;
-- each one tells the administrators and the manager who set the appointment.
--
--   appointments.client_result   the status the client gave it (null: none yet)
--     pending_appointment  Pending Appointment   valid_not_quoting  Valid-Not Quoting
--     no_status            No Status             quoted_not_sold    Quoted-Not Sold
--     valid                Valid Appointment     sold               Sold Account
--     valid_quoting        Valid-Quoting         invalid            Invalid
--                                                reschedule         Please Reschedule
--   appointment_update_status(result, date, time)  what it shows: with none
--                         given (or Pending Appointment), Pending Appointment
--                         until the appointment's time, No Status after
--   appointments.quoted_premium   the potential premium while quoting
--   appointments.sold_lines       a sold account's lines: [{line, premium, carrier}]
--   appointments.written_premium  their total (Premium Written)
--   appointment_updates           every update: who, when, what, the note
--   update_appointment_status()   the client's (or an administrator's) update
--   update_due_on(date)           5 business days after the appointment: the
--                                 last day to update it (an invalid one is
--                                 credited only if said by then)
--   client_appointments()         Appointments, as the client's list shows them
--   appointment_nudges            the reminders to update: on the 2nd and 4th
--                                 business day after an appointment still at
--                                 No Status, a notification and an email to
--                                 the client's people (the app sends the email)
--   client_sales(company, project)  the Sale Pipeline, from the project's start
--                                 month, for one project or all of a client's
--   client_dashboard()            Appointment Results in these statuses
--   set_reminder()                a client's people set reminders on their leads
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

-- --- The statuses ------------------------------------------------------------
-- From the first list (pending, quoting, …): pending is now "none given yet", quoting is Valid-Quoting.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.appointments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%client_result%'
  loop
    execute format('alter table public.appointments drop constraint %I', c.conname);
  end loop;
end $$;
update public.appointments set client_result = null where client_result = 'pending';
update public.appointments set client_result = 'valid_quoting' where client_result = 'quoting';
alter table public.appointments add constraint appointments_client_result_check
  check (client_result in ('pending_appointment', 'no_status', 'valid', 'valid_quoting', 'valid_not_quoting',
                           'quoted_not_sold', 'sold', 'invalid', 'reschedule'));
alter table public.appointments add column if not exists sold_lines jsonb;
alter table public.appointments add column if not exists update_nudge_1_at timestamptz;
alter table public.appointments add column if not exists update_nudge_2_at timestamptz;

create or replace function public.appointment_update_label(p_status text)
returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'pending_appointment' then 'Pending Appointment' when 'no_status' then 'No Status'
    when 'valid' then 'Valid Appointment' when 'valid_quoting' then 'Valid-Quoting'
    when 'valid_not_quoting' then 'Valid-Not Quoting' when 'quoted_not_sold' then 'Quoted-Not Sold'
    when 'sold' then 'Sold Account' when 'invalid' then 'Invalid' when 'reschedule' then 'Please Reschedule'
    else p_status end;
$$;
grant execute on function public.appointment_update_label(text) to authenticated, service_role;

/** When an appointment starts, on the business's clock: its day at its time ("10:00 AM"), or the start of the day. */
create or replace function public.appointment_starts_at(p_date date, p_time text)
returns timestamptz
language sql stable set search_path = public as $$
  select (p_date + case when coalesce(p_time, '') ~* '^\s*(1[0-2]|0?[1-9]):[0-5][0-9]\s*(AM|PM)\s*$'
                        then to_timestamp(upper(btrim(p_time)), 'HH12:MI AM')::time else time '00:00' end)
         at time zone public.business_tz();
$$;
grant execute on function public.appointment_starts_at(date, text) to authenticated, service_role;

/** What an appointment shows: the status given, or with none (or Pending Appointment) Pending until its time, then No Status. */
create or replace function public.appointment_update_status(p_result text, p_date date, p_time text)
returns text
language sql stable set search_path = public as $$
  select case
    when p_result is not null and p_result <> 'pending_appointment' then p_result
    when p_date is null or public.appointment_starts_at(p_date, p_time) > now() then 'pending_appointment'
    else 'no_status' end;
$$;
grant execute on function public.appointment_update_status(text, date, text) to authenticated, service_role;

/** `p_days` business days (Monday to Friday) after `p_date`. */
create or replace function public.business_days_after(p_date date, p_days int)
returns date
language sql immutable set search_path = public as $$
  select max(d) from (
    select g::date as d from generate_series(p_date + 1, p_date + p_days * 2 + 7, interval '1 day') g
     where extract(isodow from g) < 6 order by g limit p_days
  ) b;
$$;
grant execute on function public.business_days_after(date, int) to authenticated, service_role;

/** The last day to update an appointment: 5 business days after it. */
create or replace function public.update_due_on(p_date date)
returns date
language sql immutable set search_path = public as $$
  select public.business_days_after(p_date, 5);
$$;
grant execute on function public.update_due_on(date) to authenticated, service_role;

-- --- Every update, kept ----------------------------------------------------------
create table if not exists public.appointment_updates (
  id                 bigint generated always as identity primary key,
  appointment_id     bigint not null references public.appointments(id) on delete cascade,
  lead_id            bigint references public.leads(id) on delete cascade,
  project_id         bigint references public.projects(id) on delete set null,
  company_id         bigint references public.companies(id) on delete set null,
  status             text not null,
  previous_status    text,
  note               text check (length(note) <= 2000),
  potential_premium  numeric(12, 2) check (potential_premium >= 0),
  sold_lines         jsonb,
  total_premium      numeric(12, 2) check (total_premium >= 0),
  created_by         bigint references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists appointment_updates_appt on public.appointment_updates (appointment_id, created_at desc);
create index if not exists appointment_updates_lead on public.appointment_updates (lead_id, created_at desc);
create index if not exists appointment_updates_at on public.appointment_updates (created_at desc);

alter table public.appointment_updates enable row level security;
-- Staff read every update; a client's people, their own company's. Written only by update_appointment_status().
drop policy if exists appointment_updates_read on public.appointment_updates;
create policy appointment_updates_read on public.appointment_updates for select to authenticated
  using ((select public.is_staff()) or company_id = (select public.app_company_id()));
drop policy if exists mfa_required on public.appointment_updates;
create policy mfa_required on public.appointment_updates as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.appointment_updates;
create policy active_account_required on public.appointment_updates as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.appointment_updates from anon;
revoke insert, update, delete, truncate on public.appointment_updates from authenticated;
grant select on public.appointment_updates to authenticated;
grant all on public.appointment_updates to service_role;

/**
 * The client's update to an appointment (or an administrator's, for them): one status, a note,
 * the potential premium while Valid-Quoting, and for Sold Account its policy lines
 * ([{line, premium, carrier}], the total written). Kept in appointment_updates; the
 * administrators and the manager who set it are told.
 */
create or replace function public.update_appointment_status(p_appointment_id bigint, p_status text, p_note text default null,
  p_potential_premium numeric default null, p_sold_lines jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me      public.users;
  a         public.appointments;
  l         public.leads;
  v_company bigint;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_lines   jsonb := '[]'::jsonb;
  v_total   numeric := null;
  v_line    jsonb;
  v_prem    numeric;
  v_carrier text;
  v_prev    text;
  v_label   text;
  v_to      bigint[];
  v_id      bigint;
begin
  select * into v_me from public.users where id = public.app_user_id();
  if v_me.id is null then
    raise exception 'Sign in to update an appointment' using errcode = '42501';
  end if;
  select * into a from public.appointments where id = p_appointment_id and deleted_at is null;
  if a.id is null then
    raise exception 'That appointment is no longer there' using errcode = '22023';
  end if;
  select company_id into v_company from public.projects where id = coalesce(a.project_id, a.set_project_id);
  if not (public.is_admin()
          or (v_me.role = 'client' and coalesce(a.project_id, a.set_project_id) in (select public.client_project_ids())
              and coalesce(a.qa_status, 'passed') = 'passed')) then
    raise exception 'That appointment is not yours to update' using errcode = '42501';
  end if;
  if p_status not in ('pending_appointment', 'no_status', 'valid', 'valid_quoting', 'valid_not_quoting',
                      'quoted_not_sold', 'sold', 'invalid', 'reschedule') then
    raise exception 'Choose one of the statuses' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 2000 then
    raise exception 'Keep the note under 2,000 characters' using errcode = '22023';
  end if;
  if p_status = 'valid_quoting' and p_potential_premium is not null and (p_potential_premium < 0 or p_potential_premium > 999999999) then
    raise exception 'Enter the potential premium as an amount' using errcode = '22023';
  end if;
  if p_status = 'sold' then
    if p_sold_lines is null or jsonb_typeof(p_sold_lines) <> 'array' then
      raise exception 'Enter the premium on each policy line sold' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_sold_lines) loop
      if coalesce(v_line->>'line', '') not in ('liability', 'work_comp', 'auto', 'umbrella', 'eo', 'personal', 'health') then
        raise exception 'That is not one of the policy lines' using errcode = '22023';
      end if;
      begin
        v_prem := nullif(v_line->>'premium', '')::numeric;
      exception when others then
        raise exception 'Enter each premium as an amount' using errcode = '22023';
      end;
      continue when v_prem is null or v_prem = 0;
      if v_prem < 0 or v_prem > 999999999 then
        raise exception 'Enter each premium as an amount' using errcode = '22023';
      end if;
      v_carrier := nullif(btrim(coalesce(v_line->>'carrier', '')), '');
      if v_carrier is null then
        raise exception 'Choose the carrier each line was placed with' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('line', v_line->>'line', 'premium', round(v_prem, 2), 'carrier', left(v_carrier, 120)));
      v_total := coalesce(v_total, 0) + round(v_prem, 2);
    end loop;
    if v_total is null then
      raise exception 'Enter the premium on at least one policy line' using errcode = '22023';
    end if;
  end if;

  v_prev := public.appointment_update_status(a.client_result, a.appt_date, a.appt_time);
  update public.appointments set
    client_result = p_status,
    client_result_at = now(),
    client_result_by = v_me.id,
    quoted_premium = case when p_status = 'valid_quoting' then round(p_potential_premium, 2) else quoted_premium end,
    sold_lines = case when p_status = 'sold' then v_lines else null end,
    written_premium = case when p_status = 'sold' then v_total else null end
  where id = a.id;
  insert into public.appointment_updates (appointment_id, lead_id, project_id, company_id, status, previous_status, note,
    potential_premium, sold_lines, total_premium, created_by)
  values (a.id, a.lead_id, coalesce(a.project_id, a.set_project_id), v_company, p_status, v_prev, v_note,
    case when p_status = 'valid_quoting' then round(p_potential_premium, 2) end,
    case when p_status = 'sold' then v_lines end, v_total, v_me.id)
  returning id into v_id;

  -- The administrators, and the manager who set it, hear of it.
  select * into l from public.leads where id = a.lead_id;
  v_label := public.appointment_update_label(p_status);
  select array_agg(distinct u.id) into v_to from public.users u
   where u.status = 'active' and u.id <> v_me.id and (u.role = 'admin' or u.id = a.user_id);
  if v_to is not null then
    perform public.notify_users(v_to, 'appointment',
      left('Appointment update: ' || v_label || ' · ' || coalesce(l.company_name, 'an appointment'), 160),
      left(concat_ws(' · ',
        coalesce(nullif(btrim(concat_ws(' ', v_me.first_name, v_me.last_name)), ''), v_me.email),
        'Appointment ' || to_char(a.appt_date, 'FMMM/FMDD/YYYY'),
        case when p_status = 'valid_quoting' and p_potential_premium is not null then 'Potential premium $' || to_char(p_potential_premium, 'FM999,999,999,990.00') end,
        case when p_status = 'sold' then 'Total premium $' || to_char(v_total, 'FM999,999,999,990.00') end,
        v_note), 1000),
      '/leads/' || a.lead_id || '?tab=updates', null, gen_random_uuid(), v_me.id);
  end if;
  return jsonb_build_object('id', v_id, 'status', p_status, 'label', v_label, 'total', v_total);
end $$;
revoke execute on function public.update_appointment_status(bigint, text, text, numeric, jsonb) from public, anon;
grant execute on function public.update_appointment_status(bigint, text, text, numeric, jsonb) to authenticated;

/**
 * Appointments as a client's list shows them (Sean, Oct 2026): the caller's (a client: their
 * projects', through QA; staff: any, or p_company_id's) with their day from p_from to p_to, by the
 * appointment's day: the company, project, agent, when it was developed, its day and time, what it
 * is (Appointment, -Confirmed, -Invalid), its X-date, the manager who set it, and the update: the
 * status it shows, when and by whom, its potential or total premium, and the day it is due by.
 * With p_lead_id: that lead's appointments, whatever their day.
 */
drop function if exists public.client_appointments(date, date, bigint, text, bigint);
drop function if exists public.client_appointments(date, date, bigint, text, bigint, bigint);
create function public.client_appointments(p_from date, p_to date, p_project_id bigint default null,
  p_status text default null, p_company_id bigint default null, p_lead_id bigint default null)
returns table (id bigint, lead_id bigint, company text, city text, state text, project_id bigint, project text,
  agent text, developed_at timestamptz, appt_date date, appt_time text, status text, xdate date, manager text,
  manager_id bigint, update_status text, update_label text, update_at timestamptz, update_by text,
  potential_premium numeric, total_premium numeric, sold_lines jsonb, due_on date, last_note text)
language sql stable security definer set search_path = public as $$
  with mine as (
    select p.id from public.projects p
     where p.deleted_at is null
       and (case when public.is_staff() then (p_company_id is null or p.company_id = p_company_id)
                 else p.id in (select public.client_project_ids()) end)
       and (p_project_id is null or p.id = p_project_id)
  ), rows as (
    select ap.*, public.appointment_update_status(ap.client_result, ap.appt_date, ap.appt_time) as shown
      from public.appointments ap
     where public.app_user_id() is not null
       and ap.deleted_at is null
       and coalesce(ap.project_id, ap.set_project_id) in (select id from mine)
       and (public.is_staff() or coalesce(ap.qa_status, 'passed') = 'passed')
       and (case when p_lead_id is not null then ap.lead_id = p_lead_id else ap.appt_date between p_from and p_to end)
  )
  select r.id, l.id, l.company_name, l.city, l.state, pr.id, pr.name,
         coalesce(nullif(btrim(r.rep_name), ''), nullif(btrim(pr.contact_name), '')),
         coalesce((select min(e.created_at) from public.pay_events e where e.appointment_id = r.id and e.kind = 'appointment' and not e.is_chargeback),
                  r.appt_create_date, r.created_at),
         r.appt_date, r.appt_time,
         case when r.invalid_at is not null then 'Appointment-Invalid'
              when r.confirmed_at is not null then 'Appointment-Confirmed' else 'Appointment' end,
         (select min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                      i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)))
            from public.insurance_details i where i.lead_id = l.id),
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.id,
         r.shown, public.appointment_update_label(r.shown), r.client_result_at,
         nullif(btrim(concat_ws(' ', b.first_name, b.last_name)), ''),
         r.quoted_premium, r.written_premium, r.sold_lines, public.update_due_on(r.appt_date),
         (select x.note from public.appointment_updates x where x.appointment_id = r.id and x.note is not null order by x.created_at desc, x.id desc limit 1)
    from rows r
    join public.leads l on l.id = r.lead_id and l.deleted_at is null
    join public.projects pr on pr.id = coalesce(r.project_id, r.set_project_id)
    left join public.users u on u.id = r.user_id
    left join public.users b on b.id = r.client_result_by
   where p_status is null or r.shown = p_status
   order by r.appt_date desc, public.appointment_starts_at(r.appt_date, r.appt_time) desc, r.id desc
   limit 2000;
$$;
revoke execute on function public.client_appointments(date, date, bigint, text, bigint, bigint) from public, anon;
grant execute on function public.client_appointments(date, date, bigint, text, bigint, bigint) to authenticated;

/** The updates made from p_from to p_to (the business's days), as the caller may read them: Appointment Updates. */
create or replace function public.appointment_updates_between(p_from date, p_to date)
returns setof public.appointment_updates
language sql stable security invoker set search_path = public as $$
  select * from public.appointment_updates
   where created_at >= (p_from::timestamp at time zone public.business_tz())
     and created_at < ((p_to + 1)::timestamp at time zone public.business_tz());
$$;
revoke execute on function public.appointment_updates_between(date, date) from public, anon;
grant execute on function public.appointment_updates_between(date, date) to authenticated;

-- --- Reminders to update ---------------------------------------------------------
-- The emails the app is to send: one row for each person told, sent (or failed) by /api/appointments/nudge.
create table if not exists public.appointment_nudges (
  id              bigint generated always as identity primary key,
  appointment_id  bigint not null references public.appointments(id) on delete cascade,
  nudge           int not null check (nudge in (1, 2)),
  user_id         bigint references public.users(id) on delete cascade,
  email           text not null,
  subject         text not null,
  body            text not null,
  link            text not null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  error           text
);
create index if not exists appointment_nudges_unsent on public.appointment_nudges (created_at) where sent_at is null and error is null;
alter table public.appointment_nudges enable row level security;
revoke all on public.appointment_nudges from anon, authenticated;
grant all on public.appointment_nudges to service_role;

/**
 * On a business day's working hours: each appointment still at No Status on the 2nd business day
 * after it, and again on the 4th, gets the client's people a notification, and an email queued for
 * the app to send (then the app is asked to send them). Each reminder goes once. `p_now`: the
 * time to act as of (the schedule's own; a test's).
 */
drop function if exists public.nudge_appointment_updates();
create or replace function public.nudge_appointment_updates(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tz     text := public.business_tz();
  v_today  date := (p_now at time zone v_tz)::date;
  v_hour   int := extract(hour from p_now at time zone v_tz)::int;
  r        record;
  v_n      int;
  v_title  text;
  v_body   text;
  v_link   text;
  v_to     bigint[];
  v_count  int := 0;
  v_url    text;
  v_secret text;
begin
  if extract(isodow from v_today) > 5 or v_hour < 8 or v_hour >= 18 then
    return 0;
  end if;
  for r in
    select a.id, a.lead_id, a.appt_date, a.update_nudge_1_at, a.update_nudge_2_at, l.company_name, p.company_id
      from public.appointments a
      join public.leads l on l.id = a.lead_id and l.deleted_at is null
      join public.projects p on p.id = coalesce(a.project_id, a.set_project_id) and p.deleted_at is null
     where a.deleted_at is null and a.invalid_at is null and coalesce(a.qa_status, 'passed') = 'passed'
       and public.appointment_update_status(a.client_result, a.appt_date, a.appt_time) = 'no_status'
       and a.appt_date >= v_today - 30
       and (a.update_nudge_2_at is null)
       and v_today >= public.business_days_after(a.appt_date, 2)
     for update of a skip locked
  loop
    v_n := case when v_today >= public.business_days_after(r.appt_date, 4) then 2
                when r.update_nudge_1_at is null then 1 else null end;
    continue when v_n is null;
    v_link := '/appointments?update=' || r.id;
    if v_n = 1 then
      v_title := left('How did your appointment with ' || coalesce(r.company_name, 'the business') || ' go?', 160);
      v_body := 'How did your Appointment with ' || coalesce(r.company_name, 'the business') || ' work out on '
        || to_char(r.appt_date, 'FMMM/FMDD/YYYY') || '? Please update the status of the Appointment in Lighthouse so we can let our team know how they did.';
    else
      v_title := left('Reminder: update your appointment with ' || coalesce(r.company_name, 'the business'), 160);
      v_body := 'Reminder to update the status of your Appointment with ' || coalesce(r.company_name, 'the business') || ' that was on '
        || to_char(r.appt_date, 'FMMM/FMDD/YYYY') || ' by tomorrow in order to receive credit if it was invalid.';
    end if;
    select array_agg(u.id) into v_to from public.users u
     where u.company_id = r.company_id and u.role = 'client' and u.status = 'active' and u.deleted_at is null;
    if v_to is not null then
      perform public.notify_users(v_to, 'appointment', v_title, v_body, v_link, null, gen_random_uuid(), null);
      insert into public.appointment_nudges (appointment_id, nudge, user_id, email, subject, body, link)
      select r.id, v_n, u.id, u.email, v_title, v_body, v_link
        from public.users u where u.id = any(v_to) and nullif(btrim(u.email), '') is not null;
    end if;
    -- The 4th day's reminder stands for the 2nd too, when the first went unsent (the job was off).
    update public.appointments set update_nudge_1_at = coalesce(update_nudge_1_at, now()),
                                   update_nudge_2_at = case when v_n = 2 then now() else update_nudge_2_at end
     where id = r.id;
    v_count := v_count + 1;
  end loop;

  -- The emails go from the app: ask it, as the hourly deliveries are asked.
  if exists (select 1 from public.appointment_nudges where sent_at is null and error is null) then
    begin
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
      if v_url like '%/api/push/deliver' and v_secret is not null then
        perform net.http_post(
          url := replace(v_url, '/api/push/deliver', '/api/appointments/nudge'),
          body := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
          timeout_milliseconds := 60000);
      end if;
    exception when others then
      raise warning 'appointment nudges: % (%)', sqlerrm, sqlstate;
    end;
  end if;
  return v_count;
end $$;
revoke execute on function public.nudge_appointment_updates(timestamptz) from public, anon, authenticated;
grant execute on function public.nudge_appointment_updates(timestamptz) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not enabled: appointment update reminders are not sent on a schedule';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'nudge-appointment-updates') then
    perform cron.unschedule('nudge-appointment-updates');
  end if;
  perform cron.schedule('nudge-appointment-updates', '5 * * * *', 'select public.nudge_appointment_updates()');
end $$;

-- --- The Sale Pipeline, from the campaign's start ------------------------------------
drop function if exists public.client_sales(bigint);
/**
 * The Sale Pipeline for a client (an administrator's p_company_id, or the caller's own) or one of
 * its projects: twelve months from the month its campaign started (the project's start date; for
 * all its projects, the earliest; January without one), moved on by whole years to the year we are
 * in. Premium written in them (Sold Account, by when it was marked), in the pipe (potential premium
 * on those Valid-Quoting), the goal for the year it began in, and the close ratio: sold of the valid
 * appointments (Valid, Valid-Quoting, Valid-Not Quoting, Quoted-Not Sold, Sold).
 */
create or replace function public.client_sales(p_company_id bigint default null, p_project_id bigint default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz, (now() at time zone public.business_tz())::date as today
  ), co as (
    select coalesce(p_company_id, public.app_company_id()) as id
  ), p as (
    select pr.id, pr.start_date from public.projects pr, co
     where pr.company_id = co.id and pr.deleted_at is null and (p_project_id is null or pr.id = p_project_id)
  ), s0 as (
    select coalesce(date_trunc('month', (select min(start_date) from p))::date, date_trunc('year', z.today)::date) as first, z.today from z
  ), s as (
    -- Moved on by whole years until it holds today (a start still ahead stays where it is).
    select (first + make_interval(years => greatest(0, floor(((extract(year from today) - extract(year from first)) * 12
             + extract(month from today) - extract(month from first)) / 12)::int)))::date as first, today from s0
  ), a as (
    select public.appointment_update_status(ap.client_result, ap.appt_date, ap.appt_time) as result,
           ap.quoted_premium, ap.written_premium, (ap.client_result_at at time zone z.tz)::date as at
      from public.appointments ap, z
     where coalesce(ap.project_id, ap.set_project_id) in (select id from p)
       and ap.deleted_at is null and ap.invalid_at is null and coalesce(ap.qa_status, 'passed') = 'passed'
  ), sold as (
    select a.written_premium, a.at from a, s where a.result = 'sold' and a.at >= s.first and a.at < (s.first + interval '12 months')::date
  )
  select jsonb_build_object(
    'year', (select extract(year from first)::int from s),
    'start', (select first from s),
    'started', (select min(start_date) from p),
    'written', (select coalesce(sum(written_premium), 0) from sold),
    'pipe', (select coalesce(sum(quoted_premium), 0) from a where result = 'valid_quoting'),
    'goal', (select g.premium_goal from public.client_goals g, co, s where g.company_id = co.id and g.year = extract(year from s.first)::int),
    'sold', (select count(*) from a where result = 'sold'),
    'considered', (select count(*) from a where result in ('valid', 'valid_quoting', 'valid_not_quoting', 'quoted_not_sold', 'sold')),
    'current', (select ((extract(year from today) - extract(year from first)) * 12 + extract(month from today) - extract(month from first))::int + 1 from s),
    'months', (select jsonb_agg(jsonb_build_object(
                 'month', i, 'key', to_char((s.first + make_interval(months => i - 1))::date, 'YYYY-MM'),
                 'label', to_char((s.first + make_interval(months => i - 1))::date, 'Mon'),
                 'written', (select coalesce(sum(written_premium), 0) from sold
                              where date_trunc('month', sold.at) = date_trunc('month', s.first + make_interval(months => i - 1)))
               ) order by i) from s, generate_series(1, 12) i)
  );
$$;
revoke execute on function public.client_sales(bigint, bigint) from public, anon;
grant execute on function public.client_sales(bigint, bigint) to authenticated;

-- --- Appointment Results, in the new statuses ----------------------------------------
create or replace function public.client_dashboard(p_from date default null, p_company_id bigint default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), p as (
    select pr.id, pr.name, t.code as type from public.projects pr
      left join public.project_types t on t.id = pr.project_type_id
     where pr.deleted_at is null and (p_company_id is null or pr.company_id = p_company_id)
  ), l as (
    -- A lead: a name at the appointment stage, dated by when it became one.
    select le.id, le.project_id, le.source_project_id, r.effect, le.appt_created_date, le.promoted_at, le.lead_date, le.created_at
      from public.leads le join public.call_results r on r.id = le.result_id
     where le.stage = 'appt'
       and (le.project_id in (select id from p) or le.source_project_id in (select id from p))
  ), lp as (
    select l.* from l, z
     where p_from is null or coalesce(l.promoted_at, l.lead_date, l.created_at) >= (p_from::timestamp at time zone z.tz)
  ), a as (
    -- An appointment: a name whose result is one (set, confirmed or invalid), once each, dated by when it was set.
    select l.id, l.effect,
           (select public.appointment_update_status(ap.client_result, ap.appt_date, ap.appt_time) from public.appointments ap
             where ap.lead_id = l.id and ap.deleted_at is null order by ap.created_at desc, ap.id desc limit 1) as shown
      from l, z
     where l.project_id in (select id from p)
       and l.effect in ('appointment', 'confirm', 'appointment_invalid')
       and (p_from is null or coalesce(l.appt_created_date, l.promoted_at, l.lead_date, l.created_at) >= (p_from::timestamp at time zone z.tz))
  ), ar as (
    select case when effect = 'appointment_invalid' then 'invalid' else coalesce(shown, 'pending_appointment') end as result from a
  )
  select jsonb_build_object(
    'leads', (select count(*) from lp where lp.project_id in (select id from p)),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                                   'leads', (select count(*) from lp where lp.source_project_id = p.id or lp.project_id = p.id))
                                 order by p.name), '[]'::jsonb)
                   from p where p.type = 'DBDV'),
    'appts', (select count(*) from a),
    'results', (select jsonb_object_agg(k, (select count(*) from ar where ar.result = k))
                  from unnest(array['pending_appointment', 'no_status', 'valid', 'valid_quoting', 'valid_not_quoting',
                                    'quoted_not_sold', 'sold', 'invalid', 'reschedule']) k)
  );
$$;
revoke execute on function public.client_dashboard(date, bigint) from public, anon;
grant execute on function public.client_dashboard(date, bigint) to authenticated;

-- --- A client's people set reminders on their own leads ----------------------------------
create or replace function public.set_reminder(p_lead_id bigint, p_date date, p_time text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_time time;
  v_at   timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  r      public.reminders;
begin
  if v_me is null or not (public.can_work_lead(p_lead_id)
       or (public.app_role() = 'client' and exists (select 1 from public.leads l where l.id = p_lead_id and l.deleted_at is null
             and (l.project_id in (select public.client_project_ids()) or l.source_project_id in (select public.client_project_ids()))))) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;
  begin
    v_time := to_timestamp(upper(btrim(p_time)), 'HH12:MI AM')::time;
  exception when others then
    raise exception 'Choose a time like 2:00 PM' using errcode = '22023';
  end;
  if p_date is null or v_time is null then
    raise exception 'Choose the day and time to be reminded' using errcode = '22023';
  end if;
  v_at := (p_date + v_time) at time zone public.business_tz();
  if v_at < now() - interval '1 minute' then
    raise exception 'That time has already passed' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;
  insert into public.reminders (lead_id, user_id, remind_at, note)
  values (p_lead_id, v_me, v_at, v_note)
  returning * into r;
  return jsonb_build_object('id', r.id, 'remind_at', r.remind_at);
end $$;
revoke execute on function public.set_reminder(bigint, date, text, text) from public, anon;
grant execute on function public.set_reminder(bigint, date, text, text) to authenticated;

-- A client's reminder says "Reminder", not "Call back".
create or replace function public.deliver_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_id  bigint;
  n     integer := 0;
begin
  for r in
    select m.id, m.user_id, m.lead_id, m.note, m.remind_at, m.appointment_id, l.company_name, u.role
      from public.reminders m
      join public.leads l on l.id = m.lead_id and l.deleted_at is null
      left join public.users u on u.id = m.user_id
     where m.sent_at is null and m.remind_at <= now()
     order by m.remind_at
     for update of m skip locked
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      r.user_id, 'reminder',
      left(case when r.appointment_id is not null then 'Confirm tomorrow''s appointment: '
                when r.role = 'client' then 'Reminder: ' else 'Call back: ' end
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

notify pgrst, 'reload schema';
