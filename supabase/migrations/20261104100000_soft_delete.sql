-- Deleting sets a flag: nothing a person deletes in Lighthouse is removed
-- from the database.
--
-- A client, a project, a lead, an appointment, an insurance company, a
-- document, a bulletin post or a user that is deleted keeps its row, marked
-- with when and by whom (deleted_at, deleted_by). From then on it is hidden
-- from everyone signed in, by Row Level Security: every list, search, call
-- list, calendar, count and report reads through it, so none of them needs
-- to know. An administrator sees what was deleted under Settings and can
-- bring it back.
--
-- What goes with what, and comes back with it (deleted_via names the record
-- that took it): a client's projects; a project's leads; a lead's
-- appointments. Calls made, pay earned and notes are left as they are.
--
-- The delete itself is unchanged for the app's roles: the same people may
-- delete the same things (the tables' own policies decide). A trigger turns
-- their DELETE into the flag. The database's own roles (migrations, the SQL
-- editor, the reset script, the server's service role) still remove rows.
--
-- Safe to run again.

-- --- 1. The flag ----------------------------------------------------------
-- deleted_by has no foreign key on purpose: a second link between a table
-- and users would make the API's joins between the two ambiguous.
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'projects', 'leads', 'appointments', 'agencies', 'documents', 'bulletin_board', 'users'] loop
    execute format('alter table public.%I add column if not exists deleted_at timestamptz, add column if not exists deleted_by bigint, add column if not exists deleted_via text', t);
    execute format('create index if not exists %I on public.%I (deleted_at) where deleted_at is not null', t || '_deleted_idx', t);
    execute format('create index if not exists %I on public.%I (deleted_via) where deleted_via is not null', t || '_deleted_via_idx', t);
  end loop;
end $$;

-- --- 2. Deleting sets it --------------------------------------------------
create or replace function public.tg_soft_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_now   timestamptz := now();
  v_via   text := tg_table_name || ':' || old.id;
  v_other text;
begin
  if old.deleted_at is not null then
    return null;
  end if;

  if tg_table_name = 'projects' then
    -- Leads promoted from a DB dev project would land on a project nobody can see.
    select p.name into v_other from public.projects p
     where p.appt_project_id = old.id and p.id <> old.id and p.deleted_at is null limit 1;
    if v_other is not null then
      raise exception '% promotes its leads to this project. Delete that project first, or have it promote to another.', v_other
        using errcode = '23503';
    end if;
    update public.appointments a set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where a.deleted_at is null
       and a.lead_id in (select l.id from public.leads l where l.project_id = old.id and l.deleted_at is null);
    update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where project_id = old.id and deleted_at is null;
    update public.projects set deleted_at = v_now, deleted_by = v_me, deleted_via = null where id = old.id;

  elsif tg_table_name = 'companies' then
    update public.appointments a set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where a.deleted_at is null
       and a.lead_id in (select l.id from public.leads l join public.projects p on p.id = l.project_id
                          where p.company_id = old.id and p.deleted_at is null and l.deleted_at is null);
    update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where deleted_at is null
       and project_id in (select p.id from public.projects p where p.company_id = old.id and p.deleted_at is null);
    update public.projects set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where company_id = old.id and deleted_at is null;
    update public.companies set deleted_at = v_now, deleted_by = v_me, deleted_via = null where id = old.id;

  elsif tg_table_name = 'leads' then
    update public.appointments set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where lead_id = old.id and deleted_at is null;
    update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = null where id = old.id;

  elsif tg_table_name = 'users' then
    -- The account no longer counts as active anywhere; its sign-in is removed by the app.
    update public.users set deleted_at = v_now, deleted_by = v_me, deleted_via = null, status = 'disabled' where id = old.id;

  else
    execute format('update public.%I set deleted_at = $1, deleted_by = $2, deleted_via = null where id = $3', tg_table_name)
      using v_now, v_me, old.id;
  end if;

  -- The row stays.
  return null;
end $$;
revoke execute on function public.tg_soft_delete() from public, anon, authenticated;

