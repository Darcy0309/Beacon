-- ---------------------------------------------------------------------------
-- Lighthouse CRM — fixes from the October audit
--
--   1. One appointment per name at a time: recording "Appointment" again on
--      a name whose appointment is still to come (or waiting for QA) moves
--      it instead of setting and paying a second; a lead pays its developer
--      once unless that payment was charged back.
--   2. QA, confirmation and invalid marks change only through their own
--      steps; an appointment saved from a form waits for QA like one set
--      from a call.
--   3. A client's feedback can only be about their own leads and
--      appointments, filed now, as Open.
--   4. Two internal functions closed to signed-out callers.
--   5. Dashboard and report figures on the business's day: today, this week
--      (not every future appointment), lead volume per day and month; and
--      appointments marked invalid left out of every count.
--   6. The business time zone accepts only names a browser understands.
--   7. A client's appointment message comes from the rep who set it (their
--      reply goes there), and still arrives when "Appointment confirmed" is
--      switched off.
--   8. Alert rule names and log rows that say what really happened.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. One appointment per name at a time; a lead paid once
-- ---------------------------------------------------------------------------

create or replace function public.record_call_result(
  p_lead_id bigint,
  p_result_id bigint,
  p_notes text default null,
  p_appointment jsonb default null,
  p_corrected_xdate date default null
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
    if r.effect = 'appointment' then
      v_date := nullif(p_appointment->>'date', '')::date;
      v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
      if v_date is null then
        raise exception 'Choose the appointment date' using errcode = '22023';
      end if;
      if v_date < current_date - 1 then
        raise exception 'The appointment date has passed' using errcode = '22023';
      end if;
      if v_time is not null and v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
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
      update public.call_records set
        appointment_id = v_appt.id,
        notes = concat_ws(E'\n', notes, 'Appointment moved from ' || to_char(v_open.appt_date, 'Mon FMDD')
                  || coalesce(' ' || v_open.appt_time, '') || ' to ' || to_char(v_date, 'Mon FMDD') || coalesce(' ' || v_time, ''))
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

revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date) to authenticated;

create or replace function public.pay(p_user bigint, p_project bigint, p_kind text, p_lead bigint,
                                      p_appointment bigint, p_call bigint, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_id bigint;
begin
  -- A lead is developed once: no second payment for it unless the first was
  -- charged back (a lead moved back to its DBDev project and promoted again).
  if p_kind = 'lead' and exists (
       select 1 from public.pay_events pe
        where pe.lead_id = p_lead and pe.kind = 'lead' and not pe.is_chargeback
          and not exists (select 1 from public.pay_events r where r.reverses_id = pe.id)) then
    return '[]'::jsonb;
  end if;
  select case p_kind when 'lead' then lead_rate when 'appointment' then appointment_rate else confirmation_rate end
    into v_amount from public.projects where id = p_project;
  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, note, created_by)
  values (p_user, p_project, p_lead, p_appointment, p_call, p_kind, coalesce(v_amount, 0), p_note, public.app_user_id())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'user_id', p_user, 'kind', p_kind, 'amount', coalesce(v_amount, 0));
