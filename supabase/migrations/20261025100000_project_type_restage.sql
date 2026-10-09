-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a project's type and its names' stage stay together
-- (Sean, Oct 2026)
--
-- A name's stage (DB dev or appointment) and the call results its sheet
-- offers follow its project's type. The stage was set when a name was
-- loaded or moved to another project, but not when the project's own type
-- was changed: names loaded into a Database Development project that was
-- later set to Appointment Setting stayed at the DB dev stage, with a DB dev
-- result (Viable-CallBack), while their sheet offered the appointment
-- results.
--
--   tg_projects_restage    changing a project's type moves its names to that
--                          type's stage; a result from the other stage's list
--                          starts again at the stage's first (tg_leads_stage)
-- ---------------------------------------------------------------------------

create or replace function public.tg_projects_restage()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_stage text := case public.project_type_code(new.id) when 'APPT' then 'appt' else 'dbdev' end;
begin
  if new.project_type_id is distinct from old.project_type_id and new.project_type_id is not null then
    -- Naming result_id runs tg_leads_stage, which starts a result from the other stage's list afresh.
    update public.leads set stage = v_stage, result_id = result_id
     where project_id = new.id and stage is distinct from v_stage;
  end if;
  return null;
end $$;

drop trigger if exists projects_restage on public.projects;
create trigger projects_restage
  after update of project_type_id on public.projects
  for each row execute function public.tg_projects_restage();
