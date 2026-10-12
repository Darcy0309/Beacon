-- ---------------------------------------------------------------------------
-- Lighthouse CRM — clear the test data and start fresh (Sean, Oct 2026)
--
-- ONE-TIME script, not a migration: run it once, by hand, in the Supabase
-- SQL Editor. It cannot be undone; take a backup first if in doubt.
--
-- Keeps:   the one administrator account named below (sign-in included);
--          the system's lists and rules: call results, lead and appointment
--          statuses, project types and statuses, the SIC codes, the carriers
--          (Insurance Cos.), alert rules, pay rules and the pay period
--          schedule, the business time zone and the other app settings.
-- Removes: every other account (and their sign-ins), and all the data:
--          clients, projects, leads and their coverage and notes,
--          appointments, call history, pay, hours and goals, notifications,
--          reminders, bulletin posts, feedback, documents (the records; empty
--          the storage bucket from the dashboard too), imports, email and
--          delivery logs, the activity log.
--
-- Set the email of the account to keep on the next line.
-- ---------------------------------------------------------------------------

begin;

do $$
declare
  v_keep_email text := 'seanf@signaturemktg.net';   -- the administrator who stays
  v_keep       public.users;
begin
  select * into v_keep from public.users where lower(email) = lower(v_keep_email);
  if v_keep.id is null then
    raise exception 'No account with the email % — nothing was changed', v_keep_email;
  end if;
  if v_keep.role <> 'admin' or v_keep.status <> 'active' then
    raise exception '% is not an active administrator — nothing was changed', v_keep_email;
  end if;

  -- The data, everything that hangs off clients, projects, leads and people.
  truncate table
    public.activity_log, public.alert_log, public.alert_sends,
    public.notifications, public.push_subscriptions, public.reminders,
    public.lead_deliveries, public.lead_emails, public.lead_notes,
    public.call_list_filters, public.daily_goals, public.production_goals,
    public.pay_events, public.pay_profiles, public.work_activity,
    public.call_records, public.appointments, public.insurance_details,
    public.documents, public.feedback, public.bulletin_board, public.import_batches,
    public.project_assignment_log, public.project_assignments
  restart identity;

  delete from public.leads;
  -- Every account but the one kept, and its sign-in.
  delete from auth.users where id in (select auth_id from public.users where id <> v_keep.id and auth_id is not null);
  delete from public.users where id <> v_keep.id;
  update public.users set company_id = null where id = v_keep.id;
  delete from public.projects;
  delete from public.companies;

  raise notice 'Done: kept %, removed everything else.', v_keep_email;
end $$;

-- What is left, to check before committing (each should be 0, users 1).
select 'users' as what, count(*) from public.users
union all select 'sign-ins', count(*) from auth.users
union all select 'companies', count(*) from public.companies
union all select 'projects', count(*) from public.projects
union all select 'leads', count(*) from public.leads
union all select 'appointments', count(*) from public.appointments
union all select 'notifications', count(*) from public.notifications
union all select 'carriers (kept)', count(*) from public.agencies
union all select 'call results (kept)', count(*) from public.call_results
union all select 'SIC codes (kept)', count(*) from public.sic_codes;

commit;
