-- ---------------------------------------------------------------------------
-- Lighthouse CRM — activity_log grants
--
-- The table was created with only select and insert granted to authenticated,
-- which left it unreadable to the service role and undeletable by anyone. That
-- blocks maintenance work (rebuilding the demo data, trimming old entries)
-- without changing who can read what: the Row Level Security policies on the
-- table still decide that for ordinary users.
-- ---------------------------------------------------------------------------

grant all on public.activity_log to service_role;
grant delete on public.activity_log to authenticated;

-- Administrators may clear the trail; everyone else still only reads their own.
drop policy if exists activity_log_admin_delete on public.activity_log;
create policy activity_log_admin_delete on public.activity_log
  for delete to authenticated
  using (public.is_admin());
