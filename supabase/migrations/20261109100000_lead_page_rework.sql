-- The lead page as Sean laid it out (Oct 2026).
--
--   1. The Business tab's details: the location building (owned or leased,
--      its age, stories and acres), employees full-time and part-time,
--      sub-contractors as a share, the kinds of vehicles and how far they
--      travel. Locations, employees, autos, professionals and covered
--      employees were already columns.
--   2. Where a name stands is its call result: the reports count leads by
--      call result, not by the old system's statuses.
--   3. A hot lead with nobody on the appointment project to take it: the
--      administrators are told (it went to nobody, and nobody heard).
--   4. send_lead(): hand a lead to another manager with a note and a time to
--      call; they are told once, and a call-back reminder is set for them.
--   5. Policy files: a private bucket for files kept with a lead, who may add
--      and open them, and who hears of a new one.
--
-- Safe to run again.

-- --- 1. The Business tab ----------------------------------------------------
alter table public.leads
  add column if not exists location_ownership text check (location_ownership in ('own', 'lease')),
  add column if not exists building_age integer check (building_age between 0 and 500),
  add column if not exists building_stories integer check (building_stories between 0 and 300),
  add column if not exists building_acres numeric(10, 2) check (building_acres >= 0 and building_acres < 100000),
  add column if not exists employees_full_time integer check (employees_full_time between 0 and 1000000),
  add column if not exists employees_part_time integer check (employees_part_time between 0 and 1000000),
  add column if not exists subcontractors_pct numeric(5, 2) check (subcontractors_pct between 0 and 100),
  add column if not exists auto_types text[] check (auto_types <@ array['cars', 'vans', 'delivery_trucks', 'big_rigs', 'tow_trucks']::text[]),
  add column if not exists travel_radius text check (travel_radius in ('25', '50', '100', '250', '300', '500+'));

comment on column public.leads.location_ownership is 'The location building: own or lease.';
comment on column public.leads.subcontractors_pct is 'Sub-contractors, as a % of the work force.';
comment on column public.leads.auto_types is 'Kinds of vehicles: cars, vans, delivery_trucks, big_rigs, tow_trucks.';
comment on column public.leads.travel_radius is 'How far the vehicles travel, in miles: 25, 50, 100, 250, 300 or 500+.';

-- --- 2. Reports by call result ----------------------------------------------
CREATE OR REPLACE FUNCTION public.report_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with z as (
    select public.business_tz() as tz
  ), l as (
    select state, status_id, result_id, to_char(coalesce(lead_date, created_at) at time zone z.tz, 'YYYY-MM') as ym from public.leads, z
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
    -- Where the names stand, by call result (by name: the two stages share some).
    'by_status',      (select coalesce(jsonb_object_agg(c.name, c.n), '{}'::jsonb)
                         from (select r.name, count(*) as n from l join public.call_results r on r.id = l.result_id group by r.name) c),
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
$function$;

-- --- 3. A hot lead with nobody to take it -----------------------------------
-- A new lead goes to the appointment manager on the appointment project with
-- the fewest names. With nobody on that project it went to nobody, and
-- nobody heard. Now the administrators do. As it was but for that.
CREATE OR REPLACE FUNCTION public.record_call_result(p_lead_id bigint, p_result_id bigint, p_notes text DEFAULT NULL::text, p_appointment jsonb DEFAULT NULL::jsonb, p_corrected_xdate date DEFAULT NULL::date, p_ultimate_xdate date DEFAULT NULL::date, p_client_note text DEFAULT NULL::text)
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
end $function$;

-- --- 4. Sending a lead to someone to call -----------------------------------
-- An administrator or manager hands a lead to another manager (or agent)
-- with a note and, if they like, a time to call: it is theirs to work, they
-- are told once (with the note), and a call-back reminder for them is set.
CREATE OR REPLACE FUNCTION public.tg_notify_leads_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  -- A lead sent to someone with a note (send_lead()) says so itself, once.
  if current_setting('lighthouse.quiet_assign', true) = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    for r in
      select n.assigned_user_id as uid, n.project_id as pid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
       group by 1, 2, 3
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name, r.pid);
    end loop;
  else
    for r in
      select n.assigned_user_id as uid, n.project_id as pid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        join old_rows o on o.id = n.id
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
         and n.assigned_user_id is distinct from o.assigned_user_id
         -- The rep who set an appointment keeps it; that is not a new assignment.
         and n.assigned_user_id is distinct from public.app_user_id()
       group by 1, 2, 3
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name, r.pid);
    end loop;
  end if;
  return null;