end $$;
revoke execute on function public.pay(bigint, bigint, text, bigint, bigint, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. QA, confirmation and invalid marks only through their own steps
--
-- review_appointment_qa() and record_call_result() run as their owner, so
-- `current_user` is 'authenticated' only for a direct write through the API
-- (or a form). Administrators keep the power to correct a record by hand.
-- ---------------------------------------------------------------------------

create or replace function public.tg_appointments_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      -- Saved from a form: it waits for QA, and nothing is confirmed or invalid yet.
      new.qa_status := 'pending';
      new.qa_by := null; new.qa_at := null; new.qa_note := null;
      new.confirmed_at := null; new.confirmed_by := null; new.invalid_at := null;
    elsif (new.qa_status, new.qa_by, new.qa_at, new.qa_note, new.confirmed_at, new.confirmed_by, new.invalid_at)
          is distinct from (old.qa_status, old.qa_by, old.qa_at, old.qa_note, old.confirmed_at, old.confirmed_by, old.invalid_at) then
      raise exception 'QA, confirmation and invalid marks are recorded through QA and call results'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard
  before insert or update on public.appointments
  for each row execute function public.tg_appointments_guard();

create or replace function public.review_appointment_qa(p_appointment_id bigint, p_passed boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_role text   := public.app_role();
  v_appt public.appointments;
  v_lead text;
begin
  if v_me is null or v_role not in ('admin', 'agent') then
    raise exception 'Only administrators and QA staff can review appointments' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'That appointment no longer exists' using errcode = 'P0002';
  end if;
  if v_appt.qa_status is distinct from 'pending' then
    raise exception 'This appointment has already been reviewed' using errcode = '22023';
  end if;
  if v_appt.user_id = v_me and v_role <> 'admin' then
    raise exception 'Someone else has to QA an appointment you set' using errcode = '42501';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Keep the QA note under 500 characters' using errcode = '22023';
  end if;

  update public.appointments set
    qa_status = case when p_passed then 'passed' else 'failed' end,
    qa_by = v_me, qa_at = now(), qa_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_appt.id;
  update public.call_records set
    qa_result = case when p_passed then 'Passed' else 'Failed' end,
    qa_date = now()
  where id = v_appt.call_record_id;

  select company_name into v_lead from public.leads where id = v_appt.lead_id;
  if p_passed then
    -- The client hears of it now for the first time.
    perform public.notify_client_appointment(v_appt.id, v_appt.confirmed_at is not null, true);
  elsif v_appt.user_id is not null then
    perform public.notify_users(
      array[v_appt.user_id], 'appointment', 'Appointment failed QA: ' || coalesce(v_lead, 'a lead'),
      coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'See the lead sheet for details'),
      '/leads/' || v_appt.lead_id, 'appt_qa');
  end if;
  return jsonb_build_object('appointment_id', v_appt.id, 'qa_status', case when p_passed then 'passed' else 'failed' end);
end $$;
revoke execute on function public.review_appointment_qa(bigint, boolean, text) from public, anon;
grant execute on function public.review_appointment_qa(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A client's feedback: about their own leads and appointments, filed now, as Open
-- ---------------------------------------------------------------------------

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    (select public.is_staff())
    or (user_id = (select public.app_user_id())
        and (lead_id is null
             or lead_id in (select l.id from public.leads l where l.project_id in (select public.client_project_ids())))
        -- Row Level Security on appointments leaves a client only their own (QA-passed) ones.
        and (appointment_id is null or appointment_id in (select a.id from public.appointments a)))
  );

create or replace function public.tg_feedback_client_fields()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_staff() then
    new.created_at   := now();
    new.fb_status_id := (select id from public.fb_statuses where name = 'Open');
  end if;
  return new;
end $$;

drop trigger if exists feedback_client_fields on public.feedback;
create trigger feedback_client_fields
  before insert on public.feedback
  for each row execute function public.tg_feedback_client_fields();

-- ---------------------------------------------------------------------------
-- 4. Internal functions closed to signed-out callers (both refused them in
--    their bodies already; now the grant says so too)
-- ---------------------------------------------------------------------------

revoke execute on function public.mfa_status() from public, anon;
grant execute on function public.mfa_status() to authenticated;
revoke execute on function public.send_notification(bigint[], text[], text, text, text) from public, anon;
grant execute on function public.send_notification(bigint[], text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Dashboard and report figures on the business's day
-- ---------------------------------------------------------------------------

/** Appointments booked per rep, busiest first; ones marked invalid do not count. */
create or replace function public.rep_workload()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'appts', c.n)
           order by c.n desc, u.id
         ), '[]'::jsonb)
    from (select user_id, count(*) as n from public.appointments
           where user_id is not null and invalid_at is null group by user_id) c
    join public.users u on u.id = c.user_id
   where u.role in ('manager', 'agent');
$$;

/** Leads assigned to and appointments (not marked invalid) owned by each user. */
create or replace view public.user_workload with (security_invoker = true) as
  select u.id as user_id,
         (select count(*) from public.leads l where l.assigned_user_id = u.id) as lead_count,
         (select count(*) from public.appointments a where a.user_id = u.id and a.invalid_at is null) as appt_count
    from public.users u;

