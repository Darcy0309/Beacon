-- Pages faster on a full database (Nov 2026: "sometimes when I load other pages it takes too long").
-- Measured on a local copy with 200,000 names, 500,000 calls, 250,000 phone calls and 20,000
-- appointments; each function returns exactly what it did before (compared row for row).
--
--   projects_lead_stats   the Projects page: names matched to projects with an "or" join, every
--                         name against every project (16 million comparisons); now two plain
--                         matches over the names read once. 1.16 s -> 0.20 s
--   dashboard_stats       the Dashboard: one pass for the totals and windows, and the eight weeks
--                         counted once each (they were counted again for every week). 0.38 s -> 0.16 s
--   lead_explore          Lead Explorer: the employees check only when a range is given (it ran on
--                         every name, half the time), and only what the totals need kept for every
--                         match, the page's rows read in full. 1.2 s -> 0.43 s
--   lead_explore_options  Lead Explorer's pickers: only the columns counted, not every column of every
--                         name, and each carrier name's key worked out once. 1.0 s -> 0.5 s
--   user_workload         Account Managers: each person's names counted in one pass, not four
--                         lookups (one through every name's class) for every person. 0.92 s -> 0.08 s
--   report_stats          Reports: the six months' leads, appointments and ratings counted in one
--                         pass (each month went through every name again). 0.80 s -> 0.30 s
--   work_projects         a lead sheet and a call list: one project of My Projects worked out, not
--                         every one of the person's to find it (p_project_id). 0.30 s -> 0.015 s
--   appointments index    the Pipeline Report's "last appointment set" for each project and manager
--                         read through an index, not the whole table each row
--
-- Safe to run more than once.

create or replace function public.projects_lead_stats(p_companies bigint[] default null)
returns table(project_id bigint, names bigint, names_left bigint, leads bigint, leads_active bigint, developed bigint)
language sql stable set search_path = public as $$
  with ps as (
    select p.id from public.projects p where p_companies is null or p.company_id = any(p_companies)
  ), cls as materialized (
    -- The names, read once (Row Level Security decides whose).
    select c.project_id, c.source_project_id, c.stage, c.viable, c.developed from public.lead_classes c
  ), scoped as (
    -- A project's names: those on it, and those it sent on to another (as lead_stats() has them).
    select cls.project_id as pid, true as here, cls.stage, cls.viable, cls.developed
      from cls where cls.project_id in (select id from ps)
    union all
    select cls.source_project_id, false, cls.stage, cls.viable, cls.developed
      from cls where cls.source_project_id <> cls.project_id and cls.source_project_id in (select id from ps)
  )
  select pid, count(*),
         count(*) filter (where here and stage = 'dbdev' and viable),
         count(*) filter (where stage = 'appt'),
         count(*) filter (where stage = 'appt' and viable),
         count(*) filter (where developed)
    from scoped group by pid
  union all
  -- Every lead once, whichever projects it passed through (of those clients, when given).
  select null, count(*),
         count(*) filter (where stage = 'dbdev' and viable),
         count(*) filter (where stage = 'appt'),
         count(*) filter (where stage = 'appt' and viable),
         count(*) filter (where developed)
    from cls c
   where p_companies is null or c.project_id in (select id from ps);
$$;
revoke execute on function public.projects_lead_stats(bigint[]) from public, anon;
grant execute on function public.projects_lead_stats(bigint[]) to authenticated;

create or replace function public.dashboard_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select (now() at time zone public.business_tz())::date as today, now() as t
  ), per_project as (
    -- One pass over the leads: each project's count, and the dashboard's windows within it.
    select l.project_id, count(*) as n,
           count(*) filter (where coalesce(l.lead_date, l.created_at) >= z.t - interval '30 days') as d30,
           count(*) filter (where coalesce(l.lead_date, l.created_at) >= z.t - interval '60 days'
                              and coalesce(l.lead_date, l.created_at) < z.t - interval '30 days') as d30_60
      from public.leads l, z group by l.project_id
  ), lead_weeks as materialized (
    -- Each of the last eight weeks (0 the oldest; 7 ends now), from the same instants as before.
    select 7 - (ceil(extract(epoch from (z.t - coalesce(l.lead_date, l.created_at))) / 604800)::int - 1) as i, count(*) as n
      from public.leads l, z
     where coalesce(l.lead_date, l.created_at) >= z.t - interval '56 days' and coalesce(l.lead_date, l.created_at) < z.t
     group by 1
  ), ac as (
    select count(*) as total,
           count(*) filter (where a.appt_date = z.today) as today,
           count(*) filter (where a.appt_date between z.today - 6 and z.today) as d7,
           count(*) filter (where a.appt_date between z.today - 13 and z.today - 7) as d7_14
      from public.appointments a, z where a.invalid_at is null
  ), appt_weeks as materialized (
    select 7 - (z.today - a.appt_date) / 7 as i, count(*) as n
      from public.appointments a, z
     where a.invalid_at is null and a.appt_date between z.today - 55 and z.today
     group by 1
  )
  select jsonb_build_object(
    'leads_total',    (select coalesce(sum(n), 0) from per_project),
    'leads_30d',      (select coalesce(sum(d30), 0) from per_project),
    'leads_30_60d',   (select coalesce(sum(d30_60), 0) from per_project),
    'appts_total',    (select total from ac),
    'appts_today',    (select today from ac),
    'appts_7d',       (select d7 from ac),
    'appts_7_14d',    (select d7_14 from ac),
    'active_clients', (select count(*) from public.companies where status = 'active'),
    'weeks',          (select jsonb_agg(jsonb_build_object(
                          'leads', coalesce((select n from lead_weeks lw where lw.i = w.i), 0),
                          'appts', coalesce((select n from appt_weeks aw where aw.i = w.i), 0)
                        ) order by w.i) from generate_series(0, 7) as w(i)),
    'project_leads',  (select coalesce(jsonb_agg(coalesce(c.n, 0) order by p.id), '[]'::jsonb)
                         from public.projects p left join per_project c on c.project_id = p.id),
    'reps',           public.rep_workload()
  );
