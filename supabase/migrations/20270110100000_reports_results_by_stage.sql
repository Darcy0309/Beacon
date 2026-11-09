-- Reports: the call results by stage (client, Nov 2026).
--
-- The Reports tile listed every call result in one list, the appointment
-- stage's and DB Dev's mixed together, and the list grew so long it
-- stretched the 6-month chart beside it down the page. The tile now shows
-- one stage at a time; by_result counts each stage's results apart:
-- { "APPT": { "Appointment": 177, ... }, "DBDV": { "Lead-No Contact": 2515, ... } }.
-- by_status stays as it was, for the Command Center tile.
--
-- Safe to run again.

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
                          'leads',  (select count(*) from l where l.ym = to_char(m.m, 'YYYY-MM')),
                          'appts',  (select count(*) from a where a.ym = to_char(m.m, 'YYYY-MM')),
                          'rating', (select round(avg(f.rating), 1) from f where f.ym = to_char(m.m, 'YYYY-MM'))
                        ) order by m.i desc) from months m)
  );
$function$;
