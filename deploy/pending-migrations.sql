-- Lighthouse: the migrations live is missing (20270219 onwards), in order.
-- Built from supabase/migrations on 2026-11-25: 17 migration(s), oldest first, each as written.
-- For LIVE. Each of these is safe to run again (tables and columns only if missing, policies dropped first,
-- functions replaced), so it doesn't matter if some of them already went in.
-- Contents: 20270219100000, 20270220100000, 20270221100000, 20270222100000, 20270223100000, 20270224100000, 20270225100000, 20270226100000, 20270227100000, 20270228100000, 20270301100000, 20270302100000, 20270303100000, 20270304100000, 20270305100000, 20270306100000, 20270307100000.
-- Run it whole in the Supabase SQL editor. Not one transaction: each migration takes effect as it runs, so if one
-- fails, the ones before it stay in, and its own section header below names where it stopped.

-- ==============================================================================================================
-- 20270219100000_call_summaries.sql
-- ==============================================================================================================

-- A recorded call's AI summary (client, Nov 2026): on "AI summary" under a transcribed call, Claude
-- reads its transcript and writes a short summary, kept with the recording so it's written once.
-- The server writes it with its own key (lib/server/call-summaries.js); it is read with the
-- recording, by whoever may play it.
--
--   summary          { "overview": "…", "points": ["…"], "next_step": "…" | null }
--   summary_at       when it was written
--   summary_model    the Claude model that wrote it
--
-- Safe to run more than once.

alter table public.phone_recordings
  add column if not exists summary       jsonb,
  add column if not exists summary_at    timestamptz,
  add column if not exists summary_model text;

grant update (summary, summary_at, summary_model) on public.phone_recordings to service_role;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270220100000_page_speed.sql
-- ==============================================================================================================

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

-- ==============================================================================================================
-- 20270221100000_document_names.sql
-- ==============================================================================================================

