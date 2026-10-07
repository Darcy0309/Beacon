-- ---------------------------------------------------------------------------
-- Lighthouse CRM — Personal Lines on a name's coverage
--
-- As the client asked: the Coverage tab lists Package, Workers Comp, Auto,
-- Group Health and Personal Lines, each with its X-date and carrier, and
-- account managers fill them in on the lead sheet. Personal Lines is new.
--
--   insurance_details.personal_lines_xdate, personal_lines_carrier
-- ---------------------------------------------------------------------------

alter table public.insurance_details
  add column if not exists personal_lines_xdate   date,
  add column if not exists personal_lines_carrier text check (length(personal_lines_carrier) <= 120);
