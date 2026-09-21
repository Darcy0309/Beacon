-- ---------------------------------------------------------------------------
-- Lighthouse CRM — aggregates computed in the database
--
-- PostgREST has no GROUP BY, so the app used to pull whole (narrow) tables
-- and count them in JavaScript, and fetch the ten form option lists as ten
-- requests. These functions and views return the finished figures in one
-- request each. Everything runs as the caller (SECURITY INVOKER), so Row
-- Level Security applies exactly as it does to direct queries.
-- ---------------------------------------------------------------------------

-- All the option lists the record forms need, in one call.
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
    'projects',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.projects),
    'managers',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'email', email) order by id), '[]'::jsonb)
                          from public.users where role in ('manager', 'agent')),
    'agencies',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.agencies),
    'companies',       (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.companies)
  );
$$;

-- Lead totals per status code, plus how many clients have leads.
create or replace function public.lead_counts()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',   (select count(*) from public.leads),
    'counts',  (select coalesce(jsonb_object_agg(s.code, c.n), '{}'::jsonb)
                  from (select status_id, count(*) as n from public.leads group by status_id) c
                  join public.lead_statuses s on s.id = c.status_id),
    'clients', (select count(distinct p.company_id)
                  from public.leads l join public.projects p on p.id = l.project_id
                 where p.company_id is not null)
  );
$$;

-- Appointments booked per rep, busiest first.
create or replace function public.rep_workload()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'appts', c.n)
           order by c.n desc, u.id
         ), '[]'::jsonb)
    from (select user_id, count(*) as n from public.appointments where user_id is not null group by user_id) c
    join public.users u on u.id = c.user_id
   where u.role in ('manager', 'agent');
$$;

-- Everything the dashboard tiles and chart need: totals, the 30/60-day and
-- 7/14-day comparisons, eight weekly buckets (oldest first), leads per
-- project, and the rep workload.
create or replace function public.dashboard_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as (
    select coalesce(lead_date, created_at) as at from public.leads
  ), a as (
    select appt_date from public.appointments
  ), weeks as (
    select i,
           now() - ((8 - i) * interval '7 days') as start_at,
           now() - ((7 - i) * interval '7 days') as end_at
      from generate_series(0, 7) as i
  )
  select jsonb_build_object(
    'leads_total',    (select count(*) from l),
    'leads_30d',      (select count(*) from l where at >= now() - interval '30 days'),
    'leads_30_60d',   (select count(*) from l where at >= now() - interval '60 days' and at < now() - interval '30 days'),
    'appts_total',    (select count(*) from a),
    'appts_today',    (select count(*) from a where appt_date = current_date),
    'appts_7d',       (select count(*) from a where appt_date >= (now() - interval '7 days')::date),
    'appts_7_14d',    (select count(*) from a where appt_date >= (now() - interval '14 days')::date and appt_date < (now() - interval '7 days')::date),
    'active_clients', (select count(*) from public.companies where status = 'active'),
    'weeks',          (select jsonb_agg(jsonb_build_object(
                          'leads', (select count(*) from l where l.at >= w.start_at and l.at < w.end_at),
                          'appts', (select count(*) from a where a.appt_date >= w.start_at::date and a.appt_date < w.end_at::date)
                        ) order by w.i) from weeks w),
    'project_leads',  (select coalesce(jsonb_agg(coalesce(c.n, 0) order by p.id), '[]'::jsonb)
                         from public.projects p
                         left join (select project_id, count(*) as n from public.leads group by project_id) c on c.project_id = p.id),
    'reps',           public.rep_workload()
  );
$$;

-- Everything the reports page needs: totals, show rate inputs, the status
-- and state breakdowns, and six months of lead/appointment volume (oldest
-- first, keyed YYYY-MM in UTC).
create or replace function public.report_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as (
    select state, status_id, to_char(coalesce(lead_date, created_at) at time zone 'utc', 'YYYY-MM') as ym from public.leads
  ), a as (
    select status_id, to_char(appt_date, 'YYYY-MM') as ym from public.appointments
  ), months as (
    select i, date_trunc('month', now() at time zone 'utc') - (i * interval '1 month') as m
      from generate_series(0, 5) as i
  )
  select jsonb_build_object(
    'leads',          (select count(*) from l),
    'appts',          (select count(*) from a),
    'projects',       (select count(*) from public.projects),
    'held',           (select count(*) from a join public.appointment_statuses s on s.id = a.status_id where s.name = 'Held'),
    'ratings',        (select jsonb_build_object('count', count(rating), 'avg', coalesce(avg(rating), 0)) from public.feedback where rating is not null),
    'by_status',      (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from l group by status_id) c
                         join public.lead_statuses s on s.id = c.status_id),
    'by_state',       (select coalesce(jsonb_agg(jsonb_build_array(t.state, t.n) order by t.n desc, t.state), '[]'::jsonb)
                         from (select state, count(*) as n from l where state is not null group by state order by n desc, state limit 8) t),
    'appt_by_status', (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from a group by status_id) c
                         join public.appointment_statuses s on s.id = c.status_id),
    'months',         (select jsonb_agg(jsonb_build_object(
                          'key',   to_char(m.m, 'YYYY-MM'),
                          'label', to_char(m.m, 'Mon'),
                          'leads', (select count(*) from l where l.ym = to_char(m.m, 'YYYY-MM')),
                          'appts', (select count(*) from a where a.ym = to_char(m.m, 'YYYY-MM'))
                        ) order by m.i desc) from months m)
  );
$$;

-- Per-company lead and appointment totals plus the first assigned account
-- manager, for the clients page.
create or replace view public.company_rollups with (security_invoker = true) as
  select c.id as company_id,
         (select count(*) from public.leads l join public.projects p on p.id = l.project_id where p.company_id = c.id) as lead_count,
         (select count(*) from public.appointments a
            join public.leads l on l.id = a.lead_id
            join public.projects p on p.id = l.project_id
           where p.company_id = c.id) as appt_count,
         (select jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'email', u.email)
            from public.projects p
            join public.project_assignments pa on pa.project_id = p.id
            join public.users u on u.id = pa.ae_user_id
           where p.company_id = c.id
           order by p.id, pa.id
           limit 1) as manager
    from public.companies c;

-- Leads assigned to and appointments owned by each user.
create or replace view public.user_workload with (security_invoker = true) as
  select u.id as user_id,
         (select count(*) from public.leads l where l.assigned_user_id = u.id) as lead_count,
         (select count(*) from public.appointments a where a.user_id = u.id) as appt_count
    from public.users u;

-- How many states each carrier's leads sit in.
create or replace view public.agency_footprint with (security_invoker = true) as
  select agency_id, count(distinct state) as state_count
    from public.leads
   where agency_id is not null and state is not null
   group by agency_id;

grant execute on function public.get_lookups(), public.lead_counts(), public.rep_workload(),
                          public.dashboard_stats(), public.report_stats() to authenticated;
grant select on public.company_rollups, public.user_workload, public.agency_footprint to authenticated;
