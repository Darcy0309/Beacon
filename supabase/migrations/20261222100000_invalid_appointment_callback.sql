-- An invalid appointment, and a call back next year (Oct 2026, the client's
-- scenario): a manager's appointment turns out invalid when confirmed (the
-- prospect has no time this year, call next year). It is marked
-- Appointment-Invalid: the appointment is invalid, the manager's pay charged
-- back, the client not billed. The name should come up again next year
-- without undoing this year's figures.
--
--   1. The reports count an invalid appointment from the appointment itself
--      (appointments.invalid_at), not from the lead's latest call result, so
--      the lead's result can move on: lead_classes.appt_invalid, used by
--      lead_stats(), clients_totals() and client_dashboard(). (The client's
--      appointment list, activity, production and pay read the appointment
--      or the pay already.)
--   2. leads.call_back_on: a name kept off the call lists until that day
--      (call_list(), call_list_options(), work_projects()); given another
--      result in the meantime, it is called as usual again.
--   3. call_back_later(lead, day, note): an invalid appointment's name back
--      on its project's list on that day, as Lead-Not Shopping, a call
--      recorded with why (no pay), and a reminder to its account manager.
--
-- Safe to run more than once.

alter table public.leads add column if not exists call_back_on date;
create index if not exists leads_call_back_on on public.leads (call_back_on) where call_back_on is not null;
create index if not exists appointments_invalid_lead on public.appointments (lead_id) where invalid_at is not null;

-- ---------------------------------------------------------------------------
-- 1. An invalid appointment counted from the appointment
-- ---------------------------------------------------------------------------

create or replace view public.lead_classes with (security_invoker = true) as
  select l.id, l.project_id, l.source_project_id, l.stage,
         r.name as result, r.project_type as result_type, r.viable, r.callable, r.effect, r.sort_order,
         d.name as dbdv_result,
         -- DB dev developed it: it came on from a DB dev project, or its DB dev result says so.
         ((l.stage = 'appt' and l.source_project_id is not null and l.source_project_id <> l.project_id)
           or coalesce(d.effect in ('promote', 'appointment', 'confirm', 'appointment_invalid') or d.name = 'Lead-Invalid', false)) as developed,
         -- It had an appointment that was invalid: its result says so, or (its result moved on since) the appointment does.
         (r.effect = 'appointment_invalid'
           or exists (select 1 from public.appointments ap where ap.lead_id = l.id and ap.invalid_at is not null and ap.deleted_at is null)) as appt_invalid
    from public.leads l
    join public.call_results r on r.id = l.result_id
    left join lateral (
      select cr.name, cr.effect
        from public.call_results cr
       where cr.project_type = 'DBDV' and nullif(btrim(l.call_result_dbdv), '') is not null
         and (lower(cr.name) = lower(btrim(l.call_result_dbdv)) or lower(btrim(l.call_result_dbdv)) = any (cr.aliases))
       order by cr.sort_order
       limit 1
    ) d on true;
revoke all on public.lead_classes from anon;
grant select on public.lead_classes to authenticated;

create or replace function public.lead_stats(p_company_id bigint default null, p_project_id bigint default null)
returns table(project_id bigint, names bigint, names_left bigint, leads_active bigint, leads_resolved bigint, developed bigint, appointments bigint, invalid_appointments bigint)
language sql stable set search_path = public as $$
  with ps as (
    select p.id from public.projects p
     where (p_project_id is not null and p.id = p_project_id)
        or (p_project_id is null and p_company_id is not null and p.company_id = p_company_id)
  ), scoped as (
    -- A project's names: those on it, and those it sent on to another.
    select ps.id as pid, c.*, (c.project_id = ps.id) as here
      from ps join public.lead_classes c
        on c.project_id = ps.id or (c.source_project_id = ps.id and c.source_project_id <> c.project_id)
  ), per as (
    select pid,
           count(*) as names,
           count(*) filter (where here and stage = 'dbdev' and viable) as names_left,
           count(*) filter (where stage = 'appt' and viable) as leads_active,
           count(*) filter (where stage = 'appt' and not viable) as leads_resolved,
           count(*) filter (where developed) as developed,
           count(*) filter (where effect in ('appointment', 'confirm')) as appointments,
           count(*) filter (where appt_invalid) as invalid_appointments
      from scoped group by pid
  )
  select ps.id, coalesce(per.names, 0), coalesce(per.names_left, 0), coalesce(per.leads_active, 0), coalesce(per.leads_resolved, 0),
         coalesce(per.developed, 0), coalesce(per.appointments, 0), coalesce(per.invalid_appointments, 0)
    from ps left join per on per.pid = ps.id
  union all
  select null, count(*),
         count(*) filter (where c.stage = 'dbdev' and c.viable),
         count(*) filter (where c.stage = 'appt' and c.viable),
         count(*) filter (where c.stage = 'appt' and not c.viable),
         count(*) filter (where c.developed),
         count(*) filter (where c.effect in ('appointment', 'confirm')),
         count(*) filter (where c.appt_invalid)
    from public.lead_classes c
   where p_project_id is null and p_company_id is not null and c.project_id in (select id from ps)
     and c.result not in ('Moved', 'Lead-Moved')
  -- The client's total only when a client was asked for (an aggregate otherwise still answers, with zeros).
  having p_project_id is null and p_company_id is not null;
