-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the account manager's day
--
-- What the screens need on top of the lifecycle engine:
--   work_projects()   "My Projects": the projects someone is assigned to (all of
--                     them for an administrator), with the names they have left,
--                     appointments waiting on their confirmation, and when they
--                     last worked each one
--   get_lookups()     projects now carry their client and type, so a DBDev
--                     project can be paired with its client's Appt project
-- ---------------------------------------------------------------------------

create or replace function public.work_projects()
returns table (
  id bigint, name text, client text, company_id bigint, type text, timezone text,
  state text, status text, appt_project_id bigint,
  names_left bigint,       -- the caller's names still to call
  names_left_all bigint,   -- everyone's (what an administrator watches)
  follow_ups bigint,       -- the caller's upcoming appointments waiting to be confirmed
  last_worked timestamptz  -- the caller's last call on the project
)
language sql stable security invoker set search_path = public as $$
  with me as (select public.app_user_id() as uid, coalesce(public.is_admin(), false) as admin)
  select p.id, p.name, co.name, p.company_id, t.code, tz.name, p.state, ps.name, p.appt_project_id,
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and l.assigned_user_id = me.uid and r.viable and r.callable),
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and r.viable and r.callable),
         (select count(*) from public.appointments a
           where a.set_project_id = p.id and a.user_id = me.uid and a.confirmed_at is null and a.invalid_at is null
             and a.appt_date >= current_date - 1),
         (select max(c.call_date) from public.call_records c where c.project_id = p.id and c.user_id = me.uid)
    from public.projects p
    cross join me
    left join public.companies co        on co.id = p.company_id
    left join public.project_types t     on t.id = p.project_type_id
    left join public.timezones tz        on tz.id = p.timezone_id
    left join public.project_statuses ps on ps.id = p.status_id
   where me.uid is not null
     and (me.admin or exists (select 1 from public.project_assignments pa
                               where pa.project_id = p.id and pa.ae_user_id = me.uid))
   order by p.name;
$$;
grant execute on function public.work_projects() to authenticated;

create or replace function public.get_lookups()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'statuses',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by id), '[]'::jsonb) from public.lead_statuses),
    'apptStatuses',    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.appointment_statuses),
    'projectTypes',    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'description', description) order by id), '[]'::jsonb) from public.project_types),
    'projectStatuses', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.project_statuses),
    'natures',         (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.nature_of_enquiry),
    'fbStatuses',      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.fb_statuses),
    'projects',        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'company_id', p.company_id, 'type', t.code) order by p.name), '[]'::jsonb)
                          from public.projects p left join public.project_types t on t.id = p.project_type_id),
    'managers',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'email', email) order by id), '[]'::jsonb)
                          from public.users where role in ('manager', 'agent')),
    'agencies',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.agencies),
    'companies',       (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.companies)
  );
$$;