-- --- 3. Deleted is hidden; a delete becomes the flag ------------------------
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'projects', 'leads', 'appointments', 'agencies', 'documents', 'bulletin_board', 'users'] loop
    execute format('drop policy if exists not_deleted on public.%I', t);
    execute format('create policy not_deleted on public.%I as restrictive for select to authenticated using (deleted_at is null)', t);
    execute format('drop trigger if exists soft_delete on public.%I', t);
    execute format('create trigger soft_delete before delete on public.%I for each row when (current_user = ''authenticated'') execute function public.tg_soft_delete()', t);
  end loop;
end $$;

-- --- 4. Deleting from the app ---------------------------------------------
-- A delete that only sets a flag returns no rows, as one Row Level Security
-- refused does. This says which: true when the record was there to see and
-- no longer is. Runs as the caller, so their own rights decide.
create or replace function public.remove_record(p_table text, p_id bigint)
returns boolean
language plpgsql set search_path = public as $$
declare
  v_seen boolean;
begin
  if p_table not in ('companies', 'projects', 'leads', 'appointments', 'agencies', 'documents', 'bulletin_board', 'users') then
    raise exception 'Not a kind of record that can be deleted this way' using errcode = '22023';
  end if;
  execute format('select exists (select 1 from public.%I where id = $1)', p_table) into v_seen using p_id;
  if not v_seen then
    return false;
  end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
  execute format('select exists (select 1 from public.%I where id = $1)', p_table) into v_seen using p_id;
  return not v_seen;
end $$;
revoke execute on function public.remove_record(text, bigint) from public, anon;
grant execute on function public.remove_record(text, bigint) to authenticated;

-- --- 5. What was deleted, and bringing it back (administrators) -----------
-- The records deleted in their own right, newest first: not what went with
-- them (`also` counts those). Nothing for anyone but an administrator.
create or replace function public.deleted_records()
returns table (kind text, id bigint, name text, detail text, deleted_at timestamptz, deleted_by text, also bigint)
language sql stable security definer set search_path = public as $$
  with d as (
    select 'companies' as kind, c.id, c.name, null::text as detail, c.deleted_at, c.deleted_by from public.companies c
     where c.deleted_at is not null and c.deleted_via is null
    union all
    select 'projects', p.id, p.name, (select c.name from public.companies c where c.id = p.company_id), p.deleted_at, p.deleted_by from public.projects p
     where p.deleted_at is not null and p.deleted_via is null
    union all
    select 'leads', l.id, l.company_name, (select p.name from public.projects p where p.id = l.project_id), l.deleted_at, l.deleted_by from public.leads l
     where l.deleted_at is not null and l.deleted_via is null
    union all
    select 'appointments', a.id, coalesce((select l.company_name from public.leads l where l.id = a.lead_id), 'Appointment'),
           concat_ws(' at ', to_char(a.appt_date, 'Mon FMDD, YYYY'), a.appt_time), a.deleted_at, a.deleted_by from public.appointments a
     where a.deleted_at is not null and a.deleted_via is null
    union all
    select 'agencies', g.id, g.name, null, g.deleted_at, g.deleted_by from public.agencies g
     where g.deleted_at is not null and g.deleted_via is null
    union all
    select 'documents', f.id, f.name, f.file_type, f.deleted_at, f.deleted_by from public.documents f
     where f.deleted_at is not null and f.deleted_via is null
    union all
    select 'bulletin_board', b.id, left(b.message, 80), b.message_type, b.deleted_at, b.deleted_by from public.bulletin_board b
     where b.deleted_at is not null and b.deleted_via is null
    union all
    select 'users', u.id, nullif(concat_ws(' ', u.first_name, u.last_name), ''), u.email, u.deleted_at, u.deleted_by from public.users u
     where u.deleted_at is not null and u.deleted_via is null
  )
  select d.kind, d.id, d.name, d.detail, d.deleted_at,
         (select nullif(concat_ws(' ', u.first_name, u.last_name), '') from public.users u where u.id = d.deleted_by),
         (select count(*) from public.projects p where p.deleted_via = d.kind || ':' || d.id)
       + (select count(*) from public.leads l where l.deleted_via = d.kind || ':' || d.id)
       + (select count(*) from public.appointments a where a.deleted_via = d.kind || ':' || d.id)
    from d
   where public.is_admin()
   order by d.deleted_at desc, d.kind, d.id
   limit 500;
$$;
revoke execute on function public.deleted_records() from public, anon;
grant execute on function public.deleted_records() to authenticated;