$$;

create or replace function public.clients_totals(p_companies bigint[] default null)
returns table(leads_active bigint, leads_resolved bigint, appointments bigint, invalid_appointments bigint)
language sql stable set search_path = public as $$
  select count(*) filter (where c.stage = 'appt' and c.viable),
         count(*) filter (where c.stage = 'appt' and not c.viable),
         count(*) filter (where c.effect in ('appointment', 'confirm')),
         count(*) filter (where c.appt_invalid)
    from public.lead_classes c
    join public.projects p on p.id = c.project_id
    join public.companies co on co.id = p.company_id
   where co.status = 'active'
     and (p_companies is null or co.id = any(p_companies));
$$;
revoke execute on function public.clients_totals(bigint[]) from public, anon;
grant execute on function public.clients_totals(bigint[]) to authenticated;

create or replace function public.client_dashboard(p_from date default null, p_company_id bigint default null)
returns jsonb
language sql stable set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), p as (
    select pr.id, pr.name, t.code as type from public.projects pr
      left join public.project_types t on t.id = pr.project_type_id
     where pr.deleted_at is null and (p_company_id is null or pr.company_id = p_company_id)
  ), l as (
    -- A lead: a name at the appointment stage, dated by when it became one; and whether it had an appointment found invalid.
    select le.id, le.project_id, le.source_project_id, r.effect, le.appt_created_date, le.promoted_at, le.lead_date, le.created_at,
           exists (select 1 from public.appointments ap where ap.lead_id = le.id and ap.invalid_at is not null and ap.deleted_at is null) as had_invalid
      from public.leads le join public.call_results r on r.id = le.result_id
     where le.stage = 'appt'
       and (le.project_id in (select id from p) or le.source_project_id in (select id from p))
  ), lp as (
    select l.* from l, z
     where p_from is null or coalesce(l.promoted_at, l.lead_date, l.created_at) >= (p_from::timestamp at time zone z.tz)
  ), a as (
    -- An appointment: a name whose result is one (set, confirmed or invalid), or whose appointment was found invalid
    -- (its result moved on since: called back next year), once each, dated by when it was set.
    select l.id, l.effect, l.had_invalid,
           (select public.appointment_update_status(ap.client_result, ap.appt_date, ap.appt_time) from public.appointments ap
             where ap.lead_id = l.id and ap.deleted_at is null order by ap.created_at desc, ap.id desc limit 1) as shown
      from l, z
     where l.project_id in (select id from p)
       and (l.effect in ('appointment', 'confirm', 'appointment_invalid') or l.had_invalid)
       and (p_from is null or coalesce(l.appt_created_date, l.promoted_at, l.lead_date, l.created_at) >= (p_from::timestamp at time zone z.tz))
  ), ar as (
    select case when effect = 'appointment_invalid' or (had_invalid and effect not in ('appointment', 'confirm')) then 'invalid'
                else coalesce(shown, 'pending_appointment') end as result from a
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

-- ---------------------------------------------------------------------------
-- 2. Kept off the call lists until the day to call back
-- ---------------------------------------------------------------------------

/** The business's today: what "until the day" is measured by. */
create or replace function public.business_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone public.business_tz())::date
$$;
grant execute on function public.business_today() to authenticated;

