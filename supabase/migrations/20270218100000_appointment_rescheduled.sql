-- =============================================================================
-- Appointment-Rescheduled (Sean, Nov 2026): "something I never covered for when they have to reschedule an
-- appointment that was already set (either after they received negative pay for it being invalid or when they
-- call to confirm an appt and the prospect needs to reschedule to a different date/time)."
--
-- A follow-up on the name's appointment, beside Appointment-Confirmed and Appointment-Invalid:
--   * the same appointment moves to its new day and time (status Rescheduled), to be confirmed again;
--   * one marked invalid is an appointment again: its pay back to whoever set it, as a new appointment,
--     with the confirmation pay still to come; one already confirmed has its confirmation pay taken back
--     until it is confirmed again (never paid twice);
--   * the client is told: the lead sheet emailed as "Appointment - <company> (RESCHEDULED)" with the new
--     day's calendar links (the app sends it), the producers texted, and a notification in Lighthouse;
--   * counted against whoever set it (appointments.rescheduled_count; rescheduled_appointments()), the trend
--     of how many of a manager's appointments need setting again, on Daily Production.
--
-- Safe to run more than once.
-- =============================================================================

alter table public.call_results drop constraint if exists call_results_effect_check;
alter table public.call_results add constraint call_results_effect_check
  check (effect in ('none', 'promote', 'appointment', 'confirm', 'reschedule',
                    'appointment_invalid', 'lead_invalid', 'correct_xdate', 'pending'));

alter table public.appointments add column if not exists rescheduled_at timestamptz;
alter table public.appointments add column if not exists rescheduled_count integer not null default 0;
comment on column public.appointments.rescheduled_count is 'Times set again on another day with Appointment-Rescheduled';

-- Right after Appointment-Confirmed, as the client's sheet lists them. It sends the client the lead sheet.
insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases, delivers)
values
  ('DBDV', 'Appointment-Rescheduled', 85, false, true, false, 'reschedule', null, 'appointment', null,
   'Appointment moved to its new date/time on the client calendar, notification sent to Client marked Rescheduled, to be confirmed again; an invalid appointment set again has its Appt pay added back (Confirmation pay pending), and is tracked as a reschedule for the Account Mgr who set it',
   array['rescheduled', 'appointment rescheduled', 'reschedule'], false),
  ('APPT', 'Appointment-Rescheduled', 65, false, true, false, 'reschedule', null, 'appointment', null,
   'Appointment moved to its new date/time on the client calendar, notification sent to Client marked Rescheduled, to be confirmed again; an invalid appointment set again has its Appt pay added back (Confirmation pay pending), and is tracked as a reschedule for the Account Mgr who set it',
   array['rescheduled', 'appointment rescheduled', 'reschedule'], false)
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable, sort_last = excluded.sort_last,
  effect = excluded.effect, pay_kind = excluded.pay_kind, applies_to = excluded.applies_to,
  status_code = excluded.status_code, action = excluded.action, aliases = excluded.aliases;

/**
 * How many of each person's appointments were set again on another day (Appointment-Rescheduled) on the
 * business's days p_from..p_to, by whoever set them. An administrator sees everyone's; anyone else their own.
 */
