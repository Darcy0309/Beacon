-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a tied DB dev project's Project Info: shared, or its own
-- (Sean, Oct 2026)
--
-- A DB dev project tied to an appointment project shows and edits that
-- project's Project Info, one sheet for them all (migration 20261116100000).
-- When one needs to differ, it keeps its own instead:
--
--   project_profiles.own    on a tied DB dev project's row: its own Project
--                           Info, not the appointment project's
-- ---------------------------------------------------------------------------

alter table public.project_profiles add column if not exists own boolean not null default false;

notify pgrst, 'reload schema';
