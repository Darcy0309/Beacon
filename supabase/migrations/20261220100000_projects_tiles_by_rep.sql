-- The Projects page's tiles for the clients picked on its list (Oct 2026):
-- a Sales Rep (or a client, or an Agency Group) counts the tiles for those
-- clients' projects, as the Clients page's tiles follow its Sales Rep.
--
--   projects_lead_stats(p_companies)   as before, for those clients'
--                                      projects only; every project when null
--
-- The old signature goes (a call with no arguments takes the default).
-- Safe to run more than once.

drop function if exists public.projects_lead_stats();
create or replace function public.projects_lead_stats(p_companies bigint[] default null)
returns table(project_id bigint, names bigint, names_left bigint, leads bigint, leads_active bigint, developed bigint)
language sql stable set search_path = public as $$
  with ps as (
    select p.id from public.projects p where p_companies is null or p.company_id = any(p_companies)
  ), scoped as (
    -- A project's names: those on it, and those it sent on to another (as lead_stats() has them).
    select ps.id as pid, c.*, (c.project_id = ps.id) as here
      from ps join public.lead_classes c
        on c.project_id = ps.id or (c.source_project_id = ps.id and c.source_project_id <> c.project_id)
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
    from public.lead_classes c
   where p_companies is null or c.project_id in (select id from ps);
$$;
revoke execute on function public.projects_lead_stats(bigint[]) from public, anon;
grant execute on function public.projects_lead_stats(bigint[]) to authenticated;