/**
 * Everything the dashboard tiles and chart need. Days are the business's
 * (business_tz()), not the server's UTC ones: "today" is today there, and
 * "this week" is its last seven days up to and including today, so a
 * meeting booked for next month is not counted in this week's figure.
 * Appointments marked invalid do not count.
 */
create or replace function public.dashboard_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select (now() at time zone public.business_tz())::date as today
  ), l as (
    select coalesce(lead_date, created_at) as at from public.leads
  ), a as (
    select appt_date from public.appointments where invalid_at is null
  ), weeks as (
    -- Eight weeks, oldest first; the last ends today.
    select i,
           now() - ((8 - i) * interval '7 days') as start_at,
           now() - ((7 - i) * interval '7 days') as end_at,
           z.today - ((7 - i) * 7 + 6) as first_day,
           z.today - ((7 - i) * 7)     as last_day
      from generate_series(0, 7) as i, z
  )
  select jsonb_build_object(
    'leads_total',    (select count(*) from l),
    'leads_30d',      (select count(*) from l where at >= now() - interval '30 days'),
    'leads_30_60d',   (select count(*) from l where at >= now() - interval '60 days' and at < now() - interval '30 days'),
    'appts_total',    (select count(*) from a),
    'appts_today',    (select count(*) from a, z where a.appt_date = z.today),
    'appts_7d',       (select count(*) from a, z where a.appt_date between z.today - 6 and z.today),
    'appts_7_14d',    (select count(*) from a, z where a.appt_date between z.today - 13 and z.today - 7),
    'active_clients', (select count(*) from public.companies where status = 'active'),
    'weeks',          (select jsonb_agg(jsonb_build_object(
                          'leads', (select count(*) from l where l.at >= w.start_at and l.at < w.end_at),
                          'appts', (select count(*) from a where a.appt_date between w.first_day and w.last_day)
                        ) order by w.i) from weeks w),
    'project_leads',  (select coalesce(jsonb_agg(coalesce(c.n, 0) order by p.id), '[]'::jsonb)
                         from public.projects p
                         left join (select project_id, count(*) as n from public.leads group by project_id) c on c.project_id = p.id),
    'reps',           public.rep_workload()
  );
$$;

/**
 * Everything the reports page needs. Months are the business's (a lead
 * entered on the evening of the 30th belongs to that month, not the next),
 * each with its average client rating; appointments marked invalid do not
 * count.
 */
create or replace function public.report_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), l as (
    select state, status_id, to_char(coalesce(lead_date, created_at) at time zone z.tz, 'YYYY-MM') as ym from public.leads, z
  ), a as (
    select status_id, to_char(appt_date, 'YYYY-MM') as ym from public.appointments where invalid_at is null
  ), f as (
    select rating, to_char(created_at at time zone z.tz, 'YYYY-MM') as ym from public.feedback, z where rating is not null
  ), months as (
    select i, date_trunc('month', now() at time zone z.tz) - (i * interval '1 month') as m
      from generate_series(0, 5) as i, z
  )
  select jsonb_build_object(
    'leads',          (select count(*) from l),
    'appts',          (select count(*) from a),
    'projects',       (select count(*) from public.projects),
    'held',           (select count(*) from a join public.appointment_statuses s on s.id = a.status_id where s.name = 'Held'),
    'ratings',        (select jsonb_build_object('count', count(rating), 'avg', coalesce(avg(rating), 0)) from f),
    'by_status',      (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from l group by status_id) c
                         join public.lead_statuses s on s.id = c.status_id),
    'by_state',       (select coalesce(jsonb_agg(jsonb_build_array(t.state, t.n) order by t.n desc, t.state), '[]'::jsonb)
                         from (select state, count(*) as n from l where state is not null group by state order by n desc, state limit 8) t),
    'appt_by_status', (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from a group by status_id) c
                         join public.appointment_statuses s on s.id = c.status_id),
    'months',         (select jsonb_agg(jsonb_build_object(
                          'key',    to_char(m.m, 'YYYY-MM'),
                          'label',  to_char(m.m, 'Mon'),
                          'leads',  (select count(*) from l where l.ym = to_char(m.m, 'YYYY-MM')),
                          'appts',  (select count(*) from a where a.ym = to_char(m.m, 'YYYY-MM')),
                          'rating', (select round(avg(f.rating), 1) from f where f.ym = to_char(m.m, 'YYYY-MM'))
                        ) order by m.i desc) from months m)
  );
