-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the client's Leads Developed counts leads (Sean, Oct 2026)
--
-- Tile 1 counted every name on a client's projects, so a DB dev list read as
-- its names still to call (6,911) rather than the leads it developed. Now:
--
--   leads     the names that became leads on their projects (at the
--             appointment stage, active or resolved: what lead_stats() calls
--             a project's leads), over the days chosen by when each became one
--   projects  their DB dev projects only, each with the leads it developed
--             (the names it sent on, and any at the appointment stage on it)
--
--   appts     the names whose result is an appointment (set, confirmed or
--             invalid), once each however often it was moved or set again:
--             what the client's projects show as their appointments (257)
--   results   for each of those names, its latest appointment's outcome as the
--             client records it (Pending until then); Invalid when the name's
--             result is Appointment-Invalid
--
--   client_pipeline()   tile 4 reads the viable names (not appointments) by
--                       renewal month, as the X-Dates report's Viable left
--   client_activity()   with the manager's id, to message them
--   message_manager()   Recent Activity: a client sends the manager who
--                       developed a lead a note about it, as a message
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

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
           (select ap.client_result from public.appointments ap where ap.lead_id = l.id order by ap.created_at desc, ap.id desc limit 1) as client_result
      from l, z
     where l.project_id in (select id from p)
       and l.effect in ('appointment', 'confirm', 'appointment_invalid')
       and (p_from is null or coalesce(l.appt_created_date, l.promoted_at, l.lead_date, l.created_at) >= (p_from::timestamp at time zone z.tz))
  ), ar as (
    select case when effect = 'appointment_invalid' then 'invalid' else coalesce(client_result, 'pending') end as result from a
  )
  select jsonb_build_object(
    'leads', (select count(*) from lp where lp.project_id in (select id from p)),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                                   'leads', (select count(*) from lp where lp.source_project_id = p.id or lp.project_id = p.id))
                                 order by p.name), '[]'::jsonb)
                   from p where p.type = 'DBDV'),
    'appts', (select count(*) from a),
    'results', (select jsonb_build_object(
                  'pending', count(*) filter (where result = 'pending'),
                  'quoting', count(*) filter (where result = 'quoting'),
                  'quoted_not_sold', count(*) filter (where result = 'quoted_not_sold'),
                  'valid_not_quoting', count(*) filter (where result = 'valid_not_quoting'),
                  'invalid', count(*) filter (where result = 'invalid'),
                  'sold', count(*) filter (where result = 'sold')) from ar)
  );
$$;
revoke execute on function public.client_dashboard(date, bigint) from public, anon;
grant execute on function public.client_dashboard(date, bigint) to authenticated;

/**
 * Tile 4: the viable names renewing in each of the next p_months months (not this one), counted as
 * the X-Dates report counts its Viable left: a viable result that is not an appointment, on every
 * project of theirs (the names still to call and the leads alike).
 */
create or replace function public.client_pipeline(p_months int default 3, p_company_id bigint default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), m as (
    select i, (date_trunc('month', now() at time zone z.tz) + (i * interval '1 month'))::date as first
      from z, generate_series(1, greatest(least(coalesce(p_months, 3), 12), 1)) as i
  ), x as (
    select * from public.xdates_by_month(null, p_company_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', to_char(m.first, 'YYYY-MM'), 'label', to_char(m.first, 'Mon'),
           'leads', coalesce((select x.viable_left from x where x.month = extract(month from m.first)::int), 0)
         ) order by m.i), '[]'::jsonb)
    from m;
$$;
revoke execute on function public.client_pipeline(int, bigint) from public, anon;
grant execute on function public.client_pipeline(int, bigint) to authenticated;

-- Recent Activity, with the manager's id (the row it returns changes, so it is made again).
drop function if exists public.client_activity(date, date, bigint, text, bigint);
create function public.client_activity(p_from date, p_to date, p_project_id bigint default null,
  p_kind text default null, p_company_id bigint default null)
returns table (id bigint, at timestamptz, kind text, result text, lead_id bigint, company text, city text, state text,
  project_id bigint, project text, agent text, manager text, xdate date, manager_id bigint)