-- Bring a deleted record back, with whatever went with it. Not while what
-- it belongs to is still deleted: that comes back first.
create or replace function public.restore_record(p_table text, p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_via  text := p_table || ':' || p_id;
  v_n    integer;
  v_held text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can restore a deleted record' using errcode = '42501';
  end if;
  if p_table not in ('companies', 'projects', 'leads', 'appointments', 'agencies', 'documents', 'bulletin_board', 'users') then
    raise exception 'Not a kind of record that can be restored' using errcode = '22023';
  end if;

  if p_table = 'projects' then
    select c.name into v_held from public.projects p join public.companies c on c.id = p.company_id
     where p.id = p_id and c.deleted_at is not null;
    if v_held is not null then
      raise exception 'Its client, %, is deleted. Restore the client first.', v_held using errcode = '23503';
    end if;
  elsif p_table = 'leads' then
    select p.name into v_held from public.leads l join public.projects p on p.id = l.project_id
     where l.id = p_id and p.deleted_at is not null;
    if v_held is not null then
      raise exception 'Its project, %, is deleted. Restore the project first.', v_held using errcode = '23503';
    end if;
  elsif p_table = 'appointments' then
    select l.company_name into v_held from public.appointments a join public.leads l on l.id = a.lead_id
     where a.id = p_id and l.deleted_at is not null;
    if v_held is not null then
      raise exception 'Its lead, %, is deleted. Restore the lead first.', v_held using errcode = '23503';
    end if;
  end if;

  -- Only what was deleted in its own right: what went with something comes back with that.
  execute format('update public.%I set deleted_at = null, deleted_by = null where id = $1 and deleted_at is not null and deleted_via is null', p_table)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;

  update public.projects set deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  update public.leads set deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  update public.appointments set deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  return true;
end $$;
revoke execute on function public.restore_record(text, bigint) from public, anon;
grant execute on function public.restore_record(text, bigint) to authenticated;

-- --- 6. What reads past Row Level Security leaves the deleted out too ------
-- These run with the database's own rights (who may work a lead, a client's
-- projects, the scheduled reminders and alerts, sharing names out), so the
-- policy above does not reach them. Each is as it was, but for the flag.

-- A deleted lead is nobody's to work.
CREATE OR REPLACE FUNCTION public.can_work_lead(p_lead_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select case
             when public.app_role() = 'admin' then true
             when public.app_role() in ('manager', 'agent') then
                  l.assigned_user_id = public.app_user_id()
               or exists (select 1 from public.project_assignments pa
                           where pa.project_id = l.project_id and pa.ae_user_id = public.app_user_id())
               or (select a.user_id from public.appointments a
                    where a.lead_id = l.id and a.invalid_at is null and a.deleted_at is null
                    order by a.appt_create_date desc, a.id desc
                    limit 1) = public.app_user_id()
           end
      from public.leads l
     where l.id = p_lead_id and l.deleted_at is null), false);
$function$;

-- A client's projects: not the deleted ones.
CREATE OR REPLACE FUNCTION public.client_project_ids()
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id from public.projects p
  where p.company_id = public.app_company_id() and p.deleted_at is null
  union
  select pa.project_id from public.project_assignments pa
  where pa.cl_user_id = public.app_user_id()
    and exists (select 1 from public.projects p where p.id = pa.project_id and p.deleted_at is null);
$function$;

-- A rep's load counts the names still there.
CREATE OR REPLACE FUNCTION public.least_loaded_rep(p_project bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pa.ae_user_id
    from public.project_assignments pa
    join public.users u on u.id = pa.ae_user_id and u.status = 'active'
   where pa.project_id = p_project
   order by (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
              where l.project_id = p_project and l.assigned_user_id = pa.ae_user_id and r.viable and r.callable and l.deleted_at is null),
            pa.ae_user_id
   limit 1;
$function$;

-- No call-back reminder for a deleted lead (it waits, and is delivered if the lead is restored).
CREATE OR REPLACE FUNCTION public.deliver_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     record;
  v_id  bigint;
  n     integer := 0;
begin
  for r in
    select m.id, m.user_id, m.lead_id, m.note, m.remind_at, l.company_name
      from public.reminders m
      join public.leads l on l.id = m.lead_id and l.deleted_at is null
     where m.sent_at is null and m.remind_at <= now()
     order by m.remind_at
     for update of m skip locked
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      r.user_id, 'reminder',
      left('Call back: ' || coalesce(r.company_name, 'a lead'), 120),
      left(concat_ws(' · ', 'Reminder for ' || to_char(r.remind_at at time zone public.business_tz(), 'FMHH12:MI AM'), r.note), 1000),
      '/leads/' || r.lead_id
    )
    returning id into v_id;
    update public.reminders set sent_at = now(), notification_id = v_id where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$;

