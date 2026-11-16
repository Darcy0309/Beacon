-- Indexes on the columns that point at a lead and had none (Nov 2026). Deleting a lead makes the database check
-- each of them for rows still pointing at it; unindexed, that is a pass over the whole table per lead deleted.
-- Removing the ~19,000 names of five test lists took over 7 minutes without finishing (leads.matched_from_lead_id
-- reads all of leads each time) and 6 seconds with these: the test-data wipe before going live, a project deleted
-- with its names, a list taken off.
--
-- Safe to run more than once.

create index if not exists leads_matched_from on public.leads (matched_from_lead_id) where matched_from_lead_id is not null;
create index if not exists feedback_lead on public.feedback (lead_id);
create index if not exists bulletin_board_lead on public.bulletin_board (lead_id);
create index if not exists documents_lead on public.documents (lead_id);
create index if not exists work_activity_lead on public.work_activity (lead_id);