$$;

CREATE OR REPLACE FUNCTION public.lead_explore(criteria jsonb DEFAULT '{}'::jsonb, page integer DEFAULT 1, per_page integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with seen as (
    -- A manager sees only the projects they are assigned to, shared ones too (client, Nov 2026); everyone else every project.
    select public.app_role() = 'manager' as limited,
           array(select pa.project_id from public.project_assignments pa where pa.ae_user_id = public.app_user_id()) as ids
  ),
  c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'results',   '[]'::jsonb)))          as results,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select (jsonb_array_elements_text(coalesce(criteria->'projects', '[]'::jsonb)))::bigint) as projects,
      array(select (jsonb_array_elements_text(coalesce(criteria->'groups',   '[]'::jsonb)))::bigint) as groups,
      array(select jsonb_array_elements_text(coalesce(criteria->'carriers',  '[]'::jsonb)))          as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      case when criteria->>'emp_min' ~ '^\d{1,7}$' then (criteria->>'emp_min')::int end           as emp_min,
      case when criteria->>'emp_max' ~ '^\d{1,7}$' then (criteria->>'emp_max')::int end           as emp_max,
      coalesce(criteria->>'emp_not', '') = '1'                                                  as emp_not,
      public.search_patterns(public.search_words(criteria->>'q'))    as pats,
      public.search_lead_pattern(public.search_words(criteria->>'q')) as first_pat
  ),
  carrier_keys as (
    select coalesce(array_agg(distinct k) filter (where k is not null), '{}') as keys
      from (
        select public.carrier_key(v) as k from c, unnest(c.carriers) v where v !~ '^[0-9]+$'
        union all
        select public.carrier_key(a.name) from public.agencies a, c
         where a.id::text = any(array(select v from unnest(c.carriers) v where v ~ '^[0-9]{1,18}$'))
      ) t
  ),
  m as materialized (
    -- What the totals and breakdowns need, for every name that matches: narrow, so a full list stays quick
    -- (the page's rows are read in full below, not every match).
    select l.id, ins.id as ins_id, l.lead_date, l.state, l.sic_code,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name,
           r.name as result_name, r.viable as result_viable
      from public.leads l
      cross join c
      cross join carrier_keys ck
      cross join seen
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.call_results r on r.id = l.result_id
     -- Leads that have been promoted to an appointment project: a name still being developed is not one yet,
     -- whatever renewal dates it carries.
     where l.stage = 'appt'
       and (not seen.limited or l.project_id = any(seen.ids))
       and (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.results)  = 0 or coalesce(r.name, 'Not called yet') = any(c.results))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
       and (cardinality(c.projects) = 0 or l.project_id       = any(c.projects))
       and (cardinality(c.groups)   = 0 or co.agency_group_id = any(c.groups))
       and (cardinality(c.carriers) = 0 or public.carrier_key(coalesce(ag.name, ins.agency_name)) = any(ck.keys))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       -- Employees (the total) in a range, or not in it; a lead with no count is in no range.
       -- (Checked only when a range is given: without one every lead is in, and checking each one was half the search's time.)
       and (c.emp_min is null and c.emp_max is null
            or public.employees_in(jsonb_build_object('min', c.emp_min, 'max', c.emp_max, 'exclude', c.emp_not), l.employees))
       and (cardinality(c.months)   = 0 or extract(month from coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate,
              ins.health_xdate, ins.dental_xdate, ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)))::int = any(c.months))
       -- The longest word first, which the trigram index can answer; then every word.
       and (cardinality(c.pats)     = 0 or (l.search_text like c.first_pat and l.search_text like all (c.pats)))
  ),
  page as (
    select m.id, m.ins_id, m.lead_date from m
     order by m.lead_date desc nulls last, m.id desc
     limit greatest(least(coalesce(per_page, 10), (select case when limited then 100 else 10000 end from seen)), 1)
    offset least(greatest(coalesce(page, 1) - 1, 0)::bigint * greatest(least(coalesce(per_page, 10), (select case when limited then 100 else 10000 end from seen)), 1), 1000000000)
  ),
  win as (
    -- The page's rows in full, in the same order.
    select l.id, l.company_name, l.contact_name, l.contact_title, l.phone, l.contact_mobile, l.email,
           l.decision_maker, l.dm_title, l.dm_phone, l.dm_mobile, l.dm_email,
           l.contact2_name, l.contact2_title, l.contact2_phone, l.contact2_mobile, l.contact2_email, l.producer_name,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name, grp.name as agency_group,
           coalesce(ag.name, nullif(btrim(ins.agency_name), '')) as carrier_name,
           r.id as result_id, r.name as result_name, r.viable as result_viable,
           l.project_id, p.name as project_name,
           -- When it was last called or changed.
           l.date_last_worked as last_worked,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from page pg
      join public.leads l on l.id = pg.id
      left join public.insurance_details ins on ins.id = pg.ins_id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies grp on grp.id = co.agency_group_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.call_results r on r.id = l.result_id
      left join public.users u      on u.id  = l.assigned_user_id
     order by pg.lead_date desc nulls last, pg.id desc
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win) order by win.lead_date desc nulls last, win.id desc), '[]'::jsonb) from win),
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from renewal_date)::int as mon, count(*) as n
                            from m where renewal_date is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_result', (select coalesce(jsonb_agg(jsonb_build_object('label', t.label, 'count', t.n)
                                            order by t.n desc, t.label), '[]'::jsonb)
                    from (select coalesce(result_name, 'Not called yet') as label, count(*) as n from m group by 1) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where renewal_date is not null),
    -- Still to call for an appointment: a call result that leaves the lead viable (none yet counts).
    'viable',          (select count(*) from m where coalesce(result_viable, true))
  );
