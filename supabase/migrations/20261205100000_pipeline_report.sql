-- ---------------------------------------------------------------------------
-- Lighthouse CRM — X-Dates filters and the Pipeline Report (Sean, Oct 2026)
--
-- X-Dates by Month filters by project (several), client, its Sales Rep, DB dev
-- or appointment projects, and the managers the names are assigned to; and
-- shows the Pipeline Report: for each project and manager, the names renewing
-- in the months chosen (the next three to begin with), split as the chart
-- splits them (appointments, off the list, viable left), with the manager's
-- last appointment set and last call on it, this month's calls, the
-- project's pay, the client's Sales Rep and the other managers on it.
-- Managers get the report too (Data & Insights), on their own projects.
--
--   xdate_names(…filters)        each name: its project, manager, renewal
--                                month and bucket (as the caller may read)
--   xdates_filtered(…filters)    xdates_by_month(), filtered
--   xdate_month_leads_filtered() xdate_month_leads(), filtered
--   pipeline_report(months, …filters)   the report (administrators: every
--                                project; managers and agents: those they
--                                are assigned to)
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

/**
 * Every name the caller may read (Row Level Security) on the projects asked for, with its project,
 * manager (assigned_user_id), renewal (its soonest X-date, as everywhere), renewal month (0: none)
 * and bucket: appointment, viable (left to work) or off (the list).
 */
create or replace function public.xdate_names(p_project_ids bigint[] default null, p_company_id bigint default null,
  p_type text default null, p_rep_id bigint default null, p_user_ids bigint[] default null)
