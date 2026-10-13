-- ---------------------------------------------------------------------------
-- Lighthouse CRM — client and project figures, counted by call result
-- (Sean, Oct 2026)
--
-- The Clients and Project pages counted every name loaded as a "lead" and
-- every record with an appointment date as an "appointment". They now count
-- by where each name stands, its call result:
--
--   names            every record loaded
--   names left       DB dev names still to call (Viable-…, Pending)
--   leads            names at the appointment stage: active (a viable
--                    result: Lead-No Contact, -Left Message, -Email,
--                    -ClientList, -Not Shopping, -Corrected) or resolved
--                    (any other: an appointment, removed, invalid…)
--   developed        names DB dev made a lead or an appointment (DB dev
--                    result Lead, Lead-Hot Lead, Appointment…, Lead-Invalid,
--                    Appointment-Invalid), whatever became of them
--   appointments     names whose result is Appointment, Appointment-Phone
--                    or Appointment-Confirmed (either list)
--   invalid          names whose result is Appointment-Invalid
--
--   lead_classes         each name with its result's kind, and its DB dev
--                        result read from what was recorded or imported
--   lead_stats()         the counts for a client (each project, and the
--                        client's total with each name once) or one project
--   result_breakdown()   a project's names by call result, for its graph
--
-- A DB dev project counts the names it was loaded with wherever they are
-- now: those still on it, and those it sent on to its appointment project.
-- ---------------------------------------------------------------------------

create or replace view public.lead_classes with (security_invoker = true) as
  select l.id, l.project_id, l.source_project_id, l.stage,
         r.name as result, r.project_type as result_type, r.viable, r.callable, r.effect, r.sort_order,
         d.name as dbdv_result,
         -- DB dev developed it: it came on from a DB dev project, or its DB dev result says so.
         ((l.stage = 'appt' and l.source_project_id is not null and l.source_project_id <> l.project_id)
           or coalesce(d.effect in ('promote', 'appointment', 'confirm', 'appointment_invalid') or d.name = 'Lead-Invalid', false)) as developed
    from public.leads l
    join public.call_results r on r.id = l.result_id
    left join lateral (
      select cr.name, cr.effect
        from public.call_results cr
       where cr.project_type = 'DBDV' and nullif(btrim(l.call_result_dbdv), '') is not null
         and (lower(cr.name) = lower(btrim(l.call_result_dbdv)) or lower(btrim(l.call_result_dbdv)) = any (cr.aliases))
       order by cr.sort_order
       limit 1
    ) d on true;
revoke all on public.lead_classes from anon;
grant select on public.lead_classes to authenticated;

/**
 * The counts for one project (`p_project_id`), or for a client: a row for
 * each of its projects and one with a null project for the client as a
 * whole, each name once. Staff only (Row Level Security on leads).
 */
create or replace function public.lead_stats(p_company_id bigint default null, p_project_id bigint default null)
returns table (
  project_id bigint, names bigint, names_left bigint, leads_active bigint, leads_resolved bigint,
  developed bigint, appointments bigint, invalid_appointments bigint
)
language sql stable security invoker set search_path = public as $$
  with ps as (
    select p.id from public.projects p
     where (p_project_id is not null and p.id = p_project_id)
        or (p_project_id is null and p_company_id is not null and p.company_id = p_company_id)
  ), scoped as (
    -- A project's names: those on it, and those it sent on to another.
    select ps.id as pid, c.*, (c.project_id = ps.id) as here
      from ps join public.lead_classes c
        on c.project_id = ps.id or (c.source_project_id = ps.id and c.source_project_id <> c.project_id)
  ), per as (
    select pid,
           count(*) as names,
           count(*) filter (where here and stage = 'dbdev' and viable) as names_left,
           count(*) filter (where stage = 'appt' and viable) as leads_active,
           count(*) filter (where stage = 'appt' and not viable) as leads_resolved,
           count(*) filter (where developed) as developed,
           count(*) filter (where effect in ('appointment', 'confirm')) as appointments,
           count(*) filter (where effect = 'appointment_invalid') as invalid_appointments
      from scoped group by pid
  )
  select ps.id, coalesce(per.names, 0), coalesce(per.names_left, 0), coalesce(per.leads_active, 0), coalesce(per.leads_resolved, 0),
         coalesce(per.developed, 0), coalesce(per.appointments, 0), coalesce(per.invalid_appointments, 0)
    from ps left join per on per.pid = ps.id
  union all
  select null, count(*),
         count(*) filter (where c.stage = 'dbdev' and c.viable),
         count(*) filter (where c.stage = 'appt' and c.viable),
         count(*) filter (where c.stage = 'appt' and not c.viable),
         count(*) filter (where c.developed),
         count(*) filter (where c.effect in ('appointment', 'confirm')),
         count(*) filter (where c.effect = 'appointment_invalid')
    from public.lead_classes c
   where p_project_id is null and p_company_id is not null and c.project_id in (select id from ps)
  -- The client's total only when a client was asked for (an aggregate otherwise still answers, with zeros).
  having p_project_id is null and p_company_id is not null;
$$;
revoke execute on function public.lead_stats(bigint, bigint) from public, anon;
grant execute on function public.lead_stats(bigint, bigint) to authenticated;

/**
 * A project's names by call result, most first: a DB dev project by DB dev
 * result (the names it sent on by the result that sent them), an
 * appointment project by appointment result. `kind`: viable (still to
 * call), won (a lead or an appointment) or resolved.
 */
create or replace function public.result_breakdown(p_project_id bigint)
returns table (result text, names bigint, kind text)
language sql stable security invoker set search_path = public as $$
  with p as (
    select pr.id, public.project_type_code(pr.id) as type from public.projects pr where pr.id = p_project_id
  ), named as (
    select case when p.type = 'DBDV' and c.stage <> 'dbdev' then coalesce(c.dbdv_result, 'Lead') else c.result end as result
      from p join public.lead_classes c
        on c.project_id = p.id or (p.type = 'DBDV' and c.source_project_id = p.id and c.source_project_id <> c.project_id)
  )
  select n.result, count(*),
         coalesce((select case when r.viable then 'viable'
                               when r.effect in ('promote', 'appointment', 'confirm') then 'won'
                               else 'resolved' end
                     from public.call_results r, p
                    where r.name = n.result order by (r.project_type = p.type) desc limit 1), 'resolved')
    from named n
   group by n.result
   order by 2 desc, 1;
$$;
revoke execute on function public.result_breakdown(bigint) from public, anon;
grant execute on function public.result_breakdown(bigint) to authenticated;
