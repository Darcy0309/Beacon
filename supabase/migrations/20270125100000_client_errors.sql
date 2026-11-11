-- What broke on someone's screen (Nov 2026): when a page fails in the browser and shows "Something
-- went wrong", the browser tells the server what the error was (app/api/client-errors), so a failure
-- that can't be made to happen elsewhere (Sean's appointment date picker) can still be read and
-- fixed. Kept for staff to read (admins), written by the server only.
--
-- Safe to run more than once.

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     bigint references public.users(id) on delete set null,
  path        text,
  message     text,
  stack       text,
  digest      text,
  component   text,
  user_agent  text
);
create index if not exists client_errors_at_idx on public.client_errors (at desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select on public.client_errors to authenticated;
grant all on public.client_errors to service_role;

drop policy if exists client_errors_read on public.client_errors;
create policy client_errors_read on public.client_errors
  for select to authenticated
  using ((select public.is_admin()));
drop policy if exists mfa_required on public.client_errors;
create policy mfa_required on public.client_errors as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.client_errors;
create policy active_account_required on public.client_errors as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

notify pgrst, 'reload schema';
