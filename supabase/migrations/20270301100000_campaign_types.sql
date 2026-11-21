-- Campaign Types (Sean, Nov 2026): a lead sheet's layout for an industry other than insurance (IT/MSPs first, and
-- Signature's own calls to agents). An administrator builds one in Settings from the insurance fields (each
-- renamed or turned off: the tabs, the Business details, the key date, the policy lines) and fields of their own;
-- a client is given one, and its leads show that layout, to staff and to the client. A client with none: Insurance,
-- as before. Call results, appointments and everything else stay as they are.
--
--   campaign_types            name, fields: { builtin: { <key>: { label, hidden } }, custom: [{ id, label, type, options }] }
--   companies.campaign_type_id   the client's (none: Insurance)
--   leads.custom              the answers to a campaign type's own fields, by field id
--
-- Everyone signed in reads the types (a client's lead sheet is laid out by its own); administrators change them.
-- Safe to run more than once.

create table if not exists public.campaign_types (
  id         bigint generated always as identity primary key,
  name       text not null check (length(btrim(name)) between 1 and 60),
  fields     jsonb not null default '{}'::jsonb,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists campaign_types_name on public.campaign_types (lower(btrim(name)));

alter table public.campaign_types enable row level security;
drop policy if exists campaign_types_read on public.campaign_types;
create policy campaign_types_read on public.campaign_types for select to authenticated using (true);
drop policy if exists campaign_types_admin on public.campaign_types;
create policy campaign_types_admin on public.campaign_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.campaign_types to authenticated;

alter table public.companies add column if not exists campaign_type_id bigint references public.campaign_types(id) on delete set null;
alter table public.leads add column if not exists custom jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