-- Documents keep whose they are (Sean, Nov 2026: "I deleted those lists… can we set it up so the other data
-- will stay there so we know who the files belong to and what project?"). A file kept its lead, project and
-- client only as links, cleared when those are deleted (or hidden from the list when soft-deleted), so the
-- Documents page lost the business, project, agent and client. Now each file keeps their names as well:
--
--   business_name   the lead's business            project_name   its project
--   agent_name      the lead's producer, else the project's agent    client_name   the project's client
--
-- Filled as a file is added (tg_documents_from_lead, as it fills the project and client), and now for the
-- files already kept, from their leads, projects and clients, deleted ones included. The page shows the names
-- as they are now while those are there, these once they are gone, and filters by project and client on them.
--
-- Safe to run more than once.

alter table public.documents
  add column if not exists business_name text,
  add column if not exists project_name  text,
  add column if not exists agent_name    text,
  add column if not exists client_name   text;

create index if not exists documents_project_name on public.documents (project_name) where deleted_at is null;
create index if not exists documents_client_name on public.documents (client_name) where deleted_at is null;

create or replace function public.tg_documents_from_lead()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    select l.project_id, p.company_id into new.project_id, new.company_id
      from public.leads l left join public.projects p on p.id = l.project_id
     where l.id = new.lead_id;
    -- Whose it is, by name, kept with it (Sean, Nov 2026): it stays should the lead, project or client go.
    select l.company_name, p.name, coalesce(nullif(btrim(l.producer_name), ''), p.contact_name), c.name
      into new.business_name, new.project_name, new.agent_name, new.client_name
      from public.leads l
      left join public.projects p on p.id = l.project_id
      left join public.companies c on c.id = p.company_id
     where l.id = new.lead_id;
  elsif new.project_id is not null then
    select p.name, p.contact_name, c.name into new.project_name, new.agent_name, new.client_name
      from public.projects p left join public.companies c on c.id = p.company_id
     where p.id = new.project_id;
  end if;
  if new.client_name is null and new.company_id is not null then
    select c.name into new.client_name from public.companies c where c.id = new.company_id;
  end if;
  -- Whoever is signed in added it; the server's own role keeps what it was given.
  new.uploaded_by := coalesce(public.app_user_id(), new.uploaded_by);
  return new;
end $$;

-- The files already kept: their names from their leads, projects and clients, deleted (hidden) ones too.
-- Only where a name isn't kept yet.
update public.documents d set
  business_name = coalesce(d.business_name, l.company_name),
  project_name  = coalesce(d.project_name, p.name),
  agent_name    = coalesce(d.agent_name, nullif(btrim(l.producer_name), ''), p.contact_name),
  client_name   = coalesce(d.client_name, c.name)
  from public.documents x
  left join public.leads l on l.id = x.lead_id
  left join public.projects p on p.id = coalesce(x.project_id, l.project_id)
  left join public.companies c on c.id = coalesce(x.company_id, p.company_id)
 where d.id = x.id
   and (d.business_name is null or d.project_name is null or d.agent_name is null or d.client_name is null)
   and (l.id is not null or p.id is not null or c.id is not null);

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270222100000_team_for_clients.sql
-- ==============================================================================================================

-- Meet the Team for a client (Sean, Nov 2026: "only show them the team/managers that are assigned to their
-- projects. I don't want clients to see how many callers we have or see the manager names that aren't
-- associated with their projects"). A client's team_directory() is the people assigned to their projects
-- and their Sales Rep, each with what they do on their projects (and "Sales Rep"); no one else. Their
-- team_spotlight() is empty: it names the team's top people, theirs or not. Staff see what they did before.
-- works_with_client() counts their Sales Rep too, so a client can message and thank the people they see.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.team_directory()
 RETURNS TABLE(id bigint, name text, role text, photo_path text, bio text, mine boolean, does text, since date, status text, last_call timestamp with time zone, kudos bigint, birthday_today boolean, gifts_today bigint, leads_month bigint, appts_month bigint, leads_total bigint, appts_total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    select public.app_user_id() as uid, public.app_role() as role, public.business_tz() as tz
  ), day as (
    select (now() at time zone me.tz)::date as today, date_trunc('month', now() at time zone me.tz) as month_start, me.tz from me
  ), staff as (
    select u.* from public.users u, me
     where me.uid is not null and u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
       -- A client sees only their own team (Sean, Nov 2026): those assigned to their projects, and their Sales Rep;
       -- not how many callers there are, nor managers who aren't on their projects.
       and (me.role <> 'client'
            or u.id in (select pa.ae_user_id from public.project_assignments pa
                         where pa.project_id in (select public.client_project_ids()))
            or u.id in (select c.sales_rep_id from public.companies c where c.id = public.app_company_id()))
  ), theirs as (
    select p.id from public.projects p, me where me.role = 'client' and p.id in (select public.client_project_ids())
  ), rep as (
    -- A client's Sales Rep (Sean, Nov 2026): on their team with those on their projects.
    select c.sales_rep_id as uid from public.companies c, me where me.role = 'client' and c.id = public.app_company_id()
  ), kinds as (
    -- What each does: on a client's own projects, for a client (Nov 2026); on any, for staff.
    select pa.ae_user_id as uid, bool_or(t.code = 'DBDV') as dbdv, bool_or(t.code = 'APPT') as appt
      from public.project_assignments pa join public.projects p on p.id = pa.project_id and p.deleted_at is null
      join public.project_types t on t.id = p.project_type_id
      cross join me
     where me.role <> 'client' or p.id in (select id from theirs)
     group by 1
  ), calls as (
    select c.user_id, max(c.call_date) as last_call from public.call_records c, day
     where c.call_date >= (day.today::timestamp at time zone day.tz) group by 1
  ), dev as (
    select e.user_id,
           count(*) filter (where e.kind = 'lead' and e.created_at >= (day.month_start at time zone day.tz)) as leads_month,
           count(*) filter (where e.kind = 'appointment' and e.created_at >= (day.month_start at time zone day.tz)) as appts_month,
           count(*) filter (where e.kind = 'lead') as leads_total,
           count(*) filter (where e.kind = 'appointment') as appts_total
      from public.pay_events e, day, me
     where e.kind in ('lead', 'appointment') and not e.is_chargeback
       and (me.role <> 'client' or e.project_id in (select id from theirs))
       and (me.role = 'client' or e.created_at >= (day.month_start at time zone day.tz))
     group by 1
  ), k as (
    select to_user, count(*) filter (where kind = 'thanks') as thanks,
           count(*) filter (where kind = 'birthday' and created_at >= (day.today::timestamp at time zone day.tz)) as gifts_today
      from public.kudos, day group by 1
  )
  select s.id, nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.role, s.photo_path, s.bio,
         me.role = 'client',
         case when me.role = 'client' then
                -- A client's team: what each does on their projects, and their Sales Rep.
                nullif(concat_ws(' · ',
                  case when kd.dbdv and kd.appt then 'Lead development & appointment setting'
                       when kd.appt then 'Appointment setting' when kd.dbdv then 'Lead development' end,
                  case when s.id in (select uid from rep) then 'Sales Rep' end), '')
              when s.role = 'admin' then 'Administration'
              when kd.dbdv and kd.appt then 'Lead development & appointment setting'
              when kd.appt then 'Appointment setting' when kd.dbdv then 'Lead development' end,
         s.created_at::date,
         case when c.last_call > now() - interval '15 minutes' then 'calling'
              when c.last_call is not null or (s.last_login at time zone day.tz)::date = day.today then 'active'
              else 'away' end,
         c.last_call, coalesce(k.thanks, 0), public.birthday_on(s.birthday, day.today), coalesce(k.gifts_today, 0),
         coalesce(d.leads_month, 0), coalesce(d.appts_month, 0),
         case when me.role = 'client' then coalesce(d.leads_total, 0) end,
         case when me.role = 'client' then coalesce(d.appts_total, 0) end
    from staff s cross join me cross join day
    left join kinds kd on kd.uid = s.id
    left join calls c on c.user_id = s.id
    left join dev d on d.user_id = s.id
    left join k on k.to_user = s.id
   order by 6 desc, 12 desc, s.first_name, s.last_name;
$function$;

CREATE OR REPLACE FUNCTION public.team_spotlight()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with z as (
    select public.business_tz() as tz,
           (date_trunc('week', now() at time zone public.business_tz()))::timestamp at time zone public.business_tz() as since
  ), people as (
    select u.id, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.photo_path
      from public.users u where u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
  ), ev as (
    select e.user_id, count(*) filter (where e.kind = 'appointment') as appts, count(*) filter (where e.kind = 'lead') as leads
      from public.pay_events e, z where e.created_at >= z.since and not e.is_chargeback and e.kind in ('lead', 'appointment')
     group by 1
  ), ca as (
    select c.user_id, count(*) as calls from public.call_records c, z where c.call_date >= z.since group by 1
  ), top as (
    select 'appointments' as what, p.id, p.name, p.photo_path, ev.appts as n from ev join people p on p.id = ev.user_id where ev.appts > 0
    union all
    select 'leads', p.id, p.name, p.photo_path, ev.leads from ev join people p on p.id = ev.user_id where ev.leads > 0
    union all
    select 'calls', p.id, p.name, p.photo_path, ca.calls from ca join people p on p.id = ca.user_id where ca.calls > 0
  ), best as (
    select distinct on (what) what, id, name, photo_path, n from top order by what, n desc, name
  )
  select case when coalesce((select (value->>'spotlight')::boolean from public.app_settings where key = 'team'), true) is false then null
              when public.app_user_id() is null then null
              -- Not for a client (Sean, Nov 2026): it names the team's top people, theirs or not.
              when public.app_role() = 'client' then null
              else coalesce((select jsonb_object_agg(what, jsonb_build_object('id', id, 'name', name, 'photo', photo_path, 'count', n)) from best), '{}'::jsonb) end;
$function$;

CREATE OR REPLACE FUNCTION public.works_with_client(p_user_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.pay_events e where e.user_id = p_user_id and not e.is_chargeback
                    and e.project_id in (select public.client_project_ids()))
      or exists (select 1 from public.project_assignments pa where pa.ae_user_id = p_user_id
                    and pa.project_id in (select public.client_project_ids()))
      -- Their Sales Rep (Nov 2026): on their team, to message and thank.
      or exists (select 1 from public.companies c where c.id = public.app_company_id() and c.sales_rep_id = p_user_id);
$function$;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270223100000_lead_email_replies.sql
-- ==============================================================================================================

-- Email replies on the lead (Sean, Nov 2026: "the reply email is not attaching to this thread"). Each email
-- sent from a lead has a Reply-To address of its own (reply-<reply_token>@ the reply domain); Resend
-- receives the reply and tells Lighthouse (app/api/email/inbound), which keeps it here with the email it
-- answers, tells whoever sent that one, and sends them a copy.
--
--   direction        'out' an email sent from the lead; 'in' a reply to one
--   reply_token      an email sent: the token in its Reply-To address
--   from_address     a reply: who it is from ("Dana Reyes <dana@x.com>")
--   in_reply_to_id   a reply: the email it answers
--   resend_id        a reply: Resend's id for it (each kept once)
--
-- Safe to run more than once.

alter table public.lead_emails
  add column if not exists direction      text not null default 'out',
  add column if not exists reply_token    text,
  add column if not exists from_address   text,
  add column if not exists in_reply_to_id bigint references public.lead_emails(id) on delete set null,
  add column if not exists resend_id      text;

alter table public.lead_emails drop constraint if exists lead_emails_direction_check;
alter table public.lead_emails add constraint lead_emails_direction_check check (direction in ('out', 'in'));
alter table public.lead_emails drop constraint if exists lead_emails_status_check;
alter table public.lead_emails add constraint lead_emails_status_check check (status in ('sent', 'failed', 'received'));
alter table public.lead_emails drop constraint if exists lead_emails_from_address_check;
alter table public.lead_emails add constraint lead_emails_from_address_check check (length(from_address) <= 320);

create unique index if not exists lead_emails_reply_token on public.lead_emails (reply_token) where reply_token is not null;
create unique index if not exists lead_emails_resend_id on public.lead_emails (resend_id) where resend_id is not null;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270224100000_team_spotlight_for_clients.sql
-- ==============================================================================================================

-- Meet the Team's Spotlight for a client, on their own projects (Sean, Nov 2026: "Can it be set to only show
-- the stats for the managers on that specific client? I'd prefer not to show a client totals for a manager
-- across all clients"). For a client, the week's most appointments, leads and calls count only what was done
-- on their projects, by the people on their team (those assigned to their projects, and their Sales Rep);
-- a kind no one has done for them this week says so. Staff see the whole team's week, as before.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.team_spotlight()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with z as (
    select public.business_tz() as tz,
           (date_trunc('week', now() at time zone public.business_tz()))::timestamp at time zone public.business_tz() as since,
           public.app_role() = 'client' as client
  ), theirs as (
    -- A client's projects (none for staff: theirs is everyone's).
    select p.id from public.projects p, z where z.client and p.id in (select public.client_project_ids())
  ), people as (
    select u.id, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.photo_path
      from public.users u, z
     where u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
       -- A client's team only: those assigned to their projects, and their Sales Rep.
       and (not z.client
            or u.id in (select pa.ae_user_id from public.project_assignments pa where pa.project_id in (select id from theirs))
            or u.id in (select c.sales_rep_id from public.companies c where c.id = public.app_company_id()))
  ), ev as (
    select e.user_id, count(*) filter (where e.kind = 'appointment') as appts, count(*) filter (where e.kind = 'lead') as leads
      from public.pay_events e, z
     where e.created_at >= z.since and not e.is_chargeback and e.kind in ('lead', 'appointment')
       and (not z.client or e.project_id in (select id from theirs))
     group by 1
  ), ca as (
    select c.user_id, count(*) as calls from public.call_records c, z
     where c.call_date >= z.since and (not z.client or c.project_id in (select id from theirs))
     group by 1
  ), top as (
    select 'appointments' as what, p.id, p.name, p.photo_path, ev.appts as n from ev join people p on p.id = ev.user_id where ev.appts > 0
    union all
    select 'leads', p.id, p.name, p.photo_path, ev.leads from ev join people p on p.id = ev.user_id where ev.leads > 0
    union all
    select 'calls', p.id, p.name, p.photo_path, ca.calls from ca join people p on p.id = ca.user_id where ca.calls > 0
  ), best as (
    select distinct on (what) what, id, name, photo_path, n from top order by what, n desc, name
  )
  select case when coalesce((select (value->>'spotlight')::boolean from public.app_settings where key = 'team'), true) is false then null
              when public.app_user_id() is null then null
              else coalesce((select jsonb_object_agg(what, jsonb_build_object('id', id, 'name', name, 'photo', photo_path, 'count', n)) from best), '{}'::jsonb) end;