$function$;

CREATE OR REPLACE FUNCTION public.lead_explore_options()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with seen as (
    -- A manager sees only the projects they are assigned to, shared ones too (client, Nov 2026); everyone else every project.
    select public.app_role() = 'manager' as limited,
           array(select pa.project_id from public.project_assignments pa where pa.ae_user_id = public.app_user_id()) as ids
  ),
  l as materialized (
    -- Only what the pickers count, read once (every column of every name made this slow on a full list).
    select l.id, l.sic_code, l.state, l.county, l.result_id, l.project_id, l.agency_id
      from public.leads l, seen where l.stage = 'appt' and (not seen.limited or l.project_id = any(seen.ids))
  ),
  co as (
    select c.* from public.companies c, seen
     where not seen.limited or c.id in (select p.company_id from public.projects p where p.id = any(seen.ids))
  )
  select jsonb_build_object(
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.sic_code, 'label', coalesce(s.description, t.sic_code), 'count', t.n)
                                             order by t.n desc), '[]'::jsonb)
                     from (select sic_code, count(*) as n from l where sic_code is not null group by sic_code) t
                     left join public.sic_codes s on s.code = t.sic_code),
    'states',     (select coalesce(jsonb_agg(jsonb_build_object('value', t.state, 'label', t.state, 'count', t.n)
                                             order by t.state), '[]'::jsonb)
                     from (select state, count(*) as n from l where state is not null group by state) t),
    'counties',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.county, 'label', t.county, 'count', t.n)
                                             order by t.county), '[]'::jsonb)
                     from (select county, count(*) as n from l where county is not null group by county) t),
    'results',    (select coalesce(jsonb_agg(jsonb_build_object('value', t.label, 'label', t.label, 'count', t.n) order by t.n desc, t.label), '[]'::jsonb)
                     from (select coalesce(r.name, 'Not called yet') as label, count(*) as n
                             from l left join public.call_results r on r.id = l.result_id
                            group by 1) t),
    'clients',    (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from co),
    'projects',   (select coalesce(jsonb_agg(jsonb_build_object('value', p.id, 'label', p.name, 'count', t.n) order by p.name), '[]'::jsonb)
                     from (select project_id, count(*) as n from l where project_id is not null group by 1) t
                     join public.projects p on p.id = t.project_id),
    'groups',     (select coalesce(jsonb_agg(jsonb_build_object('value', g.id, 'label', g.name, 'count', t.n) order by g.name), '[]'::jsonb)
                     from (select agency_group_id, count(*) as n from co where agency_group_id is not null group by 1) t
                     join public.agencies g on g.id = t.agency_group_id),
    'carriers',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.k, 'label', t.label, 'count', t.n) order by t.k), '[]'::jsonb)
                     from (select k, (array_agg(label order by rec desc, label))[1] as label, sum(n)::bigint as n
                             from (select public.carrier_key(a.name) as k, btrim(a.name) as label, true as rec, 0 as n
                                     from public.agencies a
                                   union all
                                   -- The names' carriers counted by name first: each one's key worked out once, not once a lead.
                                   select public.carrier_key(c.name), btrim(c.name), false, c.n
                                     from (select coalesce(ag.name, ins.agency_name) as name, count(*) as n
                                             from l
                                             left join public.agencies ag on ag.id = l.agency_id
                                             left join public.insurance_details ins on ins.lead_id = l.id
                                            group by 1) c) x
                            where k is not null
                            group by k) t),
    'reps',       (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', nullif(concat_ws(' ', first_name, last_name), '')) order by first_name, last_name), '[]'::jsonb)
                     from public.users where role in ('admin', 'manager', 'agent'))
  );
