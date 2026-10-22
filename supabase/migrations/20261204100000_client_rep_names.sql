-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the manager on a client's leads (Sean, Oct 2026)
--
-- A client's people cannot read the staff, so the manager assigned to their
-- leads read as "Unassigned" (Leads on this project, X-Dates by Month's
-- names). They get the name of whoever works each of their own leads.
--
--   lead_rep_names(leads)   each lead's assigned manager's name, for the
--                           leads the caller may see (staff: any; a client:
--                           those on their projects)
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

create or replace function public.lead_rep_names(p_lead_ids bigint[])
returns table (lead_id bigint, first_name text, last_name text, email text)
language sql stable security definer set search_path = public as $$
  select l.id, u.first_name, u.last_name, u.email
    from public.leads l
    join public.users u on u.id = l.assigned_user_id
   where l.id = any(p_lead_ids)
     and public.app_user_id() is not null
     and (public.is_staff() or l.project_id in (select public.client_project_ids())
          or l.source_project_id in (select public.client_project_ids()));
$$;
revoke execute on function public.lead_rep_names(bigint[]) from public, anon;
grant execute on function public.lead_rep_names(bigint[]) to authenticated;

notify pgrst, 'reload schema';
