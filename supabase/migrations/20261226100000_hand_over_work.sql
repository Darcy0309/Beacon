-- Handing over a manager's work (Sean, Oct 2026): a manager leaves; their
-- account is disabled, nothing of theirs erased. What they did stays theirs
-- (the calls they made, the leads they developed, the appointments they set,
-- their pay and production); what was still to do goes to another manager
-- in one step.
--
--   appointments.follow_up_user_id   who follows an appointment up now (its
--                                    confirmation, the client's updates, moving
--                                    it), when not the manager who set it; the
--                                    setter (user_id) stays as it was, for the
--                                    figures and the history
--   The appointment's follow-up (confirmation alerts, To Confirm counts, who
--   may move it, work its lead, and hears of its QA, its client's updates and
--   its policy files) goes to that manager: can_work_lead, move_appointment,
--   send_appointment_reminders, work_projects, review_appointment_qa,
--   update_appointment_status, record_call_result, tg_documents_notify.
--   hand_over_work(from, to)         an administrator's hand-over: their projects
--                                    (in their place), their open names, the
--                                    appointments to follow up (to come, or in
--                                    the last 30 days), their reminders still to
--                                    go off, the clients they are Sales Rep or a
--                                    watcher for, and their prospects' links (to
--                                    an administrator or manager);
--                                    their own synced calendars come off. With
--                                    no `to`, only what they hold, counted.
--
-- Safe to run more than once.

alter table public.appointments add column if not exists follow_up_user_id bigint references public.users(id) on delete set null;
create index if not exists appointments_follow_up on public.appointments (follow_up_user_id) where follow_up_user_id is not null;

-- The follow-up: whoever was handed it, else the manager who set it. Widened in each
-- function where it says who that is, once; a function not as expected is said, not stopped.
do $$
declare
  c record;
  def text;
  fixed text;
begin
  for c in
    select * from (values
      ('can_work_lead', 'or (select a.user_id from public.appointments a', 'or (select coalesce(a.follow_up_user_id, a.user_id) from public.appointments a'),
      ('move_appointment', 'not (a.user_id = v_me or public.is_admin())', 'not (coalesce(a.follow_up_user_id, a.user_id) = v_me or public.is_admin())'),
      ('send_appointment_reminders', 'select a.user_id, a.appt_date', 'select coalesce(a.follow_up_user_id, a.user_id) as user_id, a.appt_date'),
      ('send_appointment_reminders', 'where a.user_id is not null and a.invalid_at is null', 'where coalesce(a.follow_up_user_id, a.user_id) is not null and a.invalid_at is null'),
      ('work_projects', 'a.set_project_id = p.id and a.user_id = me.uid and a.confirmed_at is null', 'a.set_project_id = p.id and coalesce(a.follow_up_user_id, a.user_id) = me.uid and a.confirmed_at is null'),
      ('review_appointment_qa', 'elsif v_appt.user_id is not null then', 'elsif coalesce(v_appt.follow_up_user_id, v_appt.user_id) is not null then'),
      ('review_appointment_qa', 'array[v_appt.user_id], ', 'array[coalesce(v_appt.follow_up_user_id, v_appt.user_id)], '),
      ('update_appointment_status', '(u.role = ''admin'' or u.id = a.user_id)', '(u.role = ''admin'' or u.id = coalesce(a.follow_up_user_id, a.user_id))'),
      ('record_call_result', '(r.applies_to = ''appointment'' and v_appt.user_id = v_me)', '(r.applies_to = ''appointment'' and coalesce(v_appt.follow_up_user_id, v_appt.user_id) = v_me)'),
      ('tg_documents_notify', 'array[l.assigned_user_id, a.user_id]', 'array[l.assigned_user_id, coalesce(a.follow_up_user_id, a.user_id)]')
    ) as t(fn, old_text, new_text)
  loop
    for def in select pg_get_functiondef(p.oid) from pg_proc p where p.proname = c.fn and p.pronamespace = 'public'::regnamespace loop
      if position(c.new_text in def) > 0 then
        continue;
      end if;
      if position(c.old_text in def) = 0 then
        raise warning 'hand-over: % does not say "%"; its follow-up is left to the manager who set the appointment', c.fn, c.old_text;
        continue;
      end if;
      fixed := replace(def, c.old_text, c.new_text);
      execute fixed;
    end loop;
  end loop;
end $$;

/**
 * Hand over a staff member's work to another (an administrator's): with no
 * `p_to`, only what they hold, counted. Returns { projects, names,
 * appointments, reminders, clients, watching, links, calendars }.
 */