returns table (lead_id bigint, project_id bigint, user_id bigint, renewal date, month int, bucket text)
language sql stable security invoker set search_path = public as $$
  select l.id, l.project_id, l.assigned_user_id, ren.renewal, coalesce(extract(month from ren.renewal)::int, 0),
         case when r.effect in ('appointment', 'confirm') then 'appointment' when r.viable then 'viable' else 'off' end
    from public.leads l
    join public.call_results r on r.id = l.result_id
    join public.projects p on p.id = l.project_id and p.deleted_at is null
    left join public.project_types t on t.id = p.project_type_id
    left join public.companies c on c.id = p.company_id
    left join lateral (
      select min(coalesce(i.ultimate_xdate,
                          least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
        from public.insurance_details i where i.lead_id = l.id
    ) ren on true
   where l.deleted_at is null
     and (p_project_ids is null or l.project_id = any(p_project_ids))
     and (p_company_id is null or p.company_id = p_company_id)
     and (p_type is null or t.code = p_type)
     and (p_rep_id is null or c.sales_rep_id = p_rep_id)
     and (p_user_ids is null or l.assigned_user_id = any(p_user_ids));
$$;
revoke execute on function public.xdate_names(bigint[], bigint, text, bigint, bigint[]) from public, anon;
grant execute on function public.xdate_names(bigint[], bigint, text, bigint, bigint[]) to authenticated;

/** X-Dates by Month's chart, filtered: each renewal month's names, by bucket. */
create or replace function public.xdates_filtered(p_project_ids bigint[] default null, p_company_id bigint default null,
  p_type text default null, p_rep_id bigint default null, p_user_ids bigint[] default null)
returns table (month int, total bigint, appointments bigint, off_list bigint, viable_left bigint)
language sql stable security invoker set search_path = public as $$
  select x.month, count(*), count(*) filter (where x.bucket = 'appointment'), count(*) filter (where x.bucket = 'off'),
         count(*) filter (where x.bucket = 'viable')
    from public.xdate_names(p_project_ids, p_company_id, p_type, p_rep_id, p_user_ids) x
   group by x.month
   order by x.month;
$$;
revoke execute on function public.xdates_filtered(bigint[], bigint, text, bigint, bigint[]) from public, anon;
grant execute on function public.xdates_filtered(bigint[], bigint, text, bigint, bigint[]) to authenticated;

/** One page of the names behind a number in xdates_filtered(); p_bucket null means all of them. */
create or replace function public.xdate_month_leads_filtered(p_month int, p_bucket text default null,
  p_project_ids bigint[] default null, p_company_id bigint default null, p_type text default null,
  p_rep_id bigint default null, p_user_ids bigint[] default null, p_limit int default 20, p_offset int default 0)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  project text, result text, renewal_date date, rep_first text, rep_last text, rep_email text, total bigint
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
         p.name, r.name, x.renewal, u.first_name, u.last_name, u.email, count(*) over ()
    from public.xdate_names(p_project_ids, p_company_id, p_type, p_rep_id, p_user_ids) x
    join public.leads l on l.id = x.lead_id
    join public.call_results r on r.id = l.result_id
    left join public.projects p on p.id = l.project_id
    left join public.users u on u.id = l.assigned_user_id
   where x.month = p_month and (p_bucket is null or x.bucket = p_bucket)
   order by extract(day from x.renewal) nulls last, l.company_name, l.id
   limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.xdate_month_leads_filtered(int, text, bigint[], bigint, text, bigint, bigint[], int, int) from public, anon;
grant execute on function public.xdate_month_leads_filtered(int, text, bigint[], bigint, text, bigint, bigint[], int, int) to authenticated;

/**
 * The Pipeline Report: a row for each project and manager with names renewing in p_months (the
 * next three months when none are given), each month's count, the total and its buckets, the
 * manager's last appointment set (its day) and last call on the project, their calls on it this
 * month, the project's pay (an appointment's, a lead's on a DB dev project) and special pay (a
 * confirmation's), the client's Sales Rep, and the other managers assigned to it. An administrator
 * reads every project; anyone else on staff, the projects they are assigned to.
 */
create or replace function public.pipeline_report(p_months int[] default null, p_project_ids bigint[] default null,
  p_company_id bigint default null, p_type text default null, p_rep_id bigint default null, p_user_ids bigint[] default null)
returns table (project_id bigint, project text, project_type text, time_zone text, state text,
  manager_id bigint, manager_first text, manager_last text, last_appt_set date, last_worked timestamptz, calls bigint,
  months jsonb, total bigint, appts bigint, off_list bigint, viable_left bigint,
  pay numeric, special_pay numeric, sales_rep_first text, sales_rep_last text, shared_with jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me     bigint := public.app_user_id();
  v_tz     text := public.business_tz();
  v_today  date := (now() at time zone public.business_tz())::date;
  v_months int[] := p_months;
  v_allowed bigint[];
begin
  if v_me is null or not public.is_staff() then
    raise exception 'The Pipeline Report is for staff' using errcode = '42501';
  end if;
  if v_months is null or cardinality(v_months) = 0 then
    v_months := array(select ((extract(month from v_today)::int - 1 + i) % 12) + 1 from generate_series(1, 3) i);
  end if;
  -- The projects this person may read: every one (an administrator), or those they are assigned to.
  if public.is_admin() then
    v_allowed := p_project_ids;
  else
    v_allowed := array(select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_me
                        and (p_project_ids is null or pa.project_id = any(p_project_ids)));
  end if;

  return query
  with names as (
    select x.project_id as pid, x.user_id as uid, x.month as m, x.bucket
      from public.xdate_names(v_allowed, p_company_id, p_type, p_rep_id, p_user_ids) x
     where x.month = any(v_months) and x.user_id is not null
  ), per_month as (
    select n.pid, n.uid, n.m, count(*) as c from names n group by 1, 2, 3
  ), per_row as (
    select n.pid, n.uid, count(*) as total,
           count(*) filter (where n.bucket = 'appointment') as appts,
           count(*) filter (where n.bucket = 'off') as off_list,
           count(*) filter (where n.bucket = 'viable') as viable_left
      from names n group by 1, 2
  )
  select pr.id, pr.name, t.code,
         coalesce(tz.name, ctz.name), coalesce(nullif(pr.state, ''), c.state),
         u.id, u.first_name, u.last_name,
         (select max((coalesce(a.appt_create_date, a.created_at) at time zone v_tz)::date) from public.appointments a
           where a.user_id = r.uid and coalesce(a.set_project_id, a.project_id) = r.pid and a.deleted_at is null),
         (select max(cr.call_date) from public.call_records cr where cr.user_id = r.uid and cr.project_id = r.pid),
         (select count(*) from public.call_records cr where cr.user_id = r.uid and cr.project_id = r.pid
             and cr.call_date >= (date_trunc('month', v_today)::timestamp at time zone v_tz)),
         (select jsonb_object_agg(pm.m, pm.c) from per_month pm where pm.pid = r.pid and pm.uid = r.uid),
         r.total, r.appts, r.off_list, r.viable_left,
         case when t.code = 'DBDV' then pr.lead_rate else pr.appointment_rate end, pr.confirmation_rate,
         sr.first_name, sr.last_name,
         coalesce((select jsonb_agg(jsonb_build_object('first', o.first_name, 'last', o.last_name) order by o.first_name, o.last_name)
                     from public.project_assignments pa join public.users o on o.id = pa.ae_user_id
                    where pa.project_id = r.pid and pa.ae_user_id <> r.uid and o.status = 'active' and o.deleted_at is null), '[]'::jsonb)
    from per_row r
    join public.projects pr on pr.id = r.pid
    join public.users u on u.id = r.uid
    left join public.project_types t on t.id = pr.project_type_id
    left join public.companies c on c.id = pr.company_id
    left join public.timezones tz on tz.id = pr.timezone_id
    left join public.timezones ctz on ctz.id = c.timezone_id
    left join public.users sr on sr.id = c.sales_rep_id;
end $$;
revoke execute on function public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]) from public, anon;
grant execute on function public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]) to authenticated;

/** The people the Pipeline Report's Manager filter offers: those with names on the projects the caller may read. */
create or replace function public.pipeline_managers()
returns table (id bigint, first_name text, last_name text)
language sql stable security definer set search_path = public as $$
  select distinct u.id, u.first_name, u.last_name
    from public.project_assignments pa join public.users u on u.id = pa.ae_user_id
   where public.is_staff() and u.status = 'active' and u.deleted_at is null
     and (public.is_admin() or pa.project_id in (select x.project_id from public.project_assignments x where x.ae_user_id = public.app_user_id()))
   order by u.first_name, u.last_name;
$$;
revoke execute on function public.pipeline_managers() from public, anon;
grant execute on function public.pipeline_managers() to authenticated;

notify pgrst, 'reload schema';
