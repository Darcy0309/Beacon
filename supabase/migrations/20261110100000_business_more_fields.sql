-- More of what a business is, on the lead's Business tab (Sean, Oct 2026):
--
--   annual_payroll      beside sales volume, as written ("$1.2M")
--   dot_number          the US DOT number its vehicles run under
--   cargo               what its vehicles carry, picked from the cargo list
--   claims_3yrs         whether it has had claims in the last three years
--
--   cargo_types         the cargo list administrators load (Settings), for
--                       the Cargo field to pick from. A lead keeps the words
--                       picked, so taking one off the list changes no lead.

alter table public.leads
  add column if not exists annual_payroll text check (char_length(annual_payroll) <= 30),
  add column if not exists dot_number text check (dot_number ~ '^\d{1,10}$'),
  add column if not exists cargo text check (char_length(cargo) <= 100),
  add column if not exists claims_3yrs boolean;

create table if not exists public.cargo_types (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index if not exists cargo_types_name on public.cargo_types (lower(name));

-- Readable by any signed-in user, kept by administrators, as the other lookup lists are.
alter table public.cargo_types enable row level security;
drop policy if exists cargo_types_read on public.cargo_types;
create policy cargo_types_read on public.cargo_types for select to authenticated using (true);
drop policy if exists cargo_types_write on public.cargo_types;
create policy cargo_types_write on public.cargo_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.cargo_types;
create policy mfa_required on public.cargo_types as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.cargo_types;
create policy active_account_required on public.cargo_types as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.cargo_types from anon;
grant select, insert, delete on public.cargo_types to authenticated;
grant all on public.cargo_types to service_role;
