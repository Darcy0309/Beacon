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
