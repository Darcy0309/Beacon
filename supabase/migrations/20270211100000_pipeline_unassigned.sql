-- The Pipeline Report counts the names no manager holds (Sean, Nov 2026: "the pipeline report section at the bottom
-- of the page stays blank for any months I filter", on BTC Ins Services_2026_Appts). It had a row for each project
-- and manager, and so left out every name with no manager: an imported list's names all, which the chart above it
-- counts. Those names are now a "No manager" row of their project, whose last appointment set, last call and
-- calls this month are anyone's on it, and which every manager on it shares.
--
-- Safe to run more than once.

create or replace function public.pipeline_report(
  p_months int[] default null, p_project_ids bigint[] default null, p_company_id bigint default null,
  p_type text default null, p_rep_id bigint default null, p_user_ids bigint[] default null)
returns table (project_id bigint, project text, project_type text, time_zone text, state text,
               manager_id bigint, manager_first text, manager_last text, last_appt_set date, last_worked timestamptz,
               calls bigint, months jsonb, total bigint, appts bigint, off_list bigint, viable_left bigint,
               pay numeric, special_pay numeric, sales_rep_first text, sales_rep_last text, shared_with jsonb, special_goal int)
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
    -- Every name renewing in the months, a manager's or nobody's (uid null).
    select x.project_id as pid, x.user_id as uid, x.month as m, x.bucket
      from public.xdate_names(v_allowed, p_company_id, p_type, p_rep_id, p_user_ids) x
     where x.month = any(v_months)
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
         tz.name, coalesce(nullif(pr.state, ''), c.state),
         u.id, u.first_name, u.last_name,
         (select max((coalesce(a.appt_create_date, a.created_at) at time zone v_tz)::date) from public.appointments a
           where (r.uid is null or a.user_id = r.uid) and coalesce(a.set_project_id, a.project_id) = r.pid and a.deleted_at is null),
         (select max(cr.call_date) from public.call_records cr where (r.uid is null or cr.user_id = r.uid) and cr.project_id = r.pid),
         (select count(*) from public.call_records cr where (r.uid is null or cr.user_id = r.uid) and cr.project_id = r.pid
             and cr.call_date >= (date_trunc('month', v_today)::timestamp at time zone v_tz)),
         (select jsonb_object_agg(pm.m, pm.c) from per_month pm where pm.pid = r.pid and pm.uid is not distinct from r.uid),
         r.total, r.appts, r.off_list, r.viable_left,
         case when t.code = 'DBDV' then pr.lead_rate else pr.appointment_rate end,
         case when t.code = 'DBDV' then pr.special_rate else pr.confirmation_rate end,
         sr.first_name, sr.last_name,
         coalesce((select jsonb_agg(jsonb_build_object('first', o.first_name, 'last', o.last_name) order by o.first_name, o.last_name)
                     from public.project_assignments pa join public.users o on o.id = pa.ae_user_id
                    where pa.project_id = r.pid and pa.ae_user_id is distinct from r.uid and o.status = 'active' and o.deleted_at is null), '[]'::jsonb),
         case when t.code = 'DBDV' then pr.special_goal end
    from per_row r
    join public.projects pr on pr.id = r.pid
    left join public.users u on u.id = r.uid
    left join public.project_types t on t.id = pr.project_type_id
    left join public.companies c on c.id = pr.company_id
    left join public.timezones tz on tz.id = pr.timezone_id
    left join public.users sr on sr.id = c.sales_rep_id;
end $$;
revoke execute on function public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]) from public, anon;
grant execute on function public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]) to authenticated;
