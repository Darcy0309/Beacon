-- ---------------------------------------------------------------------------
-- Lighthouse CRM — call notes keep the lead's internal history (Sean, Oct 2026)
--
-- The notes a rep writes on a call ("10/8/26 seanf: spoke with Daniel…") are
-- added to the end of the lead's Internal notes, as the old system kept its
-- running history there; they stay on the call in the call history too.
-- Calls already made in Lighthouse are added once, in the order they were
-- made (a note already there is not added again, so running this twice
-- changes nothing).
-- ---------------------------------------------------------------------------

drop function if exists public.record_call_result(bigint, bigint, text, jsonb, date, date, text);

create function public.record_call_result(
  p_lead_id bigint,
  p_result_id bigint,
  p_notes text default null,
  p_appointment jsonb default null,
  p_corrected_xdate date default null,
  p_ultimate_xdate date default null,
  p_client_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
    select * into v_appt from public.appointments
     where lead_id = l.id and invalid_at is null
     order by appt_create_date desc, id desc
     limit 1
     for update;
    if not found then
      raise exception 'This name has no appointment to %', case r.effect when 'confirm' then 'confirm' else 'mark invalid' end
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
     and not (r.applies_to = 'appointment' and v_appt.user_id = v_me) then
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
  end if;

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
    'rescheduled',    v_open.id is not null,
    'pay',            v_pay);
end $$;

revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date, text) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date, text) to authenticated;

-- The calls made so far.
with calls as (
  select c.lead_id, string_agg(btrim(c.notes), E'\n' order by c.call_date, c.id) as notes
    from public.call_records c
    left join public.lead_notes n on n.lead_id = c.lead_id
   where nullif(btrim(coalesce(c.notes, '')), '') is not null
     and position(btrim(c.notes) in coalesce(n.notes, '')) = 0
   group by c.lead_id
)
insert into public.lead_notes (lead_id, notes)
select lead_id, notes from calls
on conflict (lead_id) do update
  set notes = concat_ws(E'\n', nullif(btrim(public.lead_notes.notes), ''), excluded.notes);