-- The call lists and their counts leave out a name until its call-back day. Each of these functions picks the names
-- to call as "r.viable and r.callable"; that is widened here, once, wherever it appears in them.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array['call_list', 'call_list_options', 'work_projects'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = f and p.pronamespace = 'public'::regnamespace;
    if def is null or def like '%call_back_on%' then
      continue;
    end if;
    execute replace(def, 'r.viable and r.callable', 'r.viable and r.callable and (l.call_back_on is null or l.call_back_on <= public.business_today())');
  end loop;
end $$;

-- Given another result in the meantime (a call, Result Change), the name is called as usual again.
create or replace function public.tg_leads_call_back() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.result_id is distinct from old.result_id and new.call_back_on is not distinct from old.call_back_on then
    new.call_back_on := null;
  end if;
  return new;
end $$;
drop trigger if exists leads_call_back on public.leads;
create trigger leads_call_back before update of result_id on public.leads
  for each row execute function public.tg_leads_call_back();

-- ---------------------------------------------------------------------------
-- 3. Call back next year
-- ---------------------------------------------------------------------------

/**
 * An invalid appointment's name back on its project's call list on `p_on`
 * (next year, say): as Lead-Not Shopping, a call recorded with why (no pay:
 * the appointment stays invalid, its pay charged back, in this year's
 * figures), a line in its notes, and a reminder to its account manager that
 * morning. Those who can work the name, administrators and managers.
 */
create or replace function public.call_back_later(p_lead bigint, p_on date, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  l       public.leads;
  r       public.call_results;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := public.business_today();
  v_line  text;
begin
  if v_me is null or not (public.is_manager() or public.can_work_lead(p_lead)) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead and deleted_at is null for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  if l.stage is distinct from 'appt'
     or not exists (select 1 from public.appointments ap where ap.lead_id = l.id and ap.invalid_at is not null and ap.deleted_at is null) then
    raise exception 'Only a lead whose appointment was found invalid is called back this way' using errcode = '22023';
  end if;
  if exists (select 1 from public.appointments ap where ap.lead_id = l.id and ap.invalid_at is null and ap.deleted_at is null and ap.appt_date >= v_today) then
    raise exception 'This lead has an appointment still to come' using errcode = '22023';
  end if;
  if p_on is null or p_on <= v_today then
    raise exception 'Choose a day after today to call back' using errcode = '22023';
  end if;
  if p_on > v_today + 731 then
    raise exception 'Choose a day within two years' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;
  select * into r from public.call_results where id = public.call_result_from_text('APPT', 'Lead-Not Shopping');
  if not found then
    raise exception 'No call result to give it' using errcode = 'P0002';
  end if;

  v_line := 'Call back on ' || to_char(p_on, 'FMMon FMDD, YYYY') || coalesce(': ' || v_note, '') || ' (the appointment stays invalid).';
  insert into public.call_records (lead_id, project_id, user_id, call_result, notes, result_id, stage, call_date)
  values (l.id, l.project_id, v_me, r.name, v_line, r.id, l.stage, now());
  update public.leads set
    result_id        = r.id,
    call_result_appt = r.name,
    status_id        = coalesce((select s.id from public.lead_statuses s where s.code = r.status_code), status_id),
    resolved_at      = null,
    call_back_on     = p_on,
    date_last_worked = now()
  where id = l.id;
  perform public.add_name_note(l.id, public.note_stamp() || ' ' || v_line);
  -- Its account manager reminded that morning (whoever has the name then, else who asked).
  insert into public.reminders (lead_id, user_id, remind_at, note)
  values (l.id, coalesce(l.assigned_user_id, v_me), (p_on + time '09:00') at time zone public.business_tz(),
          left('Call back: ' || coalesce(v_note, 'their appointment was invalid last time'), 300));
  return jsonb_build_object('call_back_on', p_on, 'result', r.name);
end $$;
revoke execute on function public.call_back_later(bigint, date, text) from public, anon;
grant execute on function public.call_back_later(bigint, date, text) to authenticated;