create or replace function public.rescheduled_appointments(p_from date, p_to date)
returns table (user_id bigint, rescheduled bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then null else public.app_user_id() end;
begin
  if not public.is_admin() and v_user is null then return; end if;
  return query
  select ap.user_id, count(*)
    from public.call_records c
    join public.call_results r on r.id = c.result_id and r.effect = 'reschedule'
    join public.appointments ap on ap.id = c.appointment_id
   where c.call_date >= (p_from::timestamp at time zone v_tz)
     and c.call_date <  ((p_to + 1)::timestamp at time zone v_tz)
     and ap.user_id is not null
     and (v_user is null or ap.user_id = v_user)
   group by ap.user_id;
end $$;
revoke execute on function public.rescheduled_appointments(date, date) from public, anon;
grant execute on function public.rescheduled_appointments(date, date) to authenticated;

create or replace function public.record_call_result(p_lead_id bigint, p_result_id bigint, p_notes text DEFAULT NULL::text, p_appointment jsonb DEFAULT NULL::jsonb, p_corrected_xdate date DEFAULT NULL::date, p_ultimate_xdate date DEFAULT NULL::date, p_client_note text DEFAULT NULL::text, p_lead_manager bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me       bigint := public.app_user_id();
  v_role     text   := public.app_role();
  v_notes    text   := nullif(btrim(coalesce(p_notes, '')), '');
  l          public.leads;
  r          public.call_results;
  a_r        public.call_results;      -- the appointment-stage twin of a DBDev result
  p          public.projects;          -- the project the call is made on
  v_type     text;
  v_appt     public.appointments;
  v_open     public.appointments;      -- an appointment the name already holds, which this one moves
  v_call     bigint;
  v_status   bigint;
  v_rep      bigint;
  v_old_xdate date;
  v_pay      jsonb := '[]'::jsonb;
  v_date     date;
  v_time     text;
  v_dev      bigint;                   -- Lead-Corrected: the lead manager who developed it
  v_back     jsonb;
  v_amt      numeric(10,2);
  v_was      public.appointments;      -- Appointment-Rescheduled: the appointment as it stood
  v_set      public.call_results;      -- …and the result it was set with (Appointment, Appointment-Phone)
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff can record call results' using errcode = '42501';
  end if;
  if length(coalesce(v_notes, '')) > 1000 then
    raise exception 'Keep call notes under 1,000 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_client_note, '')) > 2000 then
    raise exception 'Keep the note for the client under 2,000 characters' using errcode = '22023';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select * into r from public.call_results where id = p_result_id;
  if not found then
    raise exception 'Unknown call result' using errcode = '22023';
  end if;
  if r.applies_to = 'report' then
    raise exception '% is recorded automatically, not from a call', r.name using errcode = '22023';
  end if;

  select * into p from public.projects where id = l.project_id;
  if not found then
    raise exception 'This name is not in a project yet' using errcode = '22023';
  end if;
  v_type := public.project_type_code(p.id);

  -- An appointment follow-up acts on the name's open appointment, recorded
  -- against the stage that appointment was set at so each project counts it.
  if r.applies_to = 'appointment' then
    if r.effect = 'reschedule' then
      -- Appointment-Rescheduled (Sean, Nov 2026): the name's latest appointment, one marked invalid too
      -- (set again on another day), never one that failed QA.
      select * into v_appt from public.appointments
       where lead_id = l.id and deleted_at is null and qa_status is distinct from 'failed'
       order by appt_create_date desc, id desc
       limit 1
       for update;
    else
      select * into v_appt from public.appointments
       where lead_id = l.id and invalid_at is null
       order by appt_create_date desc, id desc
       limit 1
       for update;
    end if;
    if not found then
      raise exception 'This name has no appointment to %', case r.effect when 'confirm' then 'confirm' when 'reschedule' then 'reschedule' else 'mark invalid' end
        using errcode = '22023';
    end if;
    if r.effect = 'confirm' and v_appt.confirmed_at is not null then
      raise exception 'This appointment is already confirmed' using errcode = '22023';
    end if;
    select * into r from public.call_results
     where name = r.name and project_type = case coalesce(v_appt.set_stage, l.stage) when 'dbdev' then 'DBDV' else 'APPT' end;
  elsif r.project_type <> v_type then
    raise exception '% is not a result for % projects', r.name,
      case v_type when 'DBDV' then 'database-development' else 'appointment' end using errcode = '22023';
  end if;

  if v_role <> 'admin'
     and l.assigned_user_id is distinct from v_me
     and not exists (select 1 from public.project_assignments pa where pa.project_id = l.project_id and pa.ae_user_id = v_me)
     and not (r.applies_to = 'appointment' and coalesce(v_appt.follow_up_user_id, v_appt.user_id) = v_me) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;

  -- The call itself.
  insert into public.call_records (lead_id, project_id, user_id, call_result, notes, result_id, stage, call_date)
  values (l.id, l.project_id, v_me, r.name, v_notes, r.id, l.stage, now())
  returning id into v_call;

  select id into v_status from public.lead_statuses where code = r.status_code;

  update public.leads set
    result_id        = r.id,
    call_result_dbdv = case when r.project_type = 'DBDV' then r.name else call_result_dbdv end,
    call_result_appt = case when r.project_type = 'APPT' then r.name
                            when r.effect = 'appointment_invalid' and stage = 'appt' then r.name
                            else call_result_appt end,
    call_weight      = call_weight + case when r.applies_to = 'name' then 1 else 0 end,
    date_last_worked = now(),
    status_id        = coalesce(v_status, status_id),
    resolved_at      = case when r.viable then null else coalesce(resolved_at, now()) end,
    assigned_user_id = case when r.effect = 'pending' then null else assigned_user_id end
  where id = l.id;

  -- What the result does.
  if r.effect in ('promote', 'appointment') then
    -- A name becomes a Lead or an Appointment only with its renewal date
    -- confirmed: the Ultimate X-Date, entered (or corrected) with this result,
    -- or already on the record. A date on a policy line alone is a potential
    -- renewal the account manager has not confirmed yet.
    if p_ultimate_xdate is not null then
      update public.insurance_details set ultimate_xdate = p_ultimate_xdate where lead_id = l.id;
      if not found then
        insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_ultimate_xdate);
      end if;
    end if;
    if not exists (select 1 from public.insurance_details i where i.lead_id = l.id and i.ultimate_xdate is not null) then
      raise exception 'Enter the Ultimate X-Date: a name becomes a Lead or an Appointment only with its renewal date'
        using errcode = '22023';
    end if;

    -- What the client is told, with the lead sheet: written as the name is
    -- set (given empty, it is cleared). The call notes stay internal.
    if p_client_note is not null then
      update public.leads set client_note = nullif(btrim(p_client_note), '') where id = l.id;
    end if;

    if r.effect = 'appointment' then
      v_date := nullif(p_appointment->>'date', '')::date;
      v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
      if v_date is null then
        raise exception 'Choose the appointment date' using errcode = '22023';
      end if;
      if v_date < current_date - 1 then
        raise exception 'The appointment date has passed' using errcode = '22023';
      end if;
      if v_time is null then
        raise exception 'Choose the appointment time' using errcode = '22023';
      end if;
      if v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
        raise exception 'Give the time like 9:30 AM' using errcode = '22023';
      end if;
    end if;

    -- A name that already holds an appointment still to come, or still
    -- waiting for QA, has that one moved: one appointment, paid once.
    -- (Recording the result again is how a rep reschedules from the sheet.)
    -- One that failed QA does not count: the rep sets a real one instead.
    if r.effect = 'appointment' then
      select * into v_open from public.appointments
       where lead_id = l.id and invalid_at is null and qa_status is distinct from 'failed'
         and (qa_status = 'pending' or appt_date >= (now() at time zone public.business_tz())::date)
       order by appt_create_date desc, id desc
       limit 1
       for update;
    end if;

    if v_open.id is not null then
      update public.appointments set
        appt_date    = v_date,
        appt_time    = v_time,
        duration_min = coalesce(nullif(p_appointment->>'duration', '')::int, duration_min),
        rep_name     = coalesce(nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), rep_name),
        status_id    = case when status_id = (select id from public.appointment_statuses where name = 'Scheduled')
                             and (appt_date, coalesce(appt_time, '')) is distinct from (v_date, coalesce(v_time, ''))
                            then (select id from public.appointment_statuses where name = 'Rescheduled')
                            else status_id end,
        status_update_date = now()
      where id = v_open.id
      returning * into v_appt;
      -- "Moved" only when the day or the time changed.
      update public.call_records set
        appointment_id = v_appt.id,
        notes = case when (v_open.appt_date, coalesce(v_open.appt_time, '')) is distinct from (v_date, coalesce(v_time, ''))
                     then concat_ws(E'\n', notes, 'Appointment moved from ' || to_char(v_open.appt_date, 'Mon FMDD')
                            || coalesce(' ' || v_open.appt_time, '') || ' to ' || to_char(v_date, 'Mon FMDD') || coalesce(' ' || v_time, ''))
                     else notes end
      where id = v_call;
    else

      -- From DBDev, the name moves to the linked appointment project.
      if v_type = 'DBDV' then
        if p.appt_project_id is null then
          raise exception 'Link % to an appointment project before promoting its names', p.name using errcode = '22023';
        end if;
        select * into a_r from public.call_results
         where project_type = 'APPT' and name = case r.effect when 'promote' then 'Lead-No Contact' else r.name end;
        -- A new lead goes to the appointment manager with the fewest names; an
        -- appointment stays with the rep who set it, who confirms it.
        v_rep := case r.effect when 'promote' then public.least_loaded_rep(p.appt_project_id) else v_me end;
        update public.leads set
          stage             = 'appt',
          project_id        = p.appt_project_id,
          source_project_id = coalesce(source_project_id, l.project_id),
          dbdv_user_id      = v_me,
          assigned_user_id  = v_rep,
          result_id         = a_r.id,
          call_result_appt  = a_r.name,
          call_weight       = 0,
          promoted_at       = now(),
          resolved_at       = case when a_r.viable then null else now() end
        where id = l.id;
        -- Nobody is on the appointment project to take a new lead: the administrators
        -- hear of it, so a hot lead never waits unseen (Sean, Oct 2026).
        if r.effect = 'promote' and v_rep is null then
          perform public.notify_users(
            array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null),
            'lead',
            left(case when r.status_code = 'hot' then 'Hot lead waiting: ' else 'Lead waiting: ' end || coalesce(l.company_name, 'a lead'), 160),
            'Nobody is assigned to ' || coalesce((select pp.name from public.projects pp where pp.id = p.appt_project_id), 'its appointment project')
              || ' to take it. Add an appointment manager to that project, or send the lead to one.',
            '/leads/' || l.id,
            case when r.status_code = 'hot' then 'hot_lead' else 'lead_assigned' end);
        end if;
      end if;

      if r.effect = 'appointment' then
        insert into public.appointments
          (lead_id, user_id, rep_name, appt_date, appt_time, duration_min, status_id, list_source,
           call_result_dbdv, project_id, set_project_id, set_stage, call_record_id, qa_status)
        values
          (l.id, v_me, nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), v_date, v_time,
           coalesce(nullif(p_appointment->>'duration', '')::int, 30),
           (select id from public.appointment_statuses where name = 'Scheduled'),
           l.list_source,
           case when v_type = 'DBDV' then r.name end,
           coalesce(p.appt_project_id, p.id), p.id, l.stage, v_call, 'pending')
        returning * into v_appt;
        update public.leads set appt_created_date = now() where id = l.id;
        update public.call_records set appointment_id = v_appt.id where id = v_call;
      end if;

      v_pay := v_pay || public.pay(v_me, p.id, r.pay_kind, l.id, v_appt.id, v_call);

    end if;

  elsif r.effect = 'confirm' then
    update public.appointments set
      status_id    = (select id from public.appointment_statuses where name = 'Confirmed'),
      confirmed_at = now(),
      confirmed_by = v_me,
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := v_pay || public.pay(v_me, coalesce(v_appt.set_project_id, p.id), 'confirmation', l.id, v_appt.id, v_call);
    -- The client hears now only if QA has already let them see it.
    if coalesce(v_appt.qa_status, 'passed') = 'passed' then
      perform public.notify_client_appointment(v_appt.id, true);
    end if;

  elsif r.effect = 'reschedule' then
    -- Appointment-Rescheduled (Sean, Nov 2026): the same appointment, on its new day and time. One marked
    -- invalid is an appointment again: its pay back to whoever set it, as a new appointment, and its
    -- confirmation still to come. One already confirmed is to be confirmed again, its confirmation pay
    -- taken back until it is. Counted against whoever set it (how many of theirs need rescheduling).
    v_date := nullif(p_appointment->>'date', '')::date;
    v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
    if v_date is null then
      raise exception 'Choose the new appointment date' using errcode = '22023';
    end if;
    if v_date < (now() at time zone public.business_tz())::date then
      raise exception 'The appointment date has passed' using errcode = '22023';
    end if;
    if v_time is null then
      raise exception 'Choose the new appointment time' using errcode = '22023';
    end if;
    if v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
      raise exception 'Give the time like 9:30 AM' using errcode = '22023';
    end if;
    if v_appt.invalid_at is null and (v_appt.appt_date, coalesce(v_appt.appt_time, '')) = (v_date, v_time) then
      raise exception 'Choose the new appointment date or time: it is set for then already' using errcode = '22023';
    end if;
    v_was := v_appt;

    update public.appointments set
      appt_date    = v_date,
      appt_time    = v_time,
      duration_min = coalesce(nullif(p_appointment->>'duration', '')::int, duration_min),
      rep_name     = coalesce(nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), rep_name),
      status_id    = coalesce((select id from public.appointment_statuses where name = 'Rescheduled'), status_id),
      invalid_at   = null,
      confirmed_at = null,
      confirmed_by = null,
      rescheduled_at    = now(),
      rescheduled_count = coalesce(rescheduled_count, 0) + 1,
      status_update_date = now()
    where id = v_appt.id
    returning * into v_appt;

    update public.call_records set
      appointment_id = v_appt.id,
      notes = concat_ws(E'\n', notes, 'Appointment moved from ' || to_char(v_was.appt_date, 'Mon FMDD')
                || coalesce(' ' || v_was.appt_time, '') || case when v_was.invalid_at is not null then ' (marked invalid)' else '' end
                || ' to ' || to_char(v_date, 'Mon FMDD') || ' ' || v_time)
    where id = v_call;

    if v_was.invalid_at is not null then
      v_pay := v_pay || public.pay(v_appt.user_id, coalesce(v_appt.set_project_id, p.id), 'appointment', l.id, v_appt.id, v_call, 'Appointment rescheduled');
    elsif v_was.confirmed_at is not null then
      v_pay := v_pay || public.charge_back(l.id, v_appt.id, array['confirmation'], v_call, 'Appointment rescheduled: paid again when confirmed');
    end if;

    -- The name is an appointment again, as it was set (the lead's result is what the reports count it by):
    -- off the call list, any call back cancelled. The call itself stays Appointment-Rescheduled.
    select cr.* into v_set from public.call_records c join public.call_results cr on cr.id = c.result_id
     where c.id = v_appt.call_record_id;
    select * into v_set from public.call_results
     where project_type = case l.stage when 'dbdev' then 'DBDV' else 'APPT' end
       and name = case when v_set.name in ('Appointment', 'Appointment-Phone') then v_set.name else 'Appointment' end;
    update public.leads set
      result_id        = v_set.id,
      call_result_appt = case when stage = 'appt' then v_set.name else call_result_appt end,
      call_result_dbdv = case when v_appt.set_stage = 'dbdev' or stage = 'dbdev' then v_set.name else call_result_dbdv end,
      status_id        = coalesce((select s.id from public.lead_statuses s where s.code = v_set.status_code), status_id),
      resolved_at      = coalesce(resolved_at, now()),
      call_back_on     = null
    where id = l.id;

    -- The client's people hear in Lighthouse too (their email says RESCHEDULED), once QA has let them see it.
    if coalesce(v_appt.qa_status, 'passed') = 'passed' then
      perform public.notify_users(
        array(select u.id from public.users u
               where u.role = 'client' and u.company_id = (select pr.company_id from public.projects pr where pr.id = coalesce(v_appt.project_id, l.project_id))),
        'appointment',
        'Appointment rescheduled: ' || coalesce(l.company_name, 'a lead'),
        concat_ws(' · ', 'Now ' || to_char(v_date, 'Dy Mon FMDD') || ' at ' || v_time, 'was ' || to_char(v_was.appt_date, 'Mon FMDD') || coalesce(' ' || v_was.appt_time, '')),
        '/calendar?view=day&d=' || v_date::text || '&a=' || v_appt.id,
        'appt_confirmed', null, v_appt.user_id);
    end if;

  elsif r.effect = 'appointment_invalid' then
    update public.appointments set
      invalid_at = now(),
      status_id  = (select id from public.appointment_statuses where name = 'Invalid'),
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := public.charge_back(l.id, v_appt.id, array['appointment', 'confirmation'], v_call, 'Appointment invalid');

  elsif r.effect = 'lead_invalid' then
    update public.leads set call_result_dbdv = 'Lead-Invalid' where id = l.id and source_project_id is not null;
    v_pay := public.charge_back(l.id, null, array['lead'], v_call, 'Lead invalid');
    -- No record of the original payment (an older lead): charge the developer at today's rate.
    if jsonb_array_length(v_pay) = 0 and l.dbdv_user_id is not null and l.source_project_id is not null then
      insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
      select l.dbdv_user_id, l.source_project_id, l.id, v_call, 'lead', -sp.lead_rate, 'Lead invalid (no original payment on record)', v_me
        from public.projects sp where sp.id = l.source_project_id;
      v_pay := jsonb_build_array(jsonb_build_object('user_id', l.dbdv_user_id, 'kind', 'lead',
                 'amount', -(select lead_rate from public.projects where id = l.source_project_id)));
    end if;
    if l.dbdv_user_id is not null then
      perform public.notify_users(
        array[l.dbdv_user_id], 'lead', 'Lead marked invalid: ' || coalesce(l.company_name, 'a lead'),
        concat_ws(' · ', 'Charged back on your production report', 'marked by ' || public.actor_name()),
        '/leads/' || l.id, 'lead_invalid');
    end if;

  elsif r.effect = 'correct_xdate' then
    if p_corrected_xdate is null then
      raise exception 'Enter the corrected renewal date' using errcode = '22023';
    end if;
    v_old_xdate := public.lead_renewal_date(l.id);
    -- The corrected date becomes the lead's ultimate X-date, which is its
    -- renewal; the dates on the individual policy lines are left as recorded.
    update public.insurance_details set ultimate_xdate = p_corrected_xdate where lead_id = l.id;
    if not found then
      insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_corrected_xdate);
    end if;
    update public.leads set original_xdate = coalesce(original_xdate, v_old_xdate) where id = l.id;
    update public.call_records
       set notes = concat_ws(E'\n', notes, 'Renewal corrected from '
                   || coalesce(to_char(v_old_xdate, 'FMMonth YYYY'), 'none') || ' to ' || to_char(p_corrected_xdate, 'FMMonth YYYY'))
     where id = v_call;

    -- Lead-Corrected pay (Sean, Nov 2026): the lead pay of the lead manager who developed it moves to
    -- whoever corrected it, once a lead. A lead with no developer on record names one (p_lead_manager:
    -- the lead manager picked, kept as its developer; 0: nobody, a lead we didn't develop, so no pay moves).
    v_dev := coalesce(l.dbdv_user_id, nullif(p_lead_manager, 0));
    if l.dbdv_user_id is null and p_lead_manager is null then
      raise exception 'Choose the lead manager who developed this lead' using errcode = '22023';
    end if;
    if l.dbdv_user_id is null and v_dev is not null then
      if not exists (select 1 from public.users where id = v_dev and role in ('admin', 'manager', 'agent')) then
        raise exception 'Choose a lead manager from the list' using errcode = '22023';
      end if;
      update public.leads set dbdv_user_id = v_dev where id = l.id;
    end if;
    if v_dev is not null and v_dev <> v_me and not exists (
         select 1 from public.pay_events pe
          where pe.lead_id = l.id and pe.kind = 'corrected' and not pe.is_chargeback
            and not exists (select 1 from public.pay_events x where x.reverses_id = pe.id)) then
      v_back := public.charge_back(l.id, null, array['lead'], v_call, 'Lead corrected by ' || public.actor_name());
      v_amt := coalesce(-(select sum((e->>'amount')::numeric) from jsonb_array_elements(v_back) e where e->>'kind' = 'lead'), 0);
      -- No record of the original payment (an older or imported lead): the developer is charged the project's lead rate.
      if v_amt = 0 then
        select pr.lead_rate into v_amt from public.projects pr where pr.id = coalesce(l.source_project_id, l.project_id);
        v_amt := coalesce(v_amt, 0);
        if v_amt > 0 then
          insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
          values (v_dev, coalesce(l.source_project_id, l.project_id), l.id, v_call, 'lead', -v_amt, 'Lead corrected (no original payment on record)', v_me);
          v_back := v_back || jsonb_build_array(jsonb_build_object('user_id', v_dev, 'kind', 'lead', 'amount', -v_amt));
        end if;
      end if;
      if v_amt > 0 then
        insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
        values (v_me, p.id, l.id, v_call, 'corrected', v_amt,
                'Lead corrected, developed by ' || coalesce((select nullif(concat_ws(' ', first_name, last_name), '') from public.users where id = v_dev), 'another manager'), v_me);
        v_pay := v_pay || v_back || jsonb_build_array(jsonb_build_object('user_id', v_me, 'kind', 'corrected', 'amount', v_amt));
        perform public.notify_users(
          array[v_dev], 'lead', 'Lead corrected: ' || coalesce(l.company_name, 'a lead'),
          concat_ws(' · ', 'Its lead pay moves to ' || public.actor_name() || ', who corrected it', 'see the call on its Conversation'),
          '/leads/' || l.id);
      end if;
    end if;
  end if;

  -- A bonus hit with this result: its manager congratulated (Sean, Nov 2026).
  perform public.bonus_notify(v_me);

  -- What was said on the call joins the lead's internal notes, their running
  -- history (as the old system kept them), stamped as the rep wrote it.
  if v_notes is not null then
    insert into public.lead_notes (lead_id, notes)
    select l.id, btrim(c.notes) from public.call_records c where c.id = v_call
    on conflict (lead_id) do update
      set notes = concat_ws(E'\n', nullif(btrim(public.lead_notes.notes), ''), excluded.notes);
  end if;

  select * into l from public.leads where id = l.id;
  return jsonb_build_object(
    'call_record_id', v_call,
    'lead_id',        l.id,
    'result',         r.name,
    'stage',          l.stage,
    'project_id',     l.project_id,
    'promoted',       l.project_id is distinct from p.id,
    'on_list',        (select viable and callable from public.call_results where id = l.result_id) and l.assigned_user_id is not null,
    'appointment_id', v_appt.id,
    'rescheduled',    v_open.id is not null or r.effect = 'reschedule',
    'pay',            v_pay);
end $function$;


revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date, text, bigint) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date, text, bigint) to authenticated;

notify pgrst, 'reload schema';