$function$;

-- The Pipeline Report's last appointment set, for each project (the one it was set on) and manager.
create index if not exists appointments_set_project on public.appointments ((coalesce(set_project_id, project_id)), user_id)
  where deleted_at is null;

create or replace view public.user_workload with (security_invoker = true) as
 select u.id as user_id,
        coalesce(l.lead_count, 0::bigint) as lead_count,
        coalesce(a.appt_count, 0::bigint) as appt_count,
        coalesce(l.names_left, 0::bigint) as names_left,
        coalesce(l.leads_held, 0::bigint) as leads_held
   from public.users u
   left join (
     -- Each manager's names, counted in one pass (it was four passes for every person).
     select l.assigned_user_id as uid, count(*) as lead_count,
            count(*) filter (where l.stage = 'appt') as leads_held,
            count(*) filter (where l.stage = 'dbdev' and r.viable) as names_left
       from public.leads l join public.call_results r on r.id = l.result_id
      where l.assigned_user_id is not null
      group by 1
   ) l on l.uid = u.id
   left join (
     select ap.user_id as uid, count(*) as appt_count from public.appointments ap
      where ap.invalid_at is null and ap.user_id is not null group by 1
   ) a on a.uid = u.id;

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
  ), by_month as materialized (
    -- Each month's leads, appointments and ratings counted once (each month went through every name again).
    select ym, sum(leads)::bigint as leads, sum(appts)::bigint as appts, round(sum(rating_sum) / nullif(sum(ratings), 0), 1) as rating
      from (select ym, 1 as leads, 0 as appts, 0::numeric as rating_sum, 0 as ratings from l
            union all select ym, 0, 1, 0, 0 from a
            union all select ym, 0, 0, rating, 1 from f) x
     group by ym
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
    -- The same, each stage's results apart: { "APPT": {name: n}, "DBDV": {name: n} }.
    'by_result',      (select coalesce(jsonb_object_agg(t.project_type, t.results), '{}'::jsonb)
                         from (select c.project_type, jsonb_object_agg(c.name, c.n) as results
                                 from (select r.project_type, r.name, count(*) as n
                                         from l join public.call_results r on r.id = l.result_id
                                        group by r.project_type, r.name) c
                                group by c.project_type) t),
    'by_state',       (select coalesce(jsonb_agg(jsonb_build_array(t.state, t.n) order by t.n desc, t.state), '[]'::jsonb)
                         from (select state, count(*) as n from l where state is not null group by state order by n desc, state limit 8) t),
    'appt_by_status', (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from a group by status_id) c
                         join public.appointment_statuses s on s.id = c.status_id),
    'months',         (select jsonb_agg(jsonb_build_object(
                          'key',    to_char(m.m, 'YYYY-MM'),
                          'label',  to_char(m.m, 'Mon'),
                          'leads',  coalesce(bm.leads, 0),
                          'appts',  coalesce(bm.appts, 0),
                          'rating', bm.rating
                        ) order by m.i desc) from months m left join by_month bm on bm.ym = to_char(m.m, 'YYYY-MM'))
  );
