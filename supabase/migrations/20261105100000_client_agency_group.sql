-- A client's agency group (Sean, Oct 2026): the national carrier group a
-- client belongs to, chosen from the insurance companies list, so clients
-- and their projects can be shown and filtered by group in reports.
--
-- One group a client, or none. Taking an insurance company off the list
-- leaves its clients without a group rather than removing them.
--
-- Safe to run again.

alter table public.companies
  add column if not exists agency_group_id bigint references public.agencies(id) on delete set null;

create index if not exists companies_agency_group_idx on public.companies (agency_group_id) where agency_group_id is not null;

comment on column public.companies.agency_group_id is 'The carrier group this client belongs to (agencies.id), for reports.';