$$;

/** New leads per day over the last year, by the business's calendar day (only days that have any). */
create or replace function public.lead_volume_daily(p_days int default 366)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'leads', t.n) order by t.day), '[]'::jsonb)
    from (
      select (coalesce(l.lead_date, l.created_at) at time zone public.business_tz())::date as day, count(*) as n
        from public.leads l
       where coalesce(l.lead_date, l.created_at) >= now() - make_interval(days => least(greatest(coalesce(p_days, 366), 1), 800))
       group by 1
    ) t;
$$;

-- ---------------------------------------------------------------------------
-- 6. A business time zone a browser understands
--
-- pg_timezone_names also holds posix/… and right/… variants and "Factory",
-- which JavaScript's Intl rejects: every page that asks for "today" would fail.
-- ---------------------------------------------------------------------------

create or replace function public.business_tz()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value->>'name' from public.app_settings s
      where s.key = 'business_timezone'
        and s.value->>'name' !~ '^(posix|right)/' and s.value->>'name' <> 'Factory'
        and exists (select 1 from pg_timezone_names z where z.name = s.value->>'name')),
    'America/Phoenix');
$$;

-- ---------------------------------------------------------------------------
-- 7. A client's appointment message: from the rep who set it, and never lost
-- ---------------------------------------------------------------------------

drop function if exists public.notify_users(bigint[], text, text, text, text, text, uuid);

/**
 * As before (skips a rule switched off, inactive accounts and whoever caused
 * the event; logs what it sent), with `p_sender`: who the message is from,
 * when that is not the person acting (a QA reviewer passing an appointment
 * the client should hear about from the rep who set it).
 */
create or replace function public.notify_users(
  p_recipients bigint[],
  p_kind       text,
  p_title      text,
  p_body       text,
  p_link       text,
  p_rule       text   default null,
  p_batch      uuid   default null,
  p_sender     bigint default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_rule_id bigint;
  v_enabled boolean;
  v_actor   bigint := public.app_user_id();
  v_count   int;
begin
  if p_rule is not null then
    select id, enabled into v_rule_id, v_enabled
      from public.alert_rules where trigger = p_rule order by id limit 1;
    if v_rule_id is not null and not v_enabled then
      return 0;
    end if;
  end if;

  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, link)
  select u.id, coalesce(p_sender, v_actor), p_batch, p_kind, left(p_title, 160), left(p_body, 1000), p_link
    from public.users u
   where u.id = any(p_recipients)
     and u.status = 'active'
     and u.id is distinct from v_actor;
  get diagnostics v_count = row_count;

  if v_count > 0 and v_rule_id is not null then
    insert into public.alert_log (rule_id, subject, detail, status)
    values (v_rule_id, left(p_title, 200),
            format('In-app to %s %s', v_count, case when v_count = 1 then 'person' else 'people' end),
            'sent');
  end if;
  return v_count;
end $$;
revoke execute on function public.notify_users(bigint[], text, text, text, text, text, uuid, bigint) from public, anon, authenticated;

drop function if exists public.notify_client_appointment(bigint, boolean);

/**
 * Tell the client about one appointment, from the rep who set it.
 * `p_first`: the client has not heard of it yet (QA has just passed it).
 * Then, if it is already confirmed but "Appointment confirmed" is switched
 * off, they are still told it is set, under "Appointment set".
 */
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
    '/calendar?view=day&d=' || coalesce(a.appt_date, current_date)::text,
    case when v_confirmed then 'appt_confirmed' else 'appt_created' end,
    null,
    a.user_id);
end $$;
revoke execute on function public.notify_client_appointment(bigint, boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Alert rules that say what really happens
-- ---------------------------------------------------------------------------

-- One message per finished import, not a daily summary.
update public.alert_rules set name = 'Import finished' where trigger = 'import_done' and name = 'Daily import summary';

-- Nothing sends the X-date and appointment reminders yet (no scheduled job
-- exists), so any log rows under them are demo data, not real dispatches.
delete from public.alert_log
 where rule_id in (select id from public.alert_rules where trigger in ('xdate_30d', 'appt_reminder'));