$function$;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270225100000_signature_select.sql
-- ==============================================================================================================

-- Signature Select (Sean, Nov 2026): the fee a client pays for Lighthouse, exclusivity on the leads we call for
-- them and appointment confirmations, one fee for all their projects, monthly or yearly. Kept term by term:
--
--   select_terms   a client's terms: monthly (an amount a month from its start; runs until an end date is put
--                  in, when they stop) or annual (an amount a year, for its start to its end). A renewal or a
--                  new rate is a new term; the earlier ones stay, for what has come in.
--
--   select_access_ended(company)   a client on Signature Select whose last term has ended and that has none
--                  now: its people's access to Lighthouse stops (client_project_ids() gives them nothing; the
--                  app says why). A client never on it is as before.
--   my_select()    a client's own: the term now and when it ends, for their renewal notice.
--   select_charges(from, to, company)   what is charged in a time: each month of a monthly term (on its start
--                  day), each annual term (on its start): the Signature Select report. Administrators.
--   send_select_reminders(day)     the Sales Rep (else the administrators) told two weeks before a term ends,
--                  once, unless a later term follows it already. Daily, with the other alerts.
--
-- Administrators and the client's Sales Rep see and change its terms. Safe to run more than once.

create table if not exists public.select_terms (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references public.companies(id) on delete cascade,
  plan        text not null check (plan in ('monthly', 'annual')),
  amount      numeric(10, 2) not null check (amount > 0 and amount < 1000000),
  starts_on   date not null,
  ends_on     date,
  note        text check (length(note) <= 500),
  reminded_at timestamptz,
  created_by  bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint select_terms_annual_end check (plan = 'monthly' or ends_on is not null),
  constraint select_terms_dates check (ends_on is null or ends_on >= starts_on)
);
create index if not exists select_terms_company on public.select_terms (company_id, starts_on desc);

alter table public.select_terms enable row level security;
drop policy if exists select_terms_rw on public.select_terms;
create policy select_terms_rw on public.select_terms for all to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.companies c where c.id = company_id and c.sales_rep_id = (select public.app_user_id())))
  with check ((select public.is_admin()) or exists (select 1 from public.companies c where c.id = company_id and c.sales_rep_id = (select public.app_user_id())));
grant select, insert, update, delete on public.select_terms to authenticated;

create or replace function public.select_access_ended(p_company bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.select_terms t where t.company_id = p_company)
     and not exists (select 1 from public.select_terms t where t.company_id = p_company
                      and (t.ends_on is null or t.ends_on >= public.business_today()));
$$;
grant execute on function public.select_access_ended(bigint) to authenticated;

-- A client's people see their projects only while their Signature Select is on (or they were never on it).
create or replace function public.client_project_ids()
 returns setof bigint
 language sql stable security definer set search_path = public as $$
  select p.id from public.projects p
  where p.company_id = public.app_company_id() and p.deleted_at is null
    and not public.select_access_ended(p.company_id)
  union
  select pa.project_id from public.project_assignments pa
  where pa.cl_user_id = public.app_user_id()
    and exists (select 1 from public.projects p where p.id = pa.project_id and p.deleted_at is null
                 and not public.select_access_ended(p.company_id));
$$;

create or replace function public.my_select()
returns table (plan text, starts_on date, ends_on date, ended boolean)
language sql stable security definer set search_path = public as $$
  with mine as (select public.app_company_id() as company)
  select t.plan, t.starts_on, t.ends_on, public.select_access_ended(mine.company)
    from mine
    left join lateral (
      -- The term on now, else the last one.
      select * from public.select_terms t where t.company_id = mine.company
       order by (t.starts_on <= public.business_today() and (t.ends_on is null or t.ends_on >= public.business_today())) desc,
                t.starts_on desc limit 1
    ) t on true
   where mine.company is not null and t.plan is not null;
$$;
grant execute on function public.my_select() to authenticated;