-- The morning's appointment reminders: not for deleted appointments or leads.
CREATE OR REPLACE FUNCTION public.send_appointment_reminders(p_day date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  n integer := 0;
begin
  for r in
    with live as (
      select a.user_id, a.appt_date, a.appt_time, a.confirmed_at, l.company_name
        from public.appointments a
        join public.leads l on l.id = a.lead_id and l.deleted_at is null
        left join public.appointment_statuses s on s.id = a.status_id
       where a.user_id is not null and a.invalid_at is null and a.deleted_at is null
         and coalesce(s.name, '') not in ('Cancelled', 'No Show', 'Invalid')
         and a.appt_date in (p_day, p_day + 1)
    )
    select user_id,
           count(*) filter (where appt_date = p_day) as today,
           count(*) filter (where appt_date = p_day + 1 and confirmed_at is null) as to_confirm,
           array_to_string((array_agg(coalesce(appt_time || ' ', '') || company_name order by appt_time)
                             filter (where appt_date = p_day))[1:5], ', ') as today_list,
           array_to_string((array_agg(company_name order by company_name)
                             filter (where appt_date = p_day + 1 and confirmed_at is null))[1:5], ', ') as confirm_list
      from live
     group by user_id
  loop
    if r.today = 0 and r.to_confirm = 0 then continue; end if;
    if exists (select 1 from public.alert_sends where rule = 'appt_reminder' and key = r.user_id || ':' || p_day) then
      continue;
    end if;
    insert into public.alert_sends (rule, key) values ('appt_reminder', r.user_id || ':' || p_day);
    n := n + public.notify_users(
      array[r.user_id], 'appointment',
      concat_ws(', ',
        case when r.today > 0 then r.today || ' appointment' || case when r.today = 1 then '' else 's' end || ' today' end,
        case when r.to_confirm > 0 then r.to_confirm || ' to confirm for tomorrow' end),
      concat_ws(' · ',
        case when r.today > 0 then 'Today: ' || r.today_list end,
        case when r.to_confirm > 0 then 'Confirm: ' || r.confirm_list end),
      '/calendar?view=day&d=' || p_day,
      'appt_reminder');
  end loop;
  return n;
end $function$;

-- X-date warnings: not for deleted leads.
CREATE OR REPLACE FUNCTION public.send_xdate_warnings(p_day date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     record;
  n     integer := 0;
  v_due date := p_day + 30;
begin
  for r in
    with due as (
      select l.id, l.company_name, coalesce(l.assigned_user_id, pa.ae_user_id) as rep
        from public.leads l
        join public.insurance_details i on i.lead_id = l.id
        left join public.call_results cr on cr.id = l.result_id
        -- Nobody holds it: whoever is on its project hears instead.
        left join lateral (select a.ae_user_id from public.project_assignments a
                            where a.project_id = l.project_id and l.assigned_user_id is null) pa on true
       where l.deleted_at is null
         and coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                              i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)) = v_due
         and (cr.id is null or cr.viable)          -- still worth a call: not off the list
    )
    select rep, count(*) as total, min(id) as first_id,
           (array_agg(company_name order by company_name))[1:5] as names
      from due where rep is not null
     group by rep
  loop
    if exists (select 1 from public.alert_sends where rule = 'xdate_30d' and key = r.rep || ':' || p_day) then
      continue;
    end if;
    insert into public.alert_sends (rule, key) values ('xdate_30d', r.rep || ':' || p_day);
    n := n + public.notify_users(
      array[r.rep], 'lead',
      case when r.total = 1 then 'X-date in 30 days: ' || r.names[1]
           else r.total || ' X-dates in 30 days' end,
      'Renewing ' || to_char(v_due, 'FMMon FMDD') ||
        case when r.total = 1 then '' else ': ' || array_to_string(r.names, ', ') ||
          case when r.total > 5 then ' and ' || (r.total - 5) || ' more' else '' end end,
      case when r.total = 1 then '/leads/' || r.first_id else '/work' end,
      'xdate_30d');
  end loop;
  return n;
