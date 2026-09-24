-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the last three lead-sheet fields
--
-- The client's own lead sheet and their export both carry a fax number, the
-- decision maker's title and a professionals count. Everything else on that
-- sheet already had a column here; these three did not.
-- ---------------------------------------------------------------------------

alter table public.leads add column if not exists fax           text;
alter table public.leads add column if not exists dm_title      text;
alter table public.leads add column if not exists professionals text;

-- ---------------------------------------------------------------------------
-- The dispositions their call sheets actually use. Without these, every
-- "Not Interested", "Disconnected" and "Out of Business" record imports as
-- "New", which overstates the live pipeline by a wide margin.
-- ---------------------------------------------------------------------------
insert into public.lead_statuses (code, name) values
  ('not_interested', 'Not interested'),
  ('disconnected',   'Disconnected number'),
  ('out_of_business','Out of business')
on conflict (code) do nothing;
