-- ---------------------------------------------------------------------------
-- Lighthouse CRM — lead delivery: the lead sheet emailed to the client
--
-- The old system (MailAlert) emailed a lead's sheet to its project's
-- delivery address whenever a call made it a lead or an appointment, or a
-- link to it instead; and an administrator could send it again
-- ("reprocess"). Requirements FR-ALERT-01/03/04/05, FR-CLI-05, FR-LEAD-08.
--
--   call_results.delivers      which results send the sheet: those that
--                              promote a name (Lead, Lead-Hot Lead) or set an
--                              appointment (Appointment, Appointment-Phone),
--                              as the old rules did; adjustable here
--   projects.email             the delivery addresses (already there); a
--                              leading "_" on one sends it a link, as before
--   projects.delivery_link_only  send every address a link, not the sheet
--   lead_deliveries            every sheet sent, to whom, and whether the mail
--                              service took it. Written only by the server.
-- ---------------------------------------------------------------------------

-- Set up once, when the column is added: running this again never changes a
-- result someone has turned on or off since.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'call_results' and column_name = 'delivers') then
    alter table public.call_results add column delivers boolean not null default false;
    update public.call_results set delivers = true where effect in ('promote', 'appointment');
  end if;
end $$;

alter table public.projects add column if not exists delivery_link_only boolean not null default false;

create table if not exists public.lead_deliveries (
  id              bigint generated always as identity primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  project_id      bigint references public.projects(id) on delete set null,
  call_record_id  bigint references public.call_records(id) on delete set null,
  result          text check (length(result) <= 80),
  to_address      text not null check (length(to_address) between 3 and 254),
  link_only       boolean not null default false,
  resent          boolean not null default false,              -- sent again by hand, not by a call
  status          text not null check (status in ('sent', 'failed')),
  error           text check (length(error) <= 500),
  message_id      text check (length(message_id) <= 300),
  sent_by         bigint references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists lead_deliveries_lead_idx on public.lead_deliveries (lead_id, created_at desc);

alter table public.lead_deliveries enable row level security;

drop policy if exists lead_deliveries_read on public.lead_deliveries;
create policy lead_deliveries_read on public.lead_deliveries
  for select to authenticated
  using ((select public.is_staff()));
drop policy if exists mfa_required on public.lead_deliveries;
create policy mfa_required on public.lead_deliveries as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Only the server writes them, after sending (or failing to).
revoke all on public.lead_deliveries from anon;
revoke insert, update, delete, truncate on public.lead_deliveries from authenticated;
grant select on public.lead_deliveries to authenticated;
grant select, insert on public.lead_deliveries to service_role;

-- The server reads what goes on a sheet with its own role (a delivery runs
-- after the call is saved, and a link is opened by someone not signed in).
grant select on public.leads, public.insurance_details, public.projects, public.companies,
  public.call_records, public.call_results, public.appointments, public.users, public.app_settings
  to service_role;