language sql stable security definer set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), mine as (
    select p.id from public.projects p
     where p.deleted_at is null
       and (case when public.is_staff() then (p_company_id is null or p.company_id = p_company_id)
                 else p.id in (select public.client_project_ids()) end)
       and (p_project_id is null or p.id = p_project_id)
  )
  select e.id, e.created_at, e.kind,
         case when e.kind = 'lead' then 'Lead'
              when ap.invalid_at is not null then 'Appointment-Invalid'
              when ap.confirmed_at is not null then 'Appointment-Confirmed'
              else 'Appointment' end,
         l.id, l.company_name, l.city, l.state, pr.id, pr.name,
         coalesce(nullif(btrim(ap.rep_name), ''), nullif(btrim(pr.contact_name), '')),
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''),
         (select min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                      i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)))
            from public.insurance_details i where i.lead_id = l.id),
         case when u.status = 'active' then u.id end
    from public.pay_events e
    join public.leads l on l.id = e.lead_id and l.deleted_at is null
    join public.projects pr on pr.id = coalesce(e.project_id, l.project_id)
    left join public.appointments ap on ap.id = e.appointment_id
    left join public.users u on u.id = e.user_id, z
   where public.app_user_id() is not null
     and pr.id in (select id from mine)
     and e.kind in ('lead', 'appointment') and not e.is_chargeback
     and (p_kind is null or e.kind = p_kind)
     and e.created_at >= (p_from::timestamp at time zone z.tz)
     and e.created_at < ((p_to + 1)::timestamp at time zone z.tz)
     and (e.kind = 'lead' or coalesce(ap.qa_status, 'passed') = 'passed')
   order by e.created_at desc, e.id desc
   limit 1000;
$$;
revoke execute on function public.client_activity(date, date, bigint, text, bigint) from public, anon;
grant execute on function public.client_activity(date, date, bigint, text, bigint) to authenticated;

/**
 * A note about a lead to the manager who developed it (Recent Activity, Sean, Oct 2026): from a
 * client, on a name of their own projects, to a manager who developed it or works its list; as a
 * message in the manager's notifications, linked to the lead, that they can reply to.
 */
create or replace function public.message_manager(p_lead_id bigint, p_manager_id bigint, p_body text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me    public.users;
  v_body  text := btrim(coalesce(p_body, ''));
  v_lead  public.leads;
  v_sent  int;
begin
  select * into v_me from public.users where id = public.app_user_id();
  if v_me.id is null then
    raise exception 'Sign in to send a message' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'Write your message first' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep a message under 1,000 characters' using errcode = '22023';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null;
  if v_lead.id is null or not (public.is_staff() or v_lead.project_id in (select public.client_project_ids())
                                 or v_lead.source_project_id in (select public.client_project_ids())) then
    raise exception 'That lead is not on your projects' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users u where u.id = p_manager_id and u.status = 'active' and u.role in ('admin', 'manager', 'agent'))
     or not (exists (select 1 from public.pay_events e where e.lead_id = p_lead_id and e.user_id = p_manager_id)
             or p_manager_id in (v_lead.assigned_user_id, v_lead.dbdv_user_id)) then
    raise exception 'That manager did not work this lead' using errcode = '42501';
  end if;
  -- One a minute or so is plenty: not a way to flood a manager.
  if (select count(*) from public.notifications where sender_id = v_me.id and kind = 'message' and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'You are sending messages too quickly. Wait a moment and try again.' using errcode = '22023';
  end if;
  v_sent := public.notify_users(array[p_manager_id], 'message',
    left('Message from ' || coalesce(nullif(btrim(concat_ws(' ', v_me.first_name, v_me.last_name)), ''), v_me.email) || ': ' || coalesce(v_lead.company_name, 'a lead'), 160),
    v_body, '/leads/' || v_lead.id, null, gen_random_uuid(), v_me.id);
  return v_sent;
end $$;
revoke execute on function public.message_manager(bigint, bigint, text) from public, anon;
grant execute on function public.message_manager(bigint, bigint, text) to authenticated;

notify pgrst, 'reload schema';
