-- Renewing a lead project (Oct 2026). A client's 6-12 month program ends
-- with names still worth calling: the renewal is a new lead project
-- (ProjectB) on the same appointment project (the "parent project" of all
-- the client's lead projects), carrying over all or some of the viable names
-- and closing the old one, without loading anything again.
--
--   call results Moved / Lead-Moved  a name carried to another of the same
--                              client's projects: still being called there,
--                              so not a removal, and counted once in the
--                              client's totals (on the project it went to)
--   projects.renewed_from_id   the project a renewal carries on from
--   renew_project(...)         ProjectB from ProjectA: its settings, rates,
--                              appointment project and office; the managers
--                              chosen; a new goal and dates; the viable names
--                              chosen (each keeps its call result, notes,
--                              coverage and X-dates), the originals marked
--                              Moved; ProjectA Completed if asked
--   move_names()               names moved within a client are Moved too
--
-- A client takes a lead in their pipeline off too: an X-date corrected is still a lead
-- (mark_names), and comes off as Lead-Removed, still in the reports.
--
-- And managers told (the client asked whether they are): a project put in
-- their hands, a project of theirs paused, completed or active again, and
-- names shared out to them now say which project.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Moved
-- ---------------------------------------------------------------------------

insert into public.call_results (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases, delivers)
select v.project_type, v.name, v.sort_order, false, true, false, 'none', null, 'name', 'removed', v.action, v.aliases, false
  from (values
    ('DBDV', 'Moved', 131, 'Carried over to another of the client''s projects (a renewal, or names moved): called there, and counted there in the client''s totals', array['moved']),
    ('APPT', 'Lead-Moved', 101, 'Carried over to another of the client''s appointment projects: called there', array['lead-moved', 'moved'])
  ) as v(project_type, name, sort_order, action, aliases)
 where not exists (select 1 from public.call_results r where r.project_type = v.project_type and r.name = v.name);

-- An import says how many of its names were already on the project or its family.
alter table public.import_batches add column if not exists existing_count int not null default 0;

alter table public.projects add column if not exists renewed_from_id bigint references public.projects(id) on delete set null;
create index if not exists projects_renewed_from on public.projects (renewed_from_id) where renewed_from_id is not null;

/** The Moved result of a kind of project. */
create or replace function public.moved_result(p_type text)
returns bigint
language sql stable set search_path = public as $$
  select id from public.call_results
   where project_type = p_type and name = case p_type when 'APPT' then 'Lead-Moved' else 'Moved' end
   limit 1
$$;

-- A client's totals: a name carried over is counted on the project it went to, not twice.
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
           count(*) filter (where effect = 'appointment_invalid') as invalid_appointments
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
         count(*) filter (where c.effect = 'appointment_invalid')
    from public.lead_classes c
   where p_project_id is null and p_company_id is not null and c.project_id in (select id from ps)
     and c.result not in ('Moved', 'Lead-Moved')
  -- The client's total only when a client was asked for (an aggregate otherwise still answers, with zeros).
  having p_project_id is null and p_company_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- 2. Moving names: within a client, Moved
-- ---------------------------------------------------------------------------

create or replace function public.move_names(p_ids bigint[], p_project bigint, p_result bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_type    text := public.project_type_code(p_project);
  v_target  public.projects;
  v_result  public.call_results;
  v_removed bigint;
  v_moved_r bigint;
  v_stamp   text := public.note_stamp();
  v_label   text := public.project_label(p_project);
  l         public.leads;
  v_moved   int := 0;
  v_skipped int := 0;
  v_have    text[];
  v_new     bigint;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can move names' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Choose the names to move' using errcode = '22023';
  end if;
  if array_length(p_ids, 1) > 5000 then
    raise exception 'Move up to 5,000 names at a time' using errcode = '22023';
  end if;
  select * into v_target from public.projects where id = p_project and deleted_at is null;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  if v_target.status_id is distinct from (select id from public.project_statuses where name = 'Active') then
    raise exception 'That project is not active' using errcode = '22023';
  end if;
  select * into v_result from public.call_results where id = p_result;
  if not found or v_result.project_type is distinct from v_type or v_result.applies_to is distinct from 'name' then
    raise exception 'Choose a call result of that project''s kind' using errcode = '22023';
  end if;
  v_removed := public.call_result_from_text(v_type, case v_type when 'APPT' then 'Lead-Removed' else 'Removed' end);
  v_moved_r := public.moved_result(v_type);

  -- The phones already on that project: a name there already isn't put there twice.
  select coalesce(array_agg(distinct public.phone_key(phone)) filter (where public.phone_key(phone) is not null), '{}') into v_have
    from public.leads where project_id = p_project and deleted_at is null;

  for l in select * from public.leads where id = any(p_ids) and deleted_at is null order by id for update loop
    if l.project_id = p_project then
      continue;
    end if;
    if public.project_type_code(l.project_id) is distinct from v_type then
      raise exception '% is on a different kind of project: move viable names to a DB dev project, leads to an appointment project', l.company_name
        using errcode = '22023';
    end if;
    if public.phone_key(l.phone) is not null and public.phone_key(l.phone) = any(v_have) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_new := public.copy_name(l.id, p_project, p_result, null, v_stamp || ' Moved here from ' || public.project_label(l.project_id) || '.');
    -- A name moved to another lead project is that project's: the leads it makes count there, not where it came from.
    if v_type = 'DBDV' then
      update public.leads set source_project_id = p_project where id = v_new;
    end if;
    -- Still the client's (another of their projects): Moved, not a removal.
    update public.leads
       set result_id = case when (select company_id from public.projects where id = l.project_id) is not distinct from v_target.company_id
                            then coalesce(v_moved_r, v_removed) else v_removed end,
           resolved_at = now()
     where id = l.id;
    perform public.add_name_note(l.id, v_stamp || ' Moved to ' || v_label || '.');
    if public.phone_key(l.phone) is not null then
      v_have := v_have || public.phone_key(l.phone);
    end if;
    v_moved := v_moved + 1;
  end loop;

  -- Shared out evenly among that project's reps, as an import is.
  if v_moved > 0 then
    perform public.distribute_names(p_project);
  end if;
  return jsonb_build_object('moved', v_moved, 'skipped', v_skipped, 'project_id', p_project);
end $$;
revoke execute on function public.move_names(bigint[], bigint, bigint) from public, anon;
grant execute on function public.move_names(bigint[], bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Renewing a lead project
-- ---------------------------------------------------------------------------

/**
 * ProjectB from ProjectA (administrators). p_names: 'all' carries every
 * viable name still on ProjectA (Viable-No Contact, -Staged, -Left Message,
 * -Email, Pending), 'picked' only p_ids among them, 'none' starts with no
 * names (a new list to import). Each name keeps its call result; the
 * original is marked Moved, with a note. p_managers are put on ProjectB
 * and the names shared out among them. ProjectA is marked Completed when
 * p_complete. Returns { project_id, moved, skipped }.
 */
create or replace function public.renew_project(
  p_project    bigint,
  p_name       text,
  p_lead_goal  int default null,
  p_lead_goal_month int default null,
  p_start      date default null,
  p_end        date default null,
  p_managers   bigint[] default '{}',
  p_names      text default 'all',
  p_ids        bigint[] default '{}',
  p_complete   boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a         public.projects;
  v_id      bigint;
  v_active  bigint := (select id from public.project_statuses where name = 'Active');
  v_done    bigint := (select id from public.project_statuses where name = 'Completed');
  v_moved_r bigint := public.moved_result('DBDV');
  v_stamp   text := public.note_stamp();
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_label   text;
  v_from    text;
  l         public.leads;
  v_new     bigint;
  v_moved   int := 0;
  v_skipped int := 0;
  v_user    public.users;
begin
  if not public.is_admin() then
    raise exception 'Only administrators renew projects' using errcode = '42501';
  end if;
  select * into a from public.projects where id = p_project and deleted_at is null for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  if public.project_type_code(a.id) is distinct from 'DBDV' then
    raise exception 'Only a lead (DB dev) project is renewed; its appointment project carries on as it is' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Name the new project' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'A project name is 120 characters at most' using errcode = '22023';
  end if;
  if p_names not in ('all', 'picked', 'none') then
    raise exception 'Choose which names to carry over' using errcode = '22023';
  end if;
  if p_names = 'picked' and coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Pick the names to carry over' using errcode = '22023';
  end if;
  if p_lead_goal is not null and p_lead_goal < 0 or p_lead_goal_month is not null and p_lead_goal_month < 0 then
    raise exception 'A goal is a number of leads' using errcode = '22023';
  end if;
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'The end date is before the start date' using errcode = '22023';
  end if;

  -- Everything ProjectA was set up with, but its name, dates, goals and status.
  insert into public.projects (
    company_id, name, project_type_id, status_id, description, client_name, contact_name, contact_title, email,
    address, city, state, zip, phone, fax, website, timezone_id, start_date, end_date, appt_project_id,
    lead_rate, appointment_rate, confirmation_rate, delivery_link_only, special_goal, special_rate,
    lead_goal, lead_goal_month, renewed_from_id)
  values (
    a.company_id, v_name, a.project_type_id, v_active, a.description, a.client_name, a.contact_name, a.contact_title, a.email,
    a.address, a.city, a.state, a.zip, a.phone, a.fax, a.website, a.timezone_id, coalesce(p_start, current_date), p_end, a.appt_project_id,
    a.lead_rate, a.appointment_rate, a.confirmation_rate, a.delivery_link_only, a.special_goal, a.special_rate,
    p_lead_goal, p_lead_goal_month, a.id)
  returning id into v_id;

  -- Its client's people on it, as on ProjectA.
  insert into public.project_assignments (project_id, cl_user_id)
  select distinct v_id, cl_user_id from public.project_assignments where project_id = a.id and cl_user_id is not null;

  v_label := public.project_label(v_id);
  v_from := public.project_label(a.id);
  -- The viable names still to call on ProjectA: each keeps its call result there.
  for l in
    select x.* from public.leads x join public.call_results r on r.id = x.result_id
     where x.project_id = a.id and x.deleted_at is null and x.stage = 'dbdev' and r.viable
       and (p_names = 'all' or (p_names = 'picked' and x.id = any(p_ids)))
     order by x.id
       for update of x
  loop
    v_new := public.copy_name(l.id, v_id, l.result_id, null, v_stamp || ' Carried over from ' || v_from || ' (renewal).');
    -- ProjectB's own from here: the leads it makes count for ProjectB, not ProjectA.
    update public.leads set source_project_id = v_id where id = v_new;
    update public.leads set result_id = v_moved_r, resolved_at = now() where id = l.id;
    perform public.add_name_note(l.id, v_stamp || ' Moved to ' || v_label || ' (renewal).');
    v_moved := v_moved + 1;
  end loop;
  if p_names = 'picked' then
    v_skipped := (select count(distinct x) from unnest(p_ids) x) - v_moved;
  end if;

  -- The managers chosen, once the names are there: each is told the project and how many names it has.
  for v_user in select * from public.users where id = any(coalesce(p_managers, '{}')) loop
    if v_user.role not in ('admin', 'manager', 'agent') or v_user.status is distinct from 'active' then
      raise exception '% can''t work a project', coalesce(nullif(concat_ws(' ', v_user.first_name, v_user.last_name), ''), v_user.email)
        using errcode = '22023';
    end if;
    insert into public.project_assignments (project_id, ae_user_id) values (v_id, v_user.id);
  end loop;

  if v_moved > 0 then
    perform public.distribute_names(v_id);
  end if;
  if p_complete then
    update public.projects set status_id = v_done where id = a.id;
  end if;
  return jsonb_build_object('project_id', v_id, 'moved', v_moved, 'skipped', v_skipped, 'completed', p_complete);
end $$;
revoke execute on function public.renew_project(bigint, text, int, int, date, date, bigint[], text, bigint[], boolean) from public, anon;
grant execute on function public.renew_project(bigint, text, int, int, date, date, bigint[], text, bigint[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Managers told
-- ---------------------------------------------------------------------------

insert into public.alert_rules (name, trigger, channel, recipients, enabled)
select v.name, v.trigger, 'inapp', null, true
  from (values ('Project assigned to you', 'project_assigned'), ('Project paused or completed', 'project_status')) v(name, trigger)
 where not exists (select 1 from public.alert_rules r where r.trigger = v.trigger);

/** How many names on a project are still to call. */
create or replace function public.names_to_call(p_project bigint)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.leads x join public.call_results r on r.id = x.result_id
   where x.project_id = p_project and x.deleted_at is null and r.viable
$$;
revoke execute on function public.names_to_call(bigint) from public, anon, authenticated;

/** A manager put on a project: which one, and how many names it has to call. */
create or replace function public.tg_project_assignment_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ae_user_id is null or (tg_op = 'UPDATE' and new.ae_user_id is not distinct from old.ae_user_id) then
    return null;
  end if;
  perform public.notify_users(
    array[new.ae_user_id], 'system',
    'Project assigned to you: ' || coalesce(public.project_label(new.project_id), 'a project'),
    format('%s names to call%s', to_char(public.names_to_call(new.project_id), 'FM999,999,990'),
           coalesce(' · Assigned by ' || public.actor_name(), '')),
    '/projects/' || new.project_id,
    'project_assigned');
  return null;
end $$;
revoke execute on function public.tg_project_assignment_notify() from public, anon, authenticated;
drop trigger if exists project_assignment_notify on public.project_assignments;
create trigger project_assignment_notify after insert or update of ae_user_id on public.project_assignments
  for each row execute function public.tg_project_assignment_notify();

/** A project paused, completed or active again: its managers are told. */
create or replace function public.tg_project_status_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text := (select name from public.project_statuses where id = new.status_id);
  v_was    text := (select name from public.project_statuses where id = old.status_id);
begin
  if new.status_id is not distinct from old.status_id or new.deleted_at is not null
     or v_status not in ('Paused', 'Completed', 'Active') or (v_status = 'Active' and v_was = 'Draft') then
    return null;
  end if;
  perform public.notify_users(
    array(select distinct ae_user_id from public.project_assignments where project_id = new.id and ae_user_id is not null),
    'system',
    format('Project %s: %s', case v_status when 'Active' then 'active again' else lower(v_status) end, public.project_label(new.id)),
    concat_ws(' · ',
      case v_status when 'Paused' then 'Its names are off your call lists until it is active again'
                    when 'Completed' then 'Its names are off your call lists'
                    else format('%s names to call', to_char(public.names_to_call(new.id), 'FM999,999,990')) end,
      'By ' || public.actor_name()),
    '/projects/' || new.id,
    'project_status');
  return null;
end $$;
revoke execute on function public.tg_project_status_notify() from public, anon, authenticated;
drop trigger if exists project_status_notify on public.projects;
create trigger project_status_notify after update of status_id on public.projects
  for each row execute function public.tg_project_status_notify();

-- Names shared out to a manager say which project.
create or replace function public.notify_lead_assignment(p_user bigint, p_hot boolean, p_n bigint, p_lead bigint, p_name text, p_project bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_users(
    array[p_user], 'lead',
    case when p_n = 1 then (case when p_hot then 'Hot lead assigned to you: ' else 'Lead assigned to you: ' end) || coalesce(p_name, 'a lead')
         else p_n || case when p_hot then ' hot leads' else ' leads' end || ' assigned to you' end,
    concat_ws(' · ', 'On ' || public.project_label(p_project), coalesce('Assigned by ' || public.actor_name(), 'Assigned automatically')),
    case when p_n = 1 then '/leads/' || p_lead || coalesce('?project=' || p_project, '')
         when p_project is not null then '/work/' || p_project
         else '/work' end,
    case when p_hot then 'hot_lead' else 'lead_assigned' end);
end $$;

-- ---------------------------------------------------------------------------
-- 5. A lead with its X-date corrected comes off a client's list too
-- ---------------------------------------------------------------------------

/**
 * Names taken off a client's lists, with why: a client's people for their
 * own projects' names (they can't record calls), staff for any. Each takes
 * the result for the reason on its kind of project; a note on each says who
 * and why, and the note given is kept on the list. A lead in the pipeline
 * (on the appointment project, an X-date corrected or not) comes off as
 * Lead-Removed, still in the reports (Sean's client, Oct 2026: scrubbing the
 * leads they no longer want called for appointments). Names with an
 * appointment, or made a lead on a DB dev project with no appointment
 * project, are left as they are and counted: those go through the people
 * who set them.
 */
create or replace function public.mark_names(p_ids bigint[], p_reason text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := public.app_role();
  v_company bigint := public.app_company_id();
  v_me      bigint := public.app_user_id();
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_label   text := case p_reason when 'deletion' then 'Deletion' when 'dont_call' then 'Don''t call' else 'Current customer' end;
  v_stamp   text := public.note_stamp();
  v_by      text;
  r         public.call_results;
  l         record;
  v_marked  int := 0;
  v_kept    int := 0;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'client') then
    raise exception 'Only a client''s people, administrators and account managers can take names off' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('deletion', 'dont_call', 'current_customer') then
    raise exception 'Choose why these names come off' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Choose the names to take off' using errcode = '22023';
  end if;
  if array_length(p_ids, 1) > 5000 then
    raise exception 'Take off up to 5,000 names at a time' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), email) into v_by from public.users where id = v_me;

  for l in
    select x.id, x.project_id, x.result_id, p.company_id, public.project_type_code(x.project_id) as kind, cr.effect
      from public.leads x
      join public.projects p on p.id = x.project_id
      join public.call_results cr on cr.id = x.result_id
     where x.id = any(p_ids) and x.deleted_at is null
     order by x.id
       for update of x
  loop
    if v_role = 'client' and l.company_id is distinct from v_company then
      raise exception 'Those names are not on your lists' using errcode = '42501';
    end if;
    if l.effect not in ('none', 'pending', 'correct_xdate') then
      v_kept := v_kept + 1;
      continue;
    end if;
    select * into r from public.call_results
     where project_type = l.kind and applies_to = 'name' and client_removal = p_reason
     order by sort_order limit 1;
    if not found then
      raise exception 'No call result to mark these names with' using errcode = 'P0002';
    end if;
    if l.result_id is distinct from r.id then
      update public.leads
         set result_id = r.id,
             status_id = coalesce((select s.id from public.lead_statuses s where s.code = r.status_code), status_id),
             resolved_at = coalesce(resolved_at, now())
       where id = l.id;
    end if;
    perform public.add_name_note(l.id, v_stamp || ' Taken off the list by ' || coalesce(v_by, 'the client') || ': ' || v_label
                                      || coalesce(' (' || v_note || ')', '') || '.');
    update public.client_removals
       set reason = p_reason, note = coalesce(v_note, note), removed_by = v_me
     where lead_id = l.id;
    v_marked := v_marked + 1;
  end loop;
  return jsonb_build_object('marked', v_marked, 'kept', v_kept, 'reason', v_label);
end $$;
revoke execute on function public.mark_names(bigint[], text, text) from public, anon;
grant execute on function public.mark_names(bigint[], text, text) to authenticated;