create or replace function public.select_charges(p_from date, p_to date, p_company bigint default null)
returns table (term_id bigint, company_id bigint, client text, plan text, charged_on date, amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'The Signature Select report is for administrators' using errcode = '42501';
  end if;
  return query
  select t.id, t.company_id, c.name, t.plan, d.day::date, t.amount
    from public.select_terms t
    join public.companies c on c.id = t.company_id
    cross join lateral (
      select (t.starts_on + make_interval(months => m))::date as day
        from generate_series(0, case when t.plan = 'monthly' then 600 else 0 end) m
    ) d
   where (p_company is null or t.company_id = p_company)
     and d.day between p_from and p_to
     and d.day <= coalesce(t.ends_on, d.day)
     and d.day <= public.business_today()
   order by d.day, c.name;
end $$;
revoke execute on function public.select_charges(date, date, bigint) from public, anon;
grant execute on function public.select_charges(date, date, bigint) to authenticated;

create or replace function public.send_select_reminders(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_to bigint[];
  r record;
begin
  for r in
    select t.id, t.plan, t.amount, t.ends_on, c.id as company_id, c.name as client, c.sales_rep_id
      from public.select_terms t join public.companies c on c.id = t.company_id and c.deleted_at is null
     where t.reminded_at is null and t.ends_on between p_day and p_day + 14
       and not exists (select 1 from public.select_terms n where n.company_id = t.company_id and n.id <> t.id and n.starts_on > t.starts_on)
     for update of t skip locked
  loop
    v_to := case when r.sales_rep_id is not null then array[r.sales_rep_id]
                 else array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null) end;
    perform public.notify_users(
      v_to, 'system',
      left(format('Signature Select ends %s: %s', to_char(r.ends_on, 'FMMon FMDD'), r.client), 160),
      left(format('%s · %s. Their access to Lighthouse stops after %s unless it is renewed.',
        initcap(r.plan), to_char(r.amount, 'FM$999,999,990.00') || case when r.plan = 'monthly' then ' a month' else ' a year' end,
        to_char(r.ends_on, 'FMMonth FMDD, YYYY')), 1000),
      '/payments#select', 'payment_due');
    update public.select_terms set reminded_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.run_daily_alerts()
 returns integer
 language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone public.business_tz();
begin
  if extract(hour from v_now) < 7 then
    return 0;
  end if;
  return public.send_xdate_warnings(v_now::date) + public.send_appointment_reminders(v_now::date)
       + public.send_celebrations(v_now::date)
       + public.bill_project_months(v_now::date) + public.send_payment_reminders(v_now::date)
       + public.send_select_reminders(v_now::date);
end $$;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270226100000_client_login_projects.sql
-- ==============================================================================================================

-- Which of a client's projects each of its logins sees (Sean, Nov 2026: "A client is the parent account that
-- should view all of the projects the client is paying for. An agent are the child accounts for the projects
-- they are assigned to by the client... so an agent should only see the projects the client is buying for
-- them"). A client login is set, on Users, to see:
--
--   all    every project of its client (as before: the parent account)
--   only   only the projects ticked for it (client_user_projects): a producer of the client's
--
-- client_project_ids() follows it, so everything a client login reaches (projects, their names, appointments,
-- documents, reports) does. Administrators set it. Safe to run more than once.

alter table public.users add column if not exists project_scope text not null default 'all';
do $$ begin
  alter table public.users add constraint users_project_scope check (project_scope in ('all', 'only'));
exception when duplicate_object then null; end $$;
-- The users table grants its columns one by one.
grant update (project_scope) on public.users to authenticated;

create table if not exists public.client_user_projects (
  user_id    bigint not null references public.users(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists client_user_projects_project on public.client_user_projects (project_id);
alter table public.client_user_projects enable row level security;
drop policy if exists client_user_projects_admin on public.client_user_projects;
create policy client_user_projects_admin on public.client_user_projects for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists client_user_projects_own on public.client_user_projects;
create policy client_user_projects_own on public.client_user_projects for select to authenticated
  using (user_id = (select public.app_user_id()));
grant select, insert, update, delete on public.client_user_projects to authenticated;

-- Only an administrator changes which projects a login sees (as its role and client account).
CREATE OR REPLACE FUNCTION public.tg_users_guard_protected_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if (new.role, new.status, new.company_id, new.auth_id, new.email, new.user_type_id, new.must_change_password, new.project_scope)
     is distinct from
     (old.role, old.status, old.company_id, old.auth_id, old.email, old.user_type_id, old.must_change_password, old.project_scope) then
    raise exception 'Only an administrator can change a user''s role, status, client account, projects or sign-in identity'
      using errcode = '42501';
  end if;
  return new;
end $function$;

-- A client login's projects: all its client's, or only those ticked for it (of its client's); either way
-- while its Signature Select is on. Projects assigned to it by name (project_assignments) as before.
create or replace function public.client_project_ids()
 returns setof bigint
 language sql stable security definer set search_path = public as $$
  with me as (
    select u.id, coalesce(u.project_scope, 'all') as scope from public.users u where u.id = public.app_user_id()
  )
  select p.id from public.projects p, me
  where me.scope = 'all' and p.company_id = public.app_company_id() and p.deleted_at is null
    and not public.select_access_ended(p.company_id)
  union
  select p.id from public.client_user_projects cup
    join me on me.id = cup.user_id and me.scope = 'only'
    join public.projects p on p.id = cup.project_id
  where p.company_id = public.app_company_id() and p.deleted_at is null
    and not public.select_access_ended(p.company_id)
  union
  select pa.project_id from public.project_assignments pa
  where pa.cl_user_id = public.app_user_id()
    and exists (select 1 from public.projects p where p.id = pa.project_id and p.deleted_at is null
                 and not public.select_access_ended(p.company_id));
$$;

-- What a client login sees beyond its projects (its client's own records: goals, removal requests): only a
-- login that sees all its client's projects.
create or replace function public.client_sees_all()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.project_scope = 'all' from public.users u where u.id = public.app_user_id()), true);
$$;
grant execute on function public.client_sees_all() to authenticated;

-- Appointment updates, documents and removal requests: a login kept to some projects sees those projects' only.
drop policy if exists appointment_updates_read on public.appointment_updates;
create policy appointment_updates_read on public.appointment_updates for select to authenticated
  using ((select public.is_staff())
         or (company_id = (select public.app_company_id()) and ((select public.client_sees_all()) or project_id in (select public.client_project_ids()))));
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using ((select public.is_staff())
         or (company_id = (select public.app_company_id()) and (select public.client_sees_all()))
         or project_id in (select public.client_project_ids()));
drop policy if exists client_removals_read on public.client_removals;
create policy client_removals_read on public.client_removals for select
  using ((select public.is_staff())
         or (company_id = (select public.app_company_id())
             and ((select public.client_sees_all())
                  or exists (select 1 from public.leads l where l.id = lead_id and l.project_id in (select public.client_project_ids())))));

create or replace function public.lead_client_updates(p_lead_id bigint)
 RETURNS TABLE(id bigint, appointment_id bigint, status text, previous_status text, note text, potential_premium numeric, sold_lines jsonb, total_premium numeric, created_at timestamp with time zone, by_name text, by_client boolean, appt_date date, appt_time text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x.id, x.appointment_id, x.status, x.previous_status, x.note, x.potential_premium, x.sold_lines, x.total_premium, x.created_at,
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.role = 'client', a.appt_date, a.appt_time
    from public.appointment_updates x
    left join public.users u on u.id = x.created_by
    left join public.appointments a on a.id = x.appointment_id
   where x.lead_id = p_lead_id
     and public.app_user_id() is not null
     and (public.is_staff()
          or (x.company_id = public.app_company_id() and (public.client_sees_all() or x.project_id in (select public.client_project_ids()))))
   order by x.created_at desc, x.id desc
   limit 300;
$function$;

-- Taking names off: a client login, only names on the projects it sees.
CREATE OR REPLACE FUNCTION public.mark_names(p_ids bigint[], p_reason text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- A client login: its client's names, on the projects it sees (Nov 2026: a login kept to some projects).
    if v_role = 'client' and (l.company_id is distinct from v_company or l.project_id not in (select public.client_project_ids())) then
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
end $function$;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270227100000_old_result_names.sql
-- ==============================================================================================================

-- The old system's call results, as Sean's test import showed them (Nov 2026):
--
--   "Call 0" … "Call 9"   a name called that many times with no contact: Viable-No Contact (now Viable-CallBack)
--                         on a DB Dev list; "XD-Call 0" … "XD-Call 9", Lead-No Contact on an appointment list.
--   "X-Date-Lead"         a lead: Lead-Hot Lead, as "X-Date Hot Lead" ("should be importing as Lead-Hot Lead").
--
-- Each old name belongs to one result of its kind of list: taken off any other first. Results are found by
-- their name or the old names they already answer to, so one renamed in Settings is still found.
-- Safe to run more than once.

do $$
declare
  v_calls text[] := array(select 'call ' || i from generate_series(0, 9) i)
                 || array(select 'call' || i from generate_series(0, 9) i)
                 || array(select 'call-' || i from generate_series(0, 9) i);
  v_xd_calls text[] := array(select 'xd-call ' || i from generate_series(0, 9) i)
                    || array(select 'xd call ' || i from generate_series(0, 9) i)
                    || array(select 'xd-call' || i from generate_series(0, 9) i);
  v_lead text[] := array['x-date-lead', 'x-date lead', 'xdate lead', 'xdate-lead'];
  v_target bigint;
begin
  -- DB Dev: Call 0–9.
  select id into v_target from public.call_results
   where project_type = 'DBDV' and (name in ('Viable-CallBack', 'Viable-No Contact') or 'viable-no contact' = any (aliases))
   order by (name = 'Viable-CallBack') desc limit 1;
  if v_target is not null then
    update public.call_results set aliases = array(select a from unnest(aliases) a where a <> all (v_calls))
     where project_type = 'DBDV' and id <> v_target and aliases && v_calls;
    update public.call_results set aliases = array(select distinct a from unnest(aliases || v_calls) a order by a) where id = v_target;
  end if;

  -- Appointment lists: XD-Call 0–9.
  select id into v_target from public.call_results
   where project_type = 'APPT' and (name = 'Lead-No Contact' or 'lead no contact' = any (aliases))
   order by (name = 'Lead-No Contact') desc limit 1;
  if v_target is not null then
    update public.call_results set aliases = array(select a from unnest(aliases) a where a <> all (v_xd_calls))
     where project_type = 'APPT' and id <> v_target and aliases && v_xd_calls;
    update public.call_results set aliases = array(select distinct a from unnest(aliases || v_xd_calls) a order by a) where id = v_target;
  end if;

  -- DB Dev: X-Date-Lead is a Lead-Hot Lead.
  select id into v_target from public.call_results
   where project_type = 'DBDV' and (name = 'Lead-Hot Lead' or 'x-date hot lead' = any (aliases))
   order by (name = 'Lead-Hot Lead') desc limit 1;
  if v_target is not null then
    update public.call_results set aliases = array(select a from unnest(aliases) a where a <> all (v_lead))
     where project_type = 'DBDV' and id <> v_target and aliases && v_lead;
    update public.call_results set aliases = array(select distinct a from unnest(aliases || v_lead) a order by a) where id = v_target;
  end if;
end $$;

-- ==============================================================================================================
-- 20270228100000_dashboard_conversion.sql
-- ==============================================================================================================

-- The administrator's dashboard tiles (Sean, Nov 2026):
--
--   A Sales Rep to show: the Leads and Appointments tiles count what the managers developed on that rep's
--   clients' projects (production_hours gains p_rep, for a day by the hour), and Active Clients counts their
--   clients (rep_client_stats).
--
--   Conversion by renewal month (renewal_conversion): "how many appts did we set vs leads that have/had a Jan
--   renewal month … this year vs last year … all or by sales rep clients". For a renewal month M of a year Y:
--     leads         the leads on appointment projects whose renewal month is M (their Ultimate X-date, else
--                   their soonest line's), developed before M/Y was out, and not closed out before its calling
--                   window began (still in the pipeline for that renewal);
--     appointments  those of them with an appointment set in its calling window: the four months before M/Y
--                   and M/Y itself (as the Match Tool's "renew in the next four months").
--   By renewal month, not the date itself: renewal dates are moved on a year as they come round.
--
-- Administrators only. Safe to run more than once.

drop function if exists public.production_hours(date, bigint);
create or replace function public.production_hours(p_day date, p_user bigint default null, p_rep bigint default null)
 returns table(hour integer, leads bigint, appointments bigint)
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
  v_rep  bigint := case when public.is_admin() then p_rep else null end;
begin
  if p_day is null then
    raise exception 'Choose a day' using errcode = '22023';
  end if;
  return query
  select extract(hour from pe.created_at at time zone v_tz)::integer,
         count(*) filter (where pe.kind = 'lead'),
         count(*) filter (where pe.kind = 'appointment')
    from public.pay_events pe
   where pe.created_at >= (p_day::timestamp at time zone v_tz)
     and pe.created_at <  ((p_day + 1)::timestamp at time zone v_tz)
     and pe.user_id is not null and not pe.is_chargeback
     and pe.kind in ('lead', 'appointment')
     and (v_user is null or pe.user_id = v_user)
     -- A Sales Rep's clients' projects (Nov 2026).
     and (v_rep is null or pe.project_id in (select p.id from public.projects p join public.companies c on c.id = p.company_id where c.sales_rep_id = v_rep))
   group by 1
   order by 1;
end $function$;
grant execute on function public.production_hours(date, bigint, bigint) to authenticated;

-- A Sales Rep's clients for the Active Clients tile: how many are active, and each of their projects' leads.
create or replace function public.rep_client_stats(p_rep bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_clients', (select count(*) from public.companies c where c.status = 'active' and c.deleted_at is null and c.sales_rep_id = p_rep),
    'project_leads', (select coalesce(jsonb_agg(n order by pid), '[]'::jsonb) from (
        select p.id as pid, (select count(*) from public.leads l where l.project_id = p.id and l.deleted_at is null) as n
          from public.projects p join public.companies c on c.id = p.company_id
         where c.sales_rep_id = p_rep and p.deleted_at is null and c.deleted_at is null) x));
end $$;
grant execute on function public.rep_client_stats(bigint) to authenticated;

create or replace function public.renewal_conversion(p_year integer, p_rep bigint default null)
returns table(year integer, month integer, leads bigint, appointments bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Choose a year' using errcode = '22023';
  end if;
  return query
  with cohorts as (
    -- Each renewal month of the year chosen and the year before, with its calling window.
    select y::int as year, m::int as month,
           (make_date(y::int, m::int, 1) - interval '4 months')::date as opens,
           (make_date(y::int, m::int, 1) + interval '1 month')::date as closes
      from generate_series(p_year - 1, p_year) y, generate_series(1, 12) m
  ), pipeline as (
    -- The leads on appointment projects (a Sales Rep's clients' only, when one is chosen), each with its renewal month.
    select l.id, coalesce(l.promoted_at, l.created_at) as developed, l.resolved_at,
           extract(month from r.renewal)::int as month
      from public.leads l
      join public.projects p on p.id = l.project_id and p.deleted_at is null
      join public.project_types t on t.id = p.project_type_id and t.code = 'APPT'
      left join public.companies c on c.id = p.company_id
      cross join lateral (
        select min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                     i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
          from public.insurance_details i where i.lead_id = l.id
      ) r
     where l.deleted_at is null and l.stage = 'appt' and r.renewal is not null
       and (p_rep is null or c.sales_rep_id = p_rep)
  ), set_on as (
    -- When each of those leads had an appointment set (not one found invalid).
    select a.lead_id, a.appt_create_date as at
      from public.appointments a
     where a.deleted_at is null and a.invalid_at is null and a.lead_id in (select id from pipeline)
  )
  select k.year, k.month,
         count(pl.id)::bigint,
         count(pl.id) filter (where exists (
           select 1 from set_on s where s.lead_id = pl.id and s.at >= k.opens and s.at < k.closes))::bigint
    from cohorts k
    left join pipeline pl on pl.month = k.month
                         and pl.developed < k.closes
                         and (pl.resolved_at is null or pl.resolved_at >= k.opens)
   group by k.year, k.month
   order by k.year, k.month;
end $$;
revoke execute on function public.renewal_conversion(integer, bigint) from public, anon;
grant execute on function public.renewal_conversion(integer, bigint) to authenticated;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270301100000_campaign_types.sql
-- ==============================================================================================================

-- Campaign Types (Sean, Nov 2026): a lead sheet's layout for an industry other than insurance (IT/MSPs first, and
-- Signature's own calls to agents). An administrator builds one in Settings from the insurance fields (each
-- renamed or turned off: the tabs, the Business details, the key date, the policy lines) and fields of their own;
-- a client is given one, and its leads show that layout, to staff and to the client. A client with none: Insurance,
-- as before. Call results, appointments and everything else stay as they are.
--
--   campaign_types            name, fields: { builtin: { <key>: { label, hidden } }, custom: [{ id, label, type, options }] }
--   companies.campaign_type_id   the client's (none: Insurance)
--   leads.custom              the answers to a campaign type's own fields, by field id
--
-- Everyone signed in reads the types (a client's lead sheet is laid out by its own); administrators change them.
-- Safe to run more than once.

create table if not exists public.campaign_types (
  id         bigint generated always as identity primary key,
  name       text not null check (length(btrim(name)) between 1 and 60),
  fields     jsonb not null default '{}'::jsonb,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists campaign_types_name on public.campaign_types (lower(btrim(name)));

alter table public.campaign_types enable row level security;
drop policy if exists campaign_types_read on public.campaign_types;
create policy campaign_types_read on public.campaign_types for select to authenticated using (true);
drop policy if exists campaign_types_admin on public.campaign_types;
create policy campaign_types_admin on public.campaign_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.campaign_types to authenticated;

alter table public.companies add column if not exists campaign_type_id bigint references public.campaign_types(id) on delete set null;
alter table public.leads add column if not exists custom jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270302100000_campaign_project_info.sql
-- ==============================================================================================================

-- Campaign Types, phase 2 (Sean, Nov 2026): a campaign type's own Project Info questions, answered per project.
-- (Its renamed and turned-off parts live on the type itself, campaign_types.fields.) Safe to run more than once.

alter table public.project_profiles add column if not exists custom jsonb not null default '{}'::jsonb;

-- The server's own role reads the campaign types too: a lead sheet emailed to the client, and Project Info saved
-- (from the app or the client's link), are laid out by them.
grant select, insert, update, delete on public.campaign_types to service_role;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270303100000_best_times.sql
-- ==============================================================================================================

-- Best Times to Call (Sean and Darcy, Nov 2026): when calls turn into leads and appointments, by day of the week and
-- hour of the day in the business's own local time (9 AM is 9 AM where the business is), from the calls already
-- recorded. Filtered by days, client, project, manager, industry (SIC, a code or its first digits) and state; and
-- broken down by industry, state, project type or manager.
--
--   us_state_tz(state)   a US state's time zone (the one most of it keeps)
--   best_times(...)      calls, leads and appointments by (breakdown,) day (1 Monday … 7 Sunday) and hour.
--
-- A call counts as a lead when its result makes the name one (effect 'promote'), an appointment when it sets one
-- (effect 'appointment'). Where the business is: its lead's state, else its project's time zone, else the
-- business's own. Administrators only. Safe to run more than once.

create or replace function public.us_state_tz(p_state text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select case upper(btrim(coalesce(p_state, '')))
    when 'AZ' then 'America/Phoenix'
    when 'HI' then 'Pacific/Honolulu'
    when 'AK' then 'America/Anchorage'
    when 'PR' then 'America/Puerto_Rico'
    else case
      when upper(btrim(coalesce(p_state, ''))) in ('CA', 'NV', 'OR', 'WA') then 'America/Los_Angeles'
      when upper(btrim(coalesce(p_state, ''))) in ('CO', 'ID', 'MT', 'NM', 'UT', 'WY') then 'America/Denver'
      when upper(btrim(coalesce(p_state, ''))) in ('AL', 'AR', 'IL', 'IA', 'KS', 'LA', 'MN', 'MS', 'MO', 'NE', 'ND', 'OK', 'SD', 'TN', 'TX', 'WI') then 'America/Chicago'
      when upper(btrim(coalesce(p_state, ''))) in ('CT', 'DE', 'DC', 'FL', 'GA', 'IN', 'KY', 'ME', 'MD', 'MA', 'MI', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'VT', 'VA', 'WV') then 'America/New_York'
    end
  end;
$$;
grant execute on function public.us_state_tz(text) to authenticated;

create or replace function public.best_times(
  p_from date, p_to date,
  p_company bigint default null, p_project bigint default null, p_user bigint default null,
  p_sic text default null, p_state text default null, p_by text default null
)
returns table(dim text, dim_label text, dow integer, hour integer, calls bigint, leads bigint, appts bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_tz text := public.business_tz();
begin
  if not public.is_admin() then
    raise exception 'Best Times to Call is for administrators' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.call_date, cr.user_id, l.state, l.sic_code, t.code as type_code, cres.effect,
           coalesce(public.us_state_tz(l.state), z.iana, v_tz) as tz
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.project_types t on t.id = p.project_type_id
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
  ), local as (
    select case p_by
             when 'sic' then coalesce(nullif(left(replace(c.sic_code, '-', ''), 4), ''), '—')
             when 'state' then coalesce(nullif(upper(c.state), ''), '—')
             when 'type' then coalesce(c.type_code, '—')
             when 'manager' then coalesce(c.user_id::text, '—')
             else null end as dim,
           extract(isodow from c.call_date at time zone c.tz)::integer as dow,
           extract(hour from c.call_date at time zone c.tz)::integer as hour,
           c.effect
      from c
  )
  select x.dim,
         case p_by
           when 'sic' then (select s.description from public.sic_codes s where s.code = x.dim limit 1)
           when 'manager' then (select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') from public.users u where u.id::text = x.dim)
           when 'type' then case x.dim when 'APPT' then 'Appointment projects' when 'DBDV' then 'DB Dev projects' else x.dim end
           else x.dim end,
         x.dow, x.hour, count(*)::bigint,
         count(*) filter (where x.effect = 'promote')::bigint,
         count(*) filter (where x.effect = 'appointment')::bigint
    from local x
   group by x.dim, x.dow, x.hour
   order by x.dim nulls first, x.dow, x.hour;
end $$;
revoke execute on function public.best_times(date, date, bigint, bigint, bigint, text, text, text) from public, anon;
grant execute on function public.best_times(date, date, bigint, bigint, bigint, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270304100000_heat_map_managers.sql
-- ==============================================================================================================

-- Best Times to Call is now the Production Heat Map (Sean, Nov 2026: "Can we name it Production Heat Map? … great for
-- Managers to have too (for the projects they are assigned to)"). best_times() as before for an administrator; a
-- manager gets the calls on the projects they're assigned to, every manager's calls on them. Safe to run more than once.

create or replace function public.best_times(
  p_from date, p_to date,
  p_company bigint default null, p_project bigint default null, p_user bigint default null,
  p_sic text default null, p_state text default null, p_by text default null
)
returns table(dim text, dim_label text, dow integer, hour integer, calls bigint, leads bigint, appts bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_tz text := public.business_tz();
  -- A manager: the projects they're assigned to (an administrator: every project).
  v_mine bigint := case when public.is_admin() then null else public.app_user_id() end;
begin
  if not public.is_admin() and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'The Production Heat Map is for administrators and managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.call_date, cr.user_id, l.state, l.sic_code, t.code as type_code, cres.effect,
           coalesce(public.us_state_tz(l.state), z.iana, v_tz) as tz
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.project_types t on t.id = p.project_type_id
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
       and (v_mine is null or p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_mine))
  ), local as (
    select case p_by
             when 'sic' then coalesce(nullif(left(replace(c.sic_code, '-', ''), 4), ''), '—')
             when 'state' then coalesce(nullif(upper(c.state), ''), '—')
             when 'type' then coalesce(c.type_code, '—')
             when 'manager' then coalesce(c.user_id::text, '—')
             else null end as dim,
           extract(isodow from c.call_date at time zone c.tz)::integer as dow,
           extract(hour from c.call_date at time zone c.tz)::integer as hour,
           c.effect
      from c
  )
  select x.dim,
         case p_by
           when 'sic' then (select s.description from public.sic_codes s where s.code = x.dim limit 1)
           when 'manager' then (select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') from public.users u where u.id::text = x.dim)
           when 'type' then case x.dim when 'APPT' then 'Appointment projects' when 'DBDV' then 'DB Dev projects' else x.dim end
           else x.dim end,
         x.dow, x.hour, count(*)::bigint,
         count(*) filter (where x.effect = 'promote')::bigint,
         count(*) filter (where x.effect = 'appointment')::bigint
    from local x
   group by x.dim, x.dow, x.hour
   order by x.dim nulls first, x.dow, x.hour;
end $$;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270305100000_early_starts.sql
-- ==============================================================================================================

-- Early Starts (Sean and Darcy, Nov 2026: "their average first-call time in the business's local time, how many calls
-- they make before 9 AM local and how those turn out, and how long from their first call to their first lead. That's
-- the 'paying an hour for no results' piece"). On the Production Heat Map, by manager, with its filters.
--
--   early_starts(...)   for each manager over the days: the days they called; their first call's average time in the
--                       business's local time; their calls before 9 AM local and after, each with the leads and
--                       appointments they made; and, on the days they made a lead, the average minutes from their
--                       first call to their first lead.
--
-- A day is the business's (Lighthouse's) day; a call's hour is its business's local time (its lead's state, else its
-- project's time zone, else Lighthouse's). Administrators: every manager; a manager: their own, on the projects
-- they're assigned to. Safe to run more than once.

create or replace function public.early_starts(
  p_from date, p_to date,
  p_company bigint default null, p_project bigint default null, p_user bigint default null,
  p_sic text default null, p_state text default null
)
returns table(user_id bigint, name text, days bigint, avg_first_minute numeric,
              early_calls bigint, early_leads bigint, early_appts bigint,
              later_calls bigint, later_leads bigint, later_appts bigint,
              lead_days bigint, avg_minutes_to_lead numeric)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_tz text := public.business_tz();
  v_admin boolean := public.is_admin();
  v_me bigint := public.app_user_id();
begin
  if not v_admin and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'Early Starts is for administrators and managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.user_id as uid, cr.call_date,
           (cr.call_date at time zone v_tz)::date as day,
           cr.call_date at time zone coalesce(public.us_state_tz(l.state), z.iana, v_tz) as local_at,
           cres.effect
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.user_id is not null
       and cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
       -- A manager: their own calls, on the projects they're assigned to.
       and (v_admin or (cr.user_id = v_me and p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_me)))
  ), daily as (
    -- Each manager's day: their first call (and its local time), and their first lead.
    select c.uid, c.day,
           min(c.call_date) as first_call,
           (array_agg(c.local_at order by c.call_date))[1] as first_local,
           min(c.call_date) filter (where c.effect = 'promote') as first_lead
      from c group by c.uid, c.day
  ), per as (
    select d.uid,
           count(*) as days,
           avg(extract(hour from d.first_local) * 60 + extract(minute from d.first_local)) as avg_first_minute,
           count(d.first_lead) as lead_days,
           avg(extract(epoch from (d.first_lead - d.first_call)) / 60) filter (where d.first_lead is not null) as avg_minutes_to_lead
      from daily d group by d.uid
  ), split as (
    select c.uid,
           count(*) filter (where extract(hour from c.local_at) < 9) as early_calls,
           count(*) filter (where extract(hour from c.local_at) < 9 and c.effect = 'promote') as early_leads,
           count(*) filter (where extract(hour from c.local_at) < 9 and c.effect = 'appointment') as early_appts,
           count(*) filter (where extract(hour from c.local_at) >= 9) as later_calls,
           count(*) filter (where extract(hour from c.local_at) >= 9 and c.effect = 'promote') as later_leads,
           count(*) filter (where extract(hour from c.local_at) >= 9 and c.effect = 'appointment') as later_appts
      from c group by c.uid
  )
  select p.uid, coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email),
         p.days, round(p.avg_first_minute, 1),
         s.early_calls, s.early_leads, s.early_appts, s.later_calls, s.later_leads, s.later_appts,
         p.lead_days, round(p.avg_minutes_to_lead, 1)
    from per p
    join split s on s.uid = p.uid
    join public.users u on u.id = p.uid
   order by p.avg_first_minute nulls last;
end $$;
revoke execute on function public.early_starts(date, date, bigint, bigint, bigint, text, text) from public, anon;
grant execute on function public.early_starts(date, date, bigint, bigint, bigint, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270306100000_dashboard_layouts.sql
-- ==============================================================================================================

-- A customizable dashboard (Sean, Nov 2026: "Is it possible to make the dashboard customizable … so each person can
-- set it up how they like?"). Each person's layout of their dashboard (its sections' order, which are hidden or
-- collapsed, and where each sits: full width, left or right), and an administrator's default for each kind of
-- dashboard (user_id null), which a person's own starts from.
--
--   kind: 'admin', 'manager', 'client', 'agent' (whose dashboard it is: an administrator's, an account manager's…).
--   layout: { order: [section…], hidden: [section…], collapsed: [section…], place: { section: 'full'|'left'|'right' } }.
--
-- A person reads and keeps their own; everyone reads the defaults; administrators set the defaults (and read anyone's,
-- to see a manager's dashboard as they do). Safe to run more than once.

create table if not exists public.dashboard_layouts (
  id bigint generated always as identity primary key,
  user_id bigint references public.users(id) on delete cascade,
  kind text not null check (kind in ('admin', 'manager', 'client', 'agent')),
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_layouts_one unique nulls not distinct (user_id, kind)
);

alter table public.dashboard_layouts enable row level security;
drop policy if exists dashboard_layouts_read on public.dashboard_layouts;
create policy dashboard_layouts_read on public.dashboard_layouts for select to authenticated
  using (user_id is null or user_id = public.app_user_id() or public.is_admin());
drop policy if exists dashboard_layouts_write on public.dashboard_layouts;
create policy dashboard_layouts_write on public.dashboard_layouts for all to authenticated
  using ((user_id is not null and user_id = public.app_user_id()) or (user_id is null and public.is_admin()))
  with check ((user_id is not null and user_id = public.app_user_id()) or (user_id is null and public.is_admin()));
grant select, insert, update, delete on public.dashboard_layouts to authenticated;
grant all on public.dashboard_layouts to service_role;

notify pgrst, 'reload schema';

-- ==============================================================================================================
-- 20270307100000_campaign_report_filter.sql
-- ==============================================================================================================

-- Campaign Types phase 4 (Sean, Nov 2026: "dashboards/reports get a campaign-type filter, default Insurance, so IT
-- stats stay separate"). The campaign type a page is showing comes with each request as the X-Campaign-Type header
-- ('insurance', a campaign type's id, or 'all'), and the figures below count only its clients' projects:
--
--   campaign_companies()   the clients of the campaign type chosen (Insurance: those without one), or null for all
--                          (no header: every caller as before).
--
-- The administrator's dashboard (its tiles' hours, Active Clients, Conversion, the production chart) and the
-- Production Heat Map (with Early Starts) read it; the rest filter by client in the app. Each function as installed,
-- with that one condition more. rep_client_stats() takes no Sales Rep too (every client). Safe to run more than once.

create or replace function public.campaign_companies()
returns bigint[] language plpgsql stable security definer set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-campaign-type'), '');
begin
  if v is null or v = 'all' then return null; end if;
  -- Insurance: the clients without a campaign type (0 for a project without a client).
  if v = 'insurance' then
    return array(select c.id from public.companies c where c.campaign_type_id is null) || array[0::bigint];
  end if;
  if v ~ '^[1-9][0-9]{0,17}$' then
    return array(select c.id from public.companies c where c.campaign_type_id = v::bigint);
  end if;
  return null;
end $$;
revoke execute on function public.campaign_companies() from public, anon;
grant execute on function public.campaign_companies() to authenticated, service_role;

-- production_hours
CREATE OR REPLACE FUNCTION public.production_hours(p_day date, p_user bigint DEFAULT NULL::bigint, p_rep bigint DEFAULT NULL::bigint)
 RETURNS TABLE(hour integer, leads bigint, appointments bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
  v_rep  bigint := case when public.is_admin() then p_rep else null end;
  v_cos  bigint[] := public.campaign_companies();
begin
  if p_day is null then
    raise exception 'Choose a day' using errcode = '22023';
  end if;
  return query
  select extract(hour from pe.created_at at time zone v_tz)::integer,
         count(*) filter (where pe.kind = 'lead'),
         count(*) filter (where pe.kind = 'appointment')
    from public.pay_events pe
   where pe.created_at >= (p_day::timestamp at time zone v_tz)
     and pe.created_at <  ((p_day + 1)::timestamp at time zone v_tz)
     and pe.user_id is not null and not pe.is_chargeback
     and pe.kind in ('lead', 'appointment')
     and (v_user is null or pe.user_id = v_user)
     -- A Sales Rep's clients' projects (Nov 2026).
     -- The campaign type chosen (Nov 2026).
     and (v_cos is null or pe.project_id in (select p.id from public.projects p where coalesce(p.company_id, 0) = any(v_cos)))
     and (v_rep is null or pe.project_id in (select p.id from public.projects p join public.companies c on c.id = p.company_id where c.sales_rep_id = v_rep))
   group by 1
   order by 1;
end $function$;

-- rep_client_stats
CREATE OR REPLACE FUNCTION public.rep_client_stats(p_rep bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cos bigint[] := public.campaign_companies();
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_clients', (select count(*) from public.companies c where c.status = 'active' and c.deleted_at is null
        and (p_rep is null or c.sales_rep_id = p_rep) and (v_cos is null or c.id = any(v_cos))),
    'project_leads', (select coalesce(jsonb_agg(n order by pid), '[]'::jsonb) from (
        select p.id as pid, (select count(*) from public.leads l where l.project_id = p.id and l.deleted_at is null) as n
          from public.projects p join public.companies c on c.id = p.company_id
         where (p_rep is null or c.sales_rep_id = p_rep) and (v_cos is null or c.id = any(v_cos))
           and p.deleted_at is null and c.deleted_at is null) x));
end $function$;

-- renewal_conversion
CREATE OR REPLACE FUNCTION public.renewal_conversion(p_year integer, p_rep bigint DEFAULT NULL::bigint)
 RETURNS TABLE(year integer, month integer, leads bigint, appointments bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
declare
  v_cos bigint[] := public.campaign_companies();
begin
  if not public.is_admin() then
    raise exception 'For administrators' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Choose a year' using errcode = '22023';
  end if;
  return query
  with cohorts as (
    -- Each renewal month of the year chosen and the year before, with its calling window.
    select y::int as year, m::int as month,
           (make_date(y::int, m::int, 1) - interval '4 months')::date as opens,
           (make_date(y::int, m::int, 1) + interval '1 month')::date as closes
      from generate_series(p_year - 1, p_year) y, generate_series(1, 12) m
  ), pipeline as (
    -- The leads on appointment projects (a Sales Rep's clients' only, when one is chosen), each with its renewal month.
    select l.id, coalesce(l.promoted_at, l.created_at) as developed, l.resolved_at,
           extract(month from r.renewal)::int as month
      from public.leads l
      join public.projects p on p.id = l.project_id and p.deleted_at is null
      join public.project_types t on t.id = p.project_type_id and t.code = 'APPT'
      left join public.companies c on c.id = p.company_id
      cross join lateral (
        select min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                     i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
          from public.insurance_details i where i.lead_id = l.id
      ) r
     where l.deleted_at is null and l.stage = 'appt' and r.renewal is not null
       and (p_rep is null or c.sales_rep_id = p_rep)
       and (v_cos is null or coalesce(p.company_id, 0) = any(v_cos))
  ), set_on as (
    -- When each of those leads had an appointment set (not one found invalid).
    select a.lead_id, a.appt_create_date as at
      from public.appointments a
     where a.deleted_at is null and a.invalid_at is null and a.lead_id in (select id from pipeline)
  )
  select k.year, k.month,
         count(pl.id)::bigint,
         count(pl.id) filter (where exists (
           select 1 from set_on s where s.lead_id = pl.id and s.at >= k.opens and s.at < k.closes))::bigint
    from cohorts k
    left join pipeline pl on pl.month = k.month
                         and pl.developed < k.closes
                         and (pl.resolved_at is null or pl.resolved_at >= k.opens)
   group by k.year, k.month
   order by k.year, k.month;
end $function$;

-- production_chart
CREATE OR REPLACE FUNCTION public.production_chart(p_from date, p_to date, p_user bigint DEFAULT NULL::bigint, p_project bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_tz  text := public.business_tz();
  v_lo  timestamptz;
  v_hi  timestamptz;
  v     jsonb;
  v_cos bigint[] := public.campaign_companies();
begin
  if not public.is_admin() then
    raise exception 'Only an administrator sees the team''s production' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then
    raise exception 'Choose up to two years' using errcode = '22023';
  end if;
  v_lo := p_from::timestamp at time zone v_tz;
  v_hi := (p_to + 1)::timestamp at time zone v_tz;

  with ev as (
    select (pe.created_at at time zone v_tz)::date as d, extract(hour from pe.created_at at time zone v_tz)::int as h, pe.kind
      from public.pay_events pe
     where pe.kind in ('lead', 'appointment') and not pe.is_chargeback
       and pe.created_at >= v_lo and pe.created_at < v_hi
       and (p_user is null or pe.user_id = p_user)
       and (p_project is null or pe.project_id = p_project)
       and (v_cos is null or pe.project_id in (select p.id from public.projects p where coalesce(p.company_id, 0) = any(v_cos)))
  ), wm as (
    select w.user_id, w.day, sum(w.minutes)::numeric as m
      from public.work_minutes(p_from, p_to, p_user) w
     group by 1, 2
  ), calls as (
    select c.user_id, (c.call_date at time zone v_tz)::date as d, c.project_id, count(*)::numeric as n
      from public.call_records c
     where c.call_date >= v_lo and c.call_date < v_hi and c.project_id is not null
       and (p_user is null or c.user_id = p_user)
     group by 1, 2, 3
  ), kinds as (
    select p.id, t.code from public.projects p join public.project_types t on t.id = p.project_type_id
  ), share as (
    -- Each person-day's minutes, over the projects called that day by their calls…
    select wm.day, c.project_id, wm.m * c.n / sum(c.n) over (partition by wm.user_id, wm.day) as mins
      from wm join calls c on c.user_id = wm.user_id and c.d = wm.day
    union all
    -- …or, with no calls that day, over the projects they are assigned to.
    select wm.day, pa.project_id, wm.m / count(*) over (partition by wm.user_id, wm.day)
      from wm join public.project_assignments pa on pa.ae_user_id = wm.user_id
     where not exists (select 1 from calls c where c.user_id = wm.user_id and c.d = wm.day)
  ), worked as (
    select s.day,
           sum(s.mins) filter (where k.code = 'DBDV') as lead_minutes,
           sum(s.mins) filter (where k.code = 'APPT') as appt_minutes
      from share s join kinds k on k.id = s.project_id
     where (p_project is null or s.project_id = p_project)
       and (v_cos is null or s.project_id in (select p.id from public.projects p where coalesce(p.company_id, 0) = any(v_cos)))
     group by 1
  ), days as (
    select d from ev union select day from worked
  )
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', x.d,
               'leads', (select count(*) from ev where ev.d = x.d and ev.kind = 'lead'),
               'appts', (select count(*) from ev where ev.d = x.d and ev.kind = 'appointment'),
               'lead_minutes', round(coalesce(w.lead_minutes, 0)),
               'appt_minutes', round(coalesce(w.appt_minutes, 0))) order by x.d)
        from days x left join worked w on w.day = x.d), '[]'::jsonb),
    'hours', case when p_from = p_to then coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'leads', l, 'appts', a) order by h)
        from (select h, count(*) filter (where kind = 'lead') as l, count(*) filter (where kind = 'appointment') as a
                from ev group by h) q), '[]'::jsonb) end)
  into v;
  return v;
end $function$;

-- best_times
CREATE OR REPLACE FUNCTION public.best_times(p_from date, p_to date, p_company bigint DEFAULT NULL::bigint, p_project bigint DEFAULT NULL::bigint, p_user bigint DEFAULT NULL::bigint, p_sic text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_by text DEFAULT NULL::text)
 RETURNS TABLE(dim text, dim_label text, dow integer, hour integer, calls bigint, leads bigint, appts bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
declare
  v_tz text := public.business_tz();
  v_cos bigint[] := public.campaign_companies();
  -- A manager: the projects they're assigned to (an administrator: every project).
  v_mine bigint := case when public.is_admin() then null else public.app_user_id() end;
begin
  if not public.is_admin() and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'The Production Heat Map is for administrators and managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.call_date, cr.user_id, l.state, l.sic_code, t.code as type_code, cres.effect,
           coalesce(public.us_state_tz(l.state), z.iana, v_tz) as tz
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.project_types t on t.id = p.project_type_id
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
       and (v_cos is null or coalesce(p.company_id, 0) = any(v_cos))
       and (v_mine is null or p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_mine))
  ), local as (
    select case p_by
             when 'sic' then coalesce(nullif(left(replace(c.sic_code, '-', ''), 4), ''), '—')
             when 'state' then coalesce(nullif(upper(c.state), ''), '—')
             when 'type' then coalesce(c.type_code, '—')
             when 'manager' then coalesce(c.user_id::text, '—')
             else null end as dim,
           extract(isodow from c.call_date at time zone c.tz)::integer as dow,
           extract(hour from c.call_date at time zone c.tz)::integer as hour,
           c.effect
      from c
  )
  select x.dim,
         case p_by
           when 'sic' then (select s.description from public.sic_codes s where s.code = x.dim limit 1)
           when 'manager' then (select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') from public.users u where u.id::text = x.dim)
           when 'type' then case x.dim when 'APPT' then 'Appointment projects' when 'DBDV' then 'DB Dev projects' else x.dim end
           else x.dim end,
         x.dow, x.hour, count(*)::bigint,
         count(*) filter (where x.effect = 'promote')::bigint,
         count(*) filter (where x.effect = 'appointment')::bigint
    from local x
   group by x.dim, x.dow, x.hour
   order by x.dim nulls first, x.dow, x.hour;
end $function$;

-- early_starts
CREATE OR REPLACE FUNCTION public.early_starts(p_from date, p_to date, p_company bigint DEFAULT NULL::bigint, p_project bigint DEFAULT NULL::bigint, p_user bigint DEFAULT NULL::bigint, p_sic text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
 RETURNS TABLE(user_id bigint, name text, days bigint, avg_first_minute numeric, early_calls bigint, early_leads bigint, early_appts bigint, later_calls bigint, later_leads bigint, later_appts bigint, lead_days bigint, avg_minutes_to_lead numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
declare
  v_tz text := public.business_tz();
  v_cos bigint[] := public.campaign_companies();
  v_admin boolean := public.is_admin();
  v_me bigint := public.app_user_id();
begin
  if not v_admin and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'Early Starts is for administrators and managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.user_id as uid, cr.call_date,
           (cr.call_date at time zone v_tz)::date as day,
           cr.call_date at time zone coalesce(public.us_state_tz(l.state), z.iana, v_tz) as local_at,
           cres.effect
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.user_id is not null
       and cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
       and (v_cos is null or coalesce(p.company_id, 0) = any(v_cos))
       -- A manager: their own calls, on the projects they're assigned to.
       and (v_admin or (cr.user_id = v_me and p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_me)))
  ), daily as (
    -- Each manager's day: their first call (and its local time), and their first lead.
    select c.uid, c.day,
           min(c.call_date) as first_call,
           (array_agg(c.local_at order by c.call_date))[1] as first_local,
           min(c.call_date) filter (where c.effect = 'promote') as first_lead
      from c group by c.uid, c.day
  ), per as (
    select d.uid,
           count(*) as days,
           avg(extract(hour from d.first_local) * 60 + extract(minute from d.first_local)) as avg_first_minute,
           count(d.first_lead) as lead_days,
           avg(extract(epoch from (d.first_lead - d.first_call)) / 60) filter (where d.first_lead is not null) as avg_minutes_to_lead
      from daily d group by d.uid
  ), split as (
    select c.uid,
           count(*) filter (where extract(hour from c.local_at) < 9) as early_calls,
           count(*) filter (where extract(hour from c.local_at) < 9 and c.effect = 'promote') as early_leads,
           count(*) filter (where extract(hour from c.local_at) < 9 and c.effect = 'appointment') as early_appts,
           count(*) filter (where extract(hour from c.local_at) >= 9) as later_calls,
           count(*) filter (where extract(hour from c.local_at) >= 9 and c.effect = 'promote') as later_leads,
           count(*) filter (where extract(hour from c.local_at) >= 9 and c.effect = 'appointment') as later_appts
      from c group by c.uid
  )
  select p.uid, coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email),
         p.days, round(p.avg_first_minute, 1),
         s.early_calls, s.early_leads, s.early_appts, s.later_calls, s.later_leads, s.later_appts,
         p.lead_days, round(p.avg_minutes_to_lead, 1)
    from per p
    join split s on s.uid = p.uid
    join public.users u on u.id = p.uid
   order by p.avg_first_minute nulls last;
end $function$;

notify pgrst, 'reload schema';

-- Every API sees the new tables and functions at once.
notify pgrst, 'reload schema';