create or replace function public.hand_over_work(p_from bigint, p_to bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from public.users;
  v_to   public.users;
  v_name text;
  v_since date := public.business_today() - 30;
  v_out  jsonb;
  n      int;
  v_projects int := 0;
  v_names int := 0;
  v_appts int := 0;
  v_reminders int := 0;
  v_clients int := 0;
  v_watching int := 0;
  v_links int := 0;
  v_calendars int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only administrators hand over work' using errcode = '42501';
  end if;
  select * into v_from from public.users where id = p_from;
  if not found or v_from.role not in ('admin', 'manager', 'agent') then
    raise exception 'Choose a member of staff to hand over from' using errcode = '22023';
  end if;
  v_name := coalesce(nullif(btrim(concat_ws(' ', v_from.first_name, v_from.last_name)), ''), v_from.email);

  if p_to is null then
    return jsonb_build_object(
      'projects', (select count(distinct project_id) from public.project_assignments where ae_user_id = p_from),
      'names', (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
                 where l.assigned_user_id = p_from and l.deleted_at is null and (r.viable or r.effect in ('appointment', 'confirm'))),
      'appointments', (select count(*) from public.appointments a
                        where coalesce(a.follow_up_user_id, a.user_id) = p_from and a.invalid_at is null and a.deleted_at is null and a.appt_date >= v_since),
      'reminders', (select count(*) from public.reminders where user_id = p_from and sent_at is null),
      'clients', (select count(*) from public.companies where sales_rep_id = p_from and deleted_at is null),
      'watching', (select count(*) from public.client_watchers where user_id = p_from),
      'links', (select count(*) from public.list_request_links where sales_rep_id = p_from),
      'calendars', (select count(*) from public.calendar_feeds where user_id = p_from));
  end if;

  select * into v_to from public.users where id = p_to;
  if not found or v_to.role not in ('admin', 'manager', 'agent') then
    raise exception 'Choose a member of staff to hand the work to' using errcode = '22023';
  end if;
  if p_to = p_from then
    raise exception 'Choose someone else to hand the work to' using errcode = '22023';
  end if;
  if v_to.status is distinct from 'active' or v_to.deleted_at is not null then
    raise exception '% cannot take over work until their account is active',
      coalesce(nullif(btrim(concat_ws(' ', v_to.first_name, v_to.last_name)), ''), v_to.email) using errcode = '22023';
  end if;

  -- Their projects, in their place (a project the other is on already keeps just them; a client contact's link stays).
  select count(distinct project_id) into v_projects from public.project_assignments where ae_user_id = p_from;
  update public.project_assignments set ae_user_id = null
   where ae_user_id = p_from and cl_user_id is not null
     and project_id in (select project_id from public.project_assignments where ae_user_id = p_to);
  delete from public.project_assignments
   where ae_user_id = p_from and project_id in (select project_id from public.project_assignments where ae_user_id = p_to);
  update public.project_assignments set ae_user_id = p_to where ae_user_id = p_from;

  -- Their open names: still to work, or an appointment still to follow up. Resolved names keep who held them.
  update public.leads l set assigned_user_id = p_to
    from public.call_results r
   where r.id = l.result_id and l.assigned_user_id = p_from and l.deleted_at is null
     and (r.viable or r.effect in ('appointment', 'confirm'));
  get diagnostics v_names = row_count;

  -- The appointments to follow up: still to come, or in the last 30 days (the client's update, its reminders). Set by them still.
  update public.appointments a set follow_up_user_id = p_to
   where coalesce(a.follow_up_user_id, a.user_id) = p_from and a.invalid_at is null and a.deleted_at is null and a.appt_date >= v_since;
  get diagnostics v_appts = row_count;

  -- Their reminders still to go off.
  update public.reminders set user_id = p_to where user_id = p_from and sent_at is null;
  get diagnostics v_reminders = row_count;

  -- The clients they look after: to an administrator or manager (a client's Sales Rep is one); with an agent, they stay to be given out.
  if v_to.role in ('admin', 'manager') then
    update public.companies set sales_rep_id = p_to where sales_rep_id = p_from and deleted_at is null;
    get diagnostics v_clients = row_count;
    insert into public.client_watchers (company_id, user_id, by_email)
    select company_id, p_to, by_email from public.client_watchers where user_id = p_from
    on conflict (company_id, user_id) do nothing;
    delete from public.client_watchers where user_id = p_from;
    get diagnostics v_watching = row_count;
    update public.list_request_links set sales_rep_id = p_to where sales_rep_id = p_from;
    get diagnostics v_links = row_count;
  end if;

  -- Their own calendars, synced into the projects': their busy times no longer keep appointments off.
  delete from public.calendar_feeds where user_id = p_from;
  get diagnostics v_calendars = row_count;

  v_out := jsonb_build_object('projects', v_projects, 'names', v_names, 'appointments', v_appts, 'reminders', v_reminders,
    'clients', v_clients, 'watching', v_watching, 'links', v_links, 'calendars', v_calendars);

  -- The one taking over hears what is now theirs.
  if v_projects + v_names + v_appts + v_reminders + v_clients + v_watching + v_links > 0 then
    perform public.notify_users(array[p_to], 'lead', left('You have taken over ' || v_name || '''s work', 160),
      left(concat_ws(' · ',
        case when v_projects > 0 then v_projects || ' project' || case when v_projects = 1 then '' else 's' end end,
        case when v_names > 0 then v_names || ' name' || case when v_names = 1 then '' else 's' end end,
        case when v_appts > 0 then v_appts || ' appointment' || case when v_appts = 1 then '' else 's' end || ' to follow up' end,
        case when v_reminders > 0 then v_reminders || ' reminder' || case when v_reminders = 1 then '' else 's' end end,
        case when v_clients > 0 then v_clients || ' client' || case when v_clients = 1 then '' else 's' end || ' as Sales Rep' end), 1000),
      '/work', null, gen_random_uuid(), public.app_user_id());
  end if;
  return v_out;
end $$;
revoke execute on function public.hand_over_work(bigint, bigint) from public, anon;
grant execute on function public.hand_over_work(bigint, bigint) to authenticated;
