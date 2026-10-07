-- ---------------------------------------------------------------------------
-- Lighthouse CRM — clear out clients, projects and leads for a fresh start
--
-- A ONE-OFF, not a migration: run it by hand in the Supabase SQL Editor
-- when the client wants to re-test from a clean slate (2 clients, 2
-- projects each, a fresh lead import). It CANNOT be undone. Take a backup
-- first (see the checklist below), and read the counts it prints.
--
-- Removes:  every client (and its brands), every project (and who is
--           assigned to it), every lead with its coverage, calls,
--           appointments, emails and pay; client feedback; import history;
--           time worked; notifications (they point at the leads).
-- Keeps:    users and their logins, pay profiles, settings and pay rules,
--           call results and statuses, the insurance carrier list, push
--           subscriptions, the bulletin board, documents and the activity
--           log (their links to what is removed are cleared, as the
--           database does on its own).
--
-- Afterwards a client-portal user belongs to no client: give them their
-- new client on the Users page, or they see nothing.
--
-- Backup checklist (before running):
--   1. Supabase dashboard → Database → Backups: note today's backup
--      (paid plans), or
--   2. from a terminal, with the connection string from Project Settings →
--      Database:  npx supabase db dump --db-url "<connection string>" --data-only -f lighthouse-backup.sql
--   3. Keep the file somewhere safe until the client has finished testing.
-- ---------------------------------------------------------------------------

begin;

-- What is there now.
select 'before' as at,
       (select count(*) from public.companies)    as clients,
       (select count(*) from public.projects)     as projects,
       (select count(*) from public.leads)        as leads,
       (select count(*) from public.appointments) as appointments,
       (select count(*) from public.call_records) as calls,
       (select count(*) from public.pay_events)   as pay_events,
       (select count(*) from public.users)        as users;

-- Everything that hangs off a lead, then the leads.
delete from public.pay_events;
delete from public.feedback;
delete from public.lead_emails;
delete from public.appointments;
delete from public.call_records;
delete from public.insurance_details;
delete from public.work_activity;
delete from public.notifications;
delete from public.alert_log;
delete from public.import_batches;
delete from public.leads;

-- Projects (their rep assignments go with them), then clients (and their brands).
delete from public.project_assignments;
delete from public.projects;
delete from public.brands;
delete from public.companies;

-- What is left: clients, projects, leads and the rest at 0; users as before.
select 'after' as at,
       (select count(*) from public.companies)    as clients,
       (select count(*) from public.projects)     as projects,
       (select count(*) from public.leads)        as leads,
       (select count(*) from public.appointments) as appointments,
       (select count(*) from public.call_records) as calls,
       (select count(*) from public.pay_events)   as pay_events,
       (select count(*) from public.users)        as users;

commit;