end $function$;

drop function if exists public.send_lead(bigint, bigint, text, timestamptz, boolean);
create or replace function public.send_lead(p_lead bigint, p_to bigint, p_note text default null, p_date date default null, p_time text default null, p_assign boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_lead public.leads;
  v_to   public.users;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_tz   text := public.business_tz();
  v_time time;
  v_at   timestamptz;
begin
  if v_me is null or public.app_role() not in ('admin', 'manager') then
    raise exception 'Only administrators and managers send a lead to someone' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead and deleted_at is null;
  if v_lead.id is null then
    raise exception 'That lead is no longer there' using errcode = 'P0002';
  end if;
  select * into v_to from public.users
   where id = p_to and status = 'active' and deleted_at is null and role in ('admin', 'manager', 'agent');
  if v_to.id is null then
    raise exception 'Choose someone on the team to send it to' using errcode = '22023';
  end if;
  if v_to.id = v_me then
    raise exception 'Choose someone other than yourself' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters' using errcode = '22023';
  end if;
  -- A time to call, on the business's clock, as a call-back reminder reads one.
  if p_date is not null or nullif(btrim(coalesce(p_time, '')), '') is not null then
    begin
      v_time := to_timestamp(upper(btrim(p_time)), 'HH12:MI AM')::time;
    exception when others then
      raise exception 'Choose a time like 2:00 PM' using errcode = '22023';
    end;
    if p_date is null or v_time is null then
      raise exception 'Choose both the day and the time to call' using errcode = '22023';
    end if;
    v_at := (p_date + v_time) at time zone v_tz;
    if v_at < now() - interval '1 minute' then
      raise exception 'That time has already passed' using errcode = '22023';
    end if;
  end if;

  if p_assign and v_lead.assigned_user_id is distinct from v_to.id then
    perform set_config('lighthouse.quiet_assign', 'on', true);
    update public.leads set assigned_user_id = v_to.id where id = v_lead.id;
    perform set_config('lighthouse.quiet_assign', 'off', true);
  end if;
  if v_at is not null then
    insert into public.reminders (lead_id, user_id, remind_at, note)
    values (v_lead.id, v_to.id, v_at, left(coalesce(v_note, 'Sent by ' || coalesce(public.actor_name(), 'a manager')), 300));
  end if;
  perform public.notify_users(
    array[v_to.id], 'lead',
    left('Lead to call: ' || coalesce(v_lead.company_name, 'a lead'), 160),
    left(concat_ws(' · ',
      'From ' || coalesce(public.actor_name(), 'a manager'),
      case when p_assign then 'It is yours to work' end,
      case when v_at is not null then 'Call ' || to_char(v_at at time zone v_tz, 'Dy MM/DD/YYYY FMHH12:MI AM') end,
      v_note), 1000),
    '/leads/' || v_lead.id,
    'lead_assigned');
  return jsonb_build_object('lead', v_lead.id, 'to', v_to.id, 'assigned', p_assign, 'remind_at', v_at);
end $$;
revoke execute on function public.send_lead(bigint, bigint, text, date, text, boolean) from public, anon;
grant execute on function public.send_lead(bigint, bigint, text, date, text, boolean) to authenticated;

-- --- 5. Policy files on a lead ------------------------------------------------
-- Files a prospect sends (policies, dec pages, photos), kept with the lead:
-- in a private bucket under lead/<lead id>/, with a documents row each. Anyone
-- who can see the lead (administrators, managers, agents, and the client's
-- own people for their projects' leads) adds and opens them; Row Level
-- Security on leads decides who that is. Deleting one sets the delete flag.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-files', 'lead-files', false, 26214400,
        array['application/pdf', 'image/*', 'text/plain', 'text/csv', 'message/rfc822', 'application/vnd.ms-outlook',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lead_files_insert on storage.objects;
create policy lead_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lead-files' and (storage.foldername(name))[1] = 'lead'
              and public.app_user_id() is not null
              and exists (select 1 from public.leads l where l.id::text = (storage.foldername(name))[2]));
drop policy if exists lead_files_read on storage.objects;
create policy lead_files_read on storage.objects for select to authenticated
  using (bucket_id = 'lead-files' and (storage.foldername(name))[1] = 'lead'
         and public.app_user_id() is not null
         and exists (select 1 from public.leads l where l.id::text = (storage.foldername(name))[2]));

-- A file on a lead belongs to the lead's project and client, and to whoever added it.
create or replace function public.tg_documents_from_lead()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    select l.project_id, p.company_id into new.project_id, new.company_id
      from public.leads l left join public.projects p on p.id = l.project_id
     where l.id = new.lead_id;
  end if;
  -- Whoever is signed in added it; the server's own role keeps what it was given.
  new.uploaded_by := coalesce(public.app_user_id(), new.uploaded_by);
  return new;
end $$;
revoke execute on function public.tg_documents_from_lead() from public, anon, authenticated;
drop trigger if exists documents_from_lead on public.documents;
create trigger documents_from_lead before insert on public.documents
  for each row execute function public.tg_documents_from_lead();

-- The client's own people add files to their projects' leads (staff already may).
drop policy if exists documents_lead_insert on public.documents;
create policy documents_lead_insert on public.documents for insert to authenticated
  with check (lead_id is not null
              and storage_path like 'lead/' || lead_id || '/%'
              and exists (select 1 from public.leads l where l.id = lead_id));

-- Who hears of a new file: when the client's people add one, the lead's manager
-- and whoever set its appointment; when staff add one to a lead with an
-- appointment the client can see, the client's people, pointed at the appointment.
create or replace function public.tg_documents_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l       public.leads;
  a       public.appointments;
  v_role  text;
  v_to    bigint[];
begin
  if new.lead_id is null then
    return null;
  end if;
  select * into l from public.leads where id = new.lead_id;
  select * into a from public.appointments
   where lead_id = new.lead_id and invalid_at is null and deleted_at is null
   order by appt_create_date desc, id desc limit 1;
  select role into v_role from public.users where id = new.uploaded_by;

  if v_role = 'client' then
    v_to := array_remove(array[l.assigned_user_id, a.user_id], null);
    perform public.notify_users(v_to, 'lead',
      left('Policy file added: ' || coalesce(l.company_name, 'a lead'), 160),
      left(new.name || ' · from ' || coalesce(public.actor_name(), 'the client'), 1000),
      '/leads/' || l.id || '?tab=files', null);
  elsif a.id is not null and coalesce(a.qa_status, 'passed') = 'passed' then
    select array_agg(u.id) into v_to from public.users u join public.projects p on p.company_id = u.company_id
     where p.id = l.project_id and u.role = 'client' and u.status = 'active' and u.deleted_at is null;
    perform public.notify_users(coalesce(v_to, '{}'), 'appointment',
      left('Policy file added: ' || coalesce(l.company_name, 'an appointment'), 160),
      left(new.name || ' · for the appointment on ' || to_char(a.appt_date, 'Dy MM/DD/YYYY') || coalesce(' ' || a.appt_time, ''), 1000),
      '/calendar?view=day&d=' || a.appt_date || '&a=' || a.id, null);
  end if;
  return null;
end $$;
revoke execute on function public.tg_documents_notify() from public, anon, authenticated;
drop trigger if exists documents_notify on public.documents;
create trigger documents_notify after insert on public.documents
  for each row execute function public.tg_documents_notify();
