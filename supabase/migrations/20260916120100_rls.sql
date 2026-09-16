-- =============================================================================
-- Beacon CRM — Row Level Security
--
-- Role model (mirrors the legacy UserType table):
--   admin   — full access to everything, including user administration
--   manager — account manager / AE: full operational access to accounts + data
--   agent   — internal rep: works leads, appointments, QA; no account admin
--   client  — external client-portal user: read-only, scoped to their own company
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so they can read public.users without tripping the
-- policies defined on public.users itself (which would recurse).
-- ---------------------------------------------------------------------------
create or replace function public.app_user_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.app_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.app_company_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select company_id from public.users where auth_id = auth.uid() limit 1;
$$;

-- Internal staff = everyone except external client-portal users.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin','manager','agent'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

-- admin or manager — the "can administer accounts" tier.
create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin','manager'), false);
$$;

-- The set of project ids an external client user is allowed to see.
create or replace function public.client_project_ids()
returns setof bigint
language sql stable security definer set search_path = public as $$
  select p.id from public.projects p
  where p.company_id = public.app_company_id()
  union
  select pa.project_id from public.project_assignments pa
  where pa.cl_user_id = public.app_user_id();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'user_types','lead_statuses','appointment_statuses','project_types',
    'project_statuses','nature_of_enquiry','fb_statuses','timezones','sic_codes',
    'companies','brands','users','projects','project_assignments','agencies',
    'leads','insurance_details','appointments','feedback','bulletin_board',
    'documents','call_records','import_batches','alert_rules','alert_log',
    'ip_whitelist','app_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Lookup tables: readable by any signed-in user, writable by admins.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'user_types','lead_statuses','appointment_statuses','project_types',
    'project_statuses','nature_of_enquiry','fb_statuses','timezones','sic_codes'
  ]
  loop
    execute format($f$
      create policy %1$s_read on public.%1$I
        for select to authenticated using (true);
      create policy %1$s_write on public.%1$I
        for all to authenticated using (public.is_admin()) with check (public.is_admin());
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- users — everyone sees their own row; staff see the directory;
-- only admins can create/modify accounts.
-- ---------------------------------------------------------------------------
create policy users_read_self on public.users
  for select to authenticated using (auth_id = auth.uid());

create policy users_read_staff on public.users
  for select to authenticated using (public.is_staff());

create policy users_update_self on public.users
  for update to authenticated
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- companies ("Clients") — staff read all; clients read only their own company.
-- Managers/admins write.
-- ---------------------------------------------------------------------------
create policy companies_read on public.companies
  for select to authenticated
  using (public.is_staff() or id = public.app_company_id());

create policy companies_write on public.companies
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy brands_read on public.brands
  for select to authenticated
  using (public.is_staff() or company_id = public.app_company_id());

create policy brands_write on public.brands
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- projects — staff read all; clients read only projects for their company.
-- ---------------------------------------------------------------------------
create policy projects_read on public.projects
  for select to authenticated
  using (public.is_staff() or id in (select public.client_project_ids()));

create policy projects_write on public.projects
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy project_assignments_read on public.project_assignments
  for select to authenticated
  using (public.is_staff() or project_id in (select public.client_project_ids()));

create policy project_assignments_write on public.project_assignments
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- agencies ("Insurance Companies") — staff read/write, clients read.
-- ---------------------------------------------------------------------------
create policy agencies_read on public.agencies
  for select to authenticated using (true);

create policy agencies_write on public.agencies
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- leads — the core record. Staff work all leads; clients see only leads
-- belonging to one of their projects.
-- ---------------------------------------------------------------------------
create policy leads_read on public.leads
  for select to authenticated
  using (public.is_staff() or project_id in (select public.client_project_ids()));

create policy leads_write on public.leads
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy insurance_details_read on public.insurance_details
  for select to authenticated
  using (
    public.is_staff()
    or lead_id in (
      select l.id from public.leads l
      where l.project_id in (select public.client_project_ids())
    )
  );

create policy insurance_details_write on public.insurance_details
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- appointments — same visibility rule as leads.
-- ---------------------------------------------------------------------------
create policy appointments_read on public.appointments
  for select to authenticated
  using (
    public.is_staff()
    or lead_id in (
      select l.id from public.leads l
      where l.project_id in (select public.client_project_ids())
    )
  );

create policy appointments_write on public.appointments
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- feedback — clients may read and submit feedback on their own appointments.
-- ---------------------------------------------------------------------------
create policy feedback_read on public.feedback
  for select to authenticated
  using (
    public.is_staff()
    or lead_id in (
      select l.id from public.leads l
      where l.project_id in (select public.client_project_ids())
    )
  );

create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (public.is_staff() or user_id = public.app_user_id());

create policy feedback_manage on public.feedback
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- bulletin board — staff only (internal comms).
-- ---------------------------------------------------------------------------
create policy bulletin_read on public.bulletin_board
  for select to authenticated using (public.is_staff());

create policy bulletin_write on public.bulletin_board
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- documents — staff read all; clients read docs tied to their projects/company.
-- ---------------------------------------------------------------------------
create policy documents_read on public.documents
  for select to authenticated
  using (
    public.is_staff()
    or company_id = public.app_company_id()
    or project_id in (select public.client_project_ids())
  );

create policy documents_write on public.documents
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- call records / QA — staff only.
-- ---------------------------------------------------------------------------
create policy call_records_read on public.call_records
  for select to authenticated using (public.is_staff());

create policy call_records_write on public.call_records
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- imports / alerts / settings / ip whitelist — manager or admin only.
-- ---------------------------------------------------------------------------
create policy import_batches_read on public.import_batches
  for select to authenticated using (public.is_manager());
create policy import_batches_write on public.import_batches
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy alert_rules_read on public.alert_rules
  for select to authenticated using (public.is_manager());
create policy alert_rules_write on public.alert_rules
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy alert_log_read on public.alert_log
  for select to authenticated using (public.is_manager());
create policy alert_log_write on public.alert_log
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy ip_whitelist_read on public.ip_whitelist
  for select to authenticated using (public.is_admin());
create policy ip_whitelist_write on public.ip_whitelist
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy app_settings_read on public.app_settings
  for select to authenticated using (public.is_staff());
create policy app_settings_write on public.app_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants (RLS still governs row visibility).
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