$function$;

-- work_projects: a lead sheet and a call list need one project of My Projects; every one of the person's
-- projects was worked out (an administrator's every project, four counts each) to find it.
drop function if exists public.work_projects();
CREATE OR REPLACE FUNCTION public.work_projects(p_project_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(id bigint, name text, client text, company_id bigint, type text, timezone text, state text, status text, appt_project_id bigint, names_left bigint, names_left_all bigint, follow_ups bigint, last_worked timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with me as materialized (select public.app_user_id() as uid, coalesce(public.is_admin(), false) as admin)
  select p.id, p.name, co.name, p.company_id, t.code, tz.name, p.state, ps.name, p.appt_project_id,
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and l.assigned_user_id = me.uid and r.viable and r.callable and (l.call_back_on is null or l.call_back_on <= public.business_today())),
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and r.viable and r.callable and (l.call_back_on is null or l.call_back_on <= public.business_today())),
         (select count(*) from public.appointments a
           where a.set_project_id = p.id and coalesce(a.follow_up_user_id, a.user_id) = me.uid and a.confirmed_at is null and a.invalid_at is null
             and a.appt_date >= current_date - 1),
         (select max(c.call_date) from public.call_records c where c.project_id = p.id and c.user_id = me.uid)
    from public.projects p
    cross join me
    left join public.companies co        on co.id = p.company_id
    left join public.project_types t     on t.id = p.project_type_id
    left join public.timezones tz        on tz.id = p.timezone_id
    left join public.project_statuses ps on ps.id = p.status_id
   where me.uid is not null
     -- One project (a lead sheet's, a call list's): only it worked out, not every one of theirs.
     and (p_project_id is null or p.id = p_project_id)
     and (me.admin or exists (select 1 from public.project_assignments pa
                               where pa.project_id = p.id and pa.ae_user_id = me.uid))
   order by p.name;
$function$;
grant execute on function public.work_projects(bigint) to authenticated;

notify pgrst, 'reload schema';
