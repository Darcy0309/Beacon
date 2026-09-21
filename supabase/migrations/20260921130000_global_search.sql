-- ---------------------------------------------------------------------------
-- Lighthouse CRM — global search
--
-- One call searches leads, clients, projects, users, documents and carriers
-- for the command palette (Ctrl+K). Runs as the caller, so each group holds
-- only what Row Level Security lets that user see.
-- ---------------------------------------------------------------------------

create or replace function public.global_search(q text, per_group int default 5)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with term as (
    -- Escape the LIKE wildcards so a literal % or _ in the query matches itself.
    select '%' || regexp_replace(coalesce(q, ''), '([%_\\])', '\\\1', 'g') || '%' as p
  )
  select jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select l.id, l.company_name as title,
               concat_ws(' · ', l.contact_name, nullif(concat_ws(', ', l.city, l.state), ''), l.phone) as subtitle
          from public.leads l, term
         where l.company_name ilike term.p or l.contact_name ilike term.p or l.city ilike term.p
            or l.phone ilike term.p or l.email ilike term.p
         order by l.lead_date desc nulls last, l.id desc
         limit per_group) x),
    'clients', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select c.id, c.name as title,
               concat_ws(' · ', c.contact_name, nullif(concat_ws(', ', c.city, c.state), '')) as subtitle
          from public.companies c, term
         where c.name ilike term.p or c.contact_name ilike term.p or c.city ilike term.p
         order by c.name
         limit per_group) x),
    'projects', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.name as title, coalesce(c.name, p.client_name) as subtitle
          from public.projects p
          left join public.companies c on c.id = p.company_id, term
         where p.name ilike term.p or p.client_name ilike term.p or c.name ilike term.p
         order by p.name
         limit per_group) x),
    'users', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select u.id, nullif(concat_ws(' ', u.first_name, u.last_name), '') as title, u.email as subtitle, u.email
          from public.users u, term
         where u.first_name ilike term.p or u.last_name ilike term.p or u.email ilike term.p
         order by u.first_name, u.last_name
         limit per_group) x),
    'documents', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select d.id, d.name as title, concat_ws(' · ', d.file_type, c.name) as subtitle
          from public.documents d
          left join public.companies c on c.id = d.company_id, term
         where d.name ilike term.p
         order by d.created_at desc
         limit per_group) x),
    'carriers', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select a.id, a.name as title, a.association as subtitle
          from public.agencies a, term
         where a.name ilike term.p or a.association ilike term.p
         order by a.name
         limit per_group) x)
  );
$$;

grant execute on function public.global_search(text, int) to authenticated;