end $function$;

-- Sharing a project's names out: only the names still there.
CREATE OR REPLACE FUNCTION public.distribute_names(p_project_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reps   bigint[];
  v_k      int;
  v_total  int;
  v_base   int;
  v_extra  int;
  rep      record;
  v_target int;
  v_before jsonb;
  v_moved  int := 0;
  v_n      int;
begin
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(pa.ae_user_id order by pa.ae_user_id), '{}')
    into v_reps
    from public.project_assignments pa
    join public.users u on u.id = pa.ae_user_id and u.status = 'active'
   where pa.project_id = p_project_id;
  v_k := coalesce(array_length(v_reps, 1), 0);

  -- Names held by anyone no longer on the project go back in the pool.
  update public.leads l set assigned_user_id = null
    from public.call_results r
   where r.id = l.result_id and r.viable and r.callable
     and l.project_id = p_project_id and l.deleted_at is null
     and l.assigned_user_id is not null
     and not (l.assigned_user_id = any(v_reps));

  select coalesce(jsonb_object_agg(uid, n), '{}') into v_before
    from (select l.assigned_user_id as uid, count(*) as n
            from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable and l.assigned_user_id is not null
           group by 1) c;

  if v_k = 0 then
    return jsonb_build_object('project_id', p_project_id, 'reps', 0, 'moved', 0,
                              'message', 'Nobody is assigned to this project yet');
  end if;

  select count(*) into v_total
    from public.leads l join public.call_results r on r.id = l.result_id
   where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable;
  v_base  := v_total / v_k;
  v_extra := v_total % v_k;

  -- Whoever holds most keeps the larger shares, so the fewest names move.
  for rep in
    select u.uid, row_number() over (order by coalesce(c.n, 0) desc, u.uid) as rank_no, coalesce(c.n, 0) as held
      from unnest(v_reps) as u(uid)
      left join (select l.assigned_user_id as uid, count(*) as n
                   from public.leads l join public.call_results r on r.id = l.result_id
                  where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable
                  group by 1) c on c.uid = u.uid
  loop
    v_target := v_base + case when rep.rank_no <= v_extra then 1 else 0 end;
    if rep.held > v_target then
      update public.leads set assigned_user_id = null
       where id in (select l.id from public.leads l join public.call_results r on r.id = l.result_id
                     where l.project_id = p_project_id and l.deleted_at is null and l.assigned_user_id = rep.uid and r.viable and r.callable
                     order by l.call_weight, l.date_last_worked nulls first, l.id desc
                     limit rep.held - v_target);
      get diagnostics v_n = row_count;
      v_moved := v_moved + v_n;
    end if;
  end loop;

  for rep in
    select u.uid, row_number() over (order by coalesce(c.n, 0) desc, u.uid) as rank_no, coalesce(c.n, 0) as held
      from unnest(v_reps) as u(uid)
      left join (select l.assigned_user_id as uid, count(*) as n
                   from public.leads l join public.call_results r on r.id = l.result_id
                  where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable
                  group by 1) c on c.uid = u.uid
  loop
    v_target := v_base + case when rep.rank_no <= v_extra then 1 else 0 end;
    if rep.held < v_target then
      update public.leads set assigned_user_id = rep.uid
       where id in (select l.id from public.leads l join public.call_results r on r.id = l.result_id
                     where l.project_id = p_project_id and l.deleted_at is null and l.assigned_user_id is null and r.viable and r.callable
                     order by l.id
                     limit v_target - rep.held);
    end if;
  end loop;

  return jsonb_build_object(
    'project_id', p_project_id,
    'names', v_total,
    'reps', v_k,
    'moved', v_moved,
    'before', v_before,
    'after', (select coalesce(jsonb_object_agg(uid, n), '{}')
                from (select l.assigned_user_id as uid, count(*) as n
                        from public.leads l join public.call_results r on r.id = l.result_id
                       where l.project_id = p_project_id and l.deleted_at is null and r.viable and r.callable and l.assigned_user_id is not null
                       group by 1) c));
end $function$;
