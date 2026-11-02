-- A project's projected appointment rate (Sean, Nov 2026): the Pipeline by
-- Month on a project's page projects appointments from each month's leads
-- at 20% unless an administrator sets the client's own rate.
--
--   projects.projected_conversion   the % of a month's leads expected to
--                                   become appointments; none: 20%
--
-- Safe to run more than once.

alter table public.projects add column if not exists projected_conversion numeric(5, 2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_projected_conversion_check') then
    alter table public.projects add constraint projects_projected_conversion_check
      check (projected_conversion is null or (projected_conversion >= 0 and projected_conversion <= 100));
  end if;
end $$;
