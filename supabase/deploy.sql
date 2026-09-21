-- Beacon CRM — full database setup for a hosted Supabase project.
-- Generated from supabase/migrations/* + supabase/seed.sql. Run once in the SQL Editor.
-- Safe to re-run? No — creates tables; drop them first if repeating.

-- ===== supabase/migrations/20260916120000_init.sql =====
-- =============================================================================
-- Beacon CRM — initial schema
-- Modernized Postgres port of the legacy DCMPower / BeaconApp SQL Server database.
-- Legacy table names are noted in comments next to each table.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- LOOKUP TABLES
-- =============================================================================

-- legacy: UserType
create table public.user_types (
  id          bigint generated always as identity primary key,
  code        text not null unique,          -- e.g. ADMIN, AE, AGENT, CLIENT
  description text not null
);

-- legacy: LEADSTATUS
create table public.lead_statuses (
  id    bigint generated always as identity primary key,
  code  text not null unique,                -- appt, survey, hot, xdate, profile, new
  name  text not null
);

-- legacy: AppointmentStatus
create table public.appointment_statuses (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- legacy: ProjectType
create table public.project_types (
  id          bigint generated always as identity primary key,
  code        text not null unique,          -- DBDV, APPT
  description text not null
);

-- legacy: ProjectStatus
create table public.project_statuses (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- legacy: NatureOfEnquiryMaster
create table public.nature_of_enquiry (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- legacy: FBStatusMaster
create table public.fb_statuses (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- legacy: Timezone
create table public.timezones (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- legacy: SICMaster
create table public.sic_codes (
  code        text primary key,
  description text
);

-- =============================================================================
-- CORE: organizations, brands, users
-- =============================================================================

-- legacy: CompanyMaster — the client organizations (insurance agencies that buy
-- the lead-gen service). Surfaced in the UI as "Clients".
create table public.companies (
  id            bigint generated always as identity primary key,
  name          text not null,
  phone         text,
  fax           text,
  contact_name  text,
  contact_title text,
  decision_maker text,
  dm_title      text,
  address       text,
  city          text,
  state         text,
  zip           text,
  country       text,
  email         text,
  website       text,
  sic_code      text references public.sic_codes(code),
  logo_url      text,
  status        text not null default 'active' check (status in ('active','inactive')),
  timezone_id   bigint references public.timezones(id),
  subscription_start date,
  subscription_end   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- legacy: BrandMaster
create table public.brands (
  id         bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  logo_url   text,
  url        text
);

-- legacy: UserMaster — internal staff and client-portal users.
-- Linked to Supabase Auth via auth_id.
create table public.users (
  id            bigint generated always as identity primary key,
  auth_id       uuid unique references auth.users(id) on delete set null,
  company_id    bigint references public.companies(id) on delete set null,
  user_type_id  bigint references public.user_types(id),
  role          text not null default 'agent' check (role in ('admin','manager','agent','client')),
  salutation    text,
  first_name    text,
  last_name     text,
  email         text not null,
  phone         text,
  mobile        text,
  phone_ext     text,
  address1      text,
  address2      text,
  city          text,
  state         text,
  zip           text,
  country       text,
  username      text,
  status        text not null default 'active' check (status in ('active','invited','disabled')),
  alerts_enabled boolean not null default true,
  ip_locked     boolean not null default false,
  last_login    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.users (role);
create index on public.users (company_id);

-- =============================================================================
-- PROJECTS (campaigns) + assignments
-- =============================================================================

-- legacy: ProjectMaster — a campaign run for a client company.
create table public.projects (
  id              bigint generated always as identity primary key,
  company_id      bigint references public.companies(id) on delete set null,
  name            text not null,
  project_type_id bigint references public.project_types(id),
  status_id       bigint references public.project_statuses(id),
  description     text,
  client_name     text,
  result          text,
  summary         text,
  amount_paid     numeric(18,2),
  contact_name    text,
  contact_title   text,
  email           text,
  address         text,
  city            text,
  state           text,
  zip             text,
  phone           text,
  fax             text,
  website         text,
  timezone_id     bigint references public.timezones(id),
  start_date      date,
  end_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.projects (company_id);

-- legacy: ClientAssignProject — assigns an account executive (AE) and a client
-- contact (CL) user to a project.
create table public.project_assignments (
  id         bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  ae_user_id bigint references public.users(id) on delete set null,   -- account manager
  cl_user_id bigint references public.users(id) on delete set null,   -- client-side user
  unique (project_id, ae_user_id, cl_user_id)
);

-- =============================================================================
-- AGENCIES + LEADS + insurance detail
-- =============================================================================

-- legacy: AgencyMaster — insurance agencies/carriers referenced by leads.
-- Surfaced in the UI as "Insurance Companies".
create table public.agencies (
  id              bigint generated always as identity primary key,
  name            text,
  association     text,
  locations       text,
  employees       text,
  autos           text,
  sales_volume    text,
  producer_name   text,
  territory       text,
  country         text,
  years_in_business text,
  shopping_date   date,
  import_date     date,
  dec_sheet_received text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- legacy: LEADMASTER — the central lead record.
create table public.leads (
  id                bigint generated always as identity primary key,
  project_id        bigint references public.projects(id) on delete set null,
  status_id         bigint references public.lead_statuses(id),
  agency_id         bigint references public.agencies(id) on delete set null,
  assigned_user_id  bigint references public.users(id) on delete set null,  -- AE (rep)
  dbdv_user_id      bigint references public.users(id) on delete set null,  -- data/dial rep
  -- company snapshot (from import / LeadCompany)
  company_name      text,
  contact_name      text,
  contact_title     text,
  decision_maker    text,
  phone             text,
  email             text,
  website           text,
  address           text,
  city              text,
  state             text,
  zip               text,
  county            text,
  territory         text,
  sic_code          text,
  -- lead attributes
  description       text,
  list_source       text,
  producer_name     text,
  broker            text,
  employees         text,
  covered_employees text,
  autos             text,
  sales_volume      text,
  years_in_business text,
  estimated_annual_premium text,
  reason_to_change  text,
  dec_sheet_received boolean default false,
  location          text,
  call_result_appt  text,
  call_result_dbdv  text,
  notes_dcm         text,
  notes_client      text,
  lead_date         timestamptz,
  import_date       timestamptz,
  shopping_date     date,
  appt_created_date timestamptz,
  qa_date_dbdv      timestamptz,
  qa_date_appt      timestamptz,
  date_last_worked  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.leads (project_id);
create index on public.leads (status_id);
create index on public.leads (assigned_user_id);
create index on public.leads (state);

-- legacy: InsuranceDetails — X-dates and carriers per lead.
create table public.insurance_details (
  id               bigint generated always as identity primary key,
  lead_id          bigint not null references public.leads(id) on delete cascade,
  agency_name      text,
  ultimate_xdate   date,
  pkg_xdate        date,
  pkg_carrier      text,
  wc_xdate         date,
  wc_carrier       text,
  auto_xdate       date,
  auto_carrier     text,
  health_xdate     date,
  health_carrier   text,
  dental_xdate     date,
  dental_provider  text,
  vision_xdate     date,
  vision_provider  text,
  prof_liab_xdate  date,
  prof_liab_carrier text,
  do_xdate         date,
  do_carrier       text,
  eo_xdate         date,
  eo_carrier       text,
  homeowner_xdate  date,
  homeowner_carrier text,
  personal_auto_xdate date,
  personal_auto_carrier text,
  inception_401k   text,
  participants_401k text,
  covered_employees text,
  autos            text,
  created_at       timestamptz not null default now()
);
create index on public.insurance_details (lead_id);

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================

-- legacy: AppointmentMaster
create table public.appointments (
  id               bigint generated always as identity primary key,
  lead_id          bigint references public.leads(id) on delete set null,
  user_id          bigint references public.users(id) on delete set null,   -- owner/creator
  rep_name         text,
  rep_first_name   text,
  rep_last_name    text,
  appt_date        date,
  appt_time        text,
  duration_min     int default 30,
  status_id        bigint references public.appointment_statuses(id),
  list_source      text,
  call_result_dbdv text,
  qa_date          timestamptz,
  date_last_worked timestamptz,
  status_update_date timestamptz,
  appt_create_date timestamptz not null default now(),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.appointments (appt_date);
create index on public.appointments (lead_id);
create index on public.appointments (user_id);

-- =============================================================================
-- FEEDBACK / QA / BULLETIN / DOCUMENTS / CALLS
-- =============================================================================

-- legacy: FeedbackMaster
create table public.feedback (
  id                  bigint generated always as identity primary key,
  appointment_id      bigint references public.appointments(id) on delete set null,
  lead_id             bigint references public.leads(id) on delete set null,
  user_id             bigint references public.users(id) on delete set null,
  nature_id           bigint references public.nature_of_enquiry(id),
  fb_status_id        bigint references public.fb_statuses(id),
  rating              int check (rating between 1 and 5),
  content             text,
  additional_comment  text,
  submitted_by        text,
  created_at          timestamptz not null default now()
);

-- legacy: BulletinBoard
create table public.bulletin_board (
  id           bigint generated always as identity primary key,
  message      text not null,
  message_type text,                     -- e.g. IN (info), AL (alert)
  status       text not null default 'active' check (status in ('active','archived')),
  lead_id      bigint references public.leads(id) on delete set null,
  project_id   bigint references public.projects(id) on delete set null,
  user_id      bigint references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- legacy: AEIDoc
create table public.documents (
  id          bigint generated always as identity primary key,
  name        text not null,
  file_type   text,
  size_bytes  bigint,
  storage_path text,
  lead_id     bigint references public.leads(id) on delete set null,
  project_id  bigint references public.projects(id) on delete set null,
  company_id  bigint references public.companies(id) on delete set null,
  uploaded_by bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- legacy: tblCallRecord (plus the QA scoring the legacy QA_DATE fields drove)
create table public.call_records (
  id          bigint generated always as identity primary key,
  lead_id     bigint references public.leads(id) on delete cascade,
  project_id  bigint references public.projects(id) on delete set null,
  user_id     bigint references public.users(id) on delete set null,
  call_date   timestamptz not null default now(),
  call_result text,
  notes       text,
  qa_score    int check (qa_score between 0 and 100),
  qa_result   text check (qa_result in ('Passed','Review','Failed')),
  qa_date     timestamptz
);
create index on public.call_records (lead_id);

-- =============================================================================
-- IMPORTS / ALERTS / SETTINGS / IP WHITELIST
-- =============================================================================

-- Tracks CSV lead-import batches (legacy tbl_FileImport + the IMPORTS staging DB).
create table public.import_batches (
  id           bigint generated always as identity primary key,
  file_name    text not null,
  source       text,
  project_id   bigint references public.projects(id) on delete set null,
  row_count    int not null default 0,
  imported_count int not null default 0,
  error_count  int not null default 0,
  status       text not null default 'completed' check (status in ('pending','processing','completed','failed')),
  imported_by  bigint references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Alert engine (email/X-date reminders). Legacy: MailAlert + EMAIL_RULES.
create table public.alert_rules (
  id          bigint generated always as identity primary key,
  name        text not null,
  trigger     text not null,             -- e.g. xdate_30d, new_lead, appt_reminder
  channel     text not null default 'email' check (channel in ('email','sms','inapp')),
  recipients  text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.alert_log (
  id          bigint generated always as identity primary key,
  rule_id     bigint references public.alert_rules(id) on delete set null,
  subject     text,
  detail      text,
  status      text not null default 'sent' check (status in ('sent','failed','queued')),
  created_at  timestamptz not null default now()
);

-- legacy: tblIPAddress — approved-IP lockdown list.
create table public.ip_whitelist (
  id         bigint generated always as identity primary key,
  ip_address text not null,
  label      text,
  created_at timestamptz not null default now()
);

-- Key/value application settings (settings page).
create table public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'companies','users','projects','agencies','leads','appointments',
    'alert_rules'
  ]
  loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ===== supabase/migrations/20260916120100_rls.sql =====
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

-- ===== supabase/migrations/20260921120000_aggregates.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — aggregates computed in the database
--
-- PostgREST has no GROUP BY, so the app used to pull whole (narrow) tables
-- and count them in JavaScript, and fetch the ten form option lists as ten
-- requests. These functions and views return the finished figures in one
-- request each. Everything runs as the caller (SECURITY INVOKER), so Row
-- Level Security applies exactly as it does to direct queries.
-- ---------------------------------------------------------------------------

-- All the option lists the record forms need, in one call.
create or replace function public.get_lookups()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'statuses',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by id), '[]'::jsonb) from public.lead_statuses),
    'apptStatuses',    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.appointment_statuses),
    'projectTypes',    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'description', description) order by id), '[]'::jsonb) from public.project_types),
    'projectStatuses', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.project_statuses),
    'natures',         (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.nature_of_enquiry),
    'fbStatuses',      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.fb_statuses),
    'projects',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.projects),
    'managers',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'email', email) order by id), '[]'::jsonb)
                          from public.users where role in ('manager', 'agent')),
    'agencies',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.agencies),
    'companies',       (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.companies)
  );
$$;

-- Lead totals per status code, plus how many clients have leads.
create or replace function public.lead_counts()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',   (select count(*) from public.leads),
    'counts',  (select coalesce(jsonb_object_agg(s.code, c.n), '{}'::jsonb)
                  from (select status_id, count(*) as n from public.leads group by status_id) c
                  join public.lead_statuses s on s.id = c.status_id),
    'clients', (select count(distinct p.company_id)
                  from public.leads l join public.projects p on p.id = l.project_id
                 where p.company_id is not null)
  );
$$;

-- Appointments booked per rep, busiest first.
create or replace function public.rep_workload()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'appts', c.n)
           order by c.n desc, u.id
         ), '[]'::jsonb)
    from (select user_id, count(*) as n from public.appointments where user_id is not null group by user_id) c
    join public.users u on u.id = c.user_id
   where u.role in ('manager', 'agent');
$$;

-- Everything the dashboard tiles and chart need: totals, the 30/60-day and
-- 7/14-day comparisons, eight weekly buckets (oldest first), leads per
-- project, and the rep workload.
create or replace function public.dashboard_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as (
    select coalesce(lead_date, created_at) as at from public.leads
  ), a as (
    select appt_date from public.appointments
  ), weeks as (
    select i,
           now() - ((8 - i) * interval '7 days') as start_at,
           now() - ((7 - i) * interval '7 days') as end_at
      from generate_series(0, 7) as i
  )
  select jsonb_build_object(
    'leads_total',    (select count(*) from l),
    'leads_30d',      (select count(*) from l where at >= now() - interval '30 days'),
    'leads_30_60d',   (select count(*) from l where at >= now() - interval '60 days' and at < now() - interval '30 days'),
    'appts_total',    (select count(*) from a),
    'appts_today',    (select count(*) from a where appt_date = current_date),
    'appts_7d',       (select count(*) from a where appt_date >= (now() - interval '7 days')::date),
    'appts_7_14d',    (select count(*) from a where appt_date >= (now() - interval '14 days')::date and appt_date < (now() - interval '7 days')::date),
    'active_clients', (select count(*) from public.companies where status = 'active'),
    'weeks',          (select jsonb_agg(jsonb_build_object(
                          'leads', (select count(*) from l where l.at >= w.start_at and l.at < w.end_at),
                          'appts', (select count(*) from a where a.appt_date >= w.start_at::date and a.appt_date < w.end_at::date)
                        ) order by w.i) from weeks w),
    'project_leads',  (select coalesce(jsonb_agg(coalesce(c.n, 0) order by p.id), '[]'::jsonb)
                         from public.projects p
                         left join (select project_id, count(*) as n from public.leads group by project_id) c on c.project_id = p.id),
    'reps',           public.rep_workload()
  );
$$;

-- Everything the reports page needs: totals, show rate inputs, the status
-- and state breakdowns, and six months of lead/appointment volume (oldest
-- first, keyed YYYY-MM in UTC).
create or replace function public.report_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as (
    select state, status_id, to_char(coalesce(lead_date, created_at) at time zone 'utc', 'YYYY-MM') as ym from public.leads
  ), a as (
    select status_id, to_char(appt_date, 'YYYY-MM') as ym from public.appointments
  ), months as (
    select i, date_trunc('month', now() at time zone 'utc') - (i * interval '1 month') as m
      from generate_series(0, 5) as i
  )
  select jsonb_build_object(
    'leads',          (select count(*) from l),
    'appts',          (select count(*) from a),
    'projects',       (select count(*) from public.projects),
    'held',           (select count(*) from a join public.appointment_statuses s on s.id = a.status_id where s.name = 'Held'),
    'ratings',        (select jsonb_build_object('count', count(rating), 'avg', coalesce(avg(rating), 0)) from public.feedback where rating is not null),
    'by_status',      (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from l group by status_id) c
                         join public.lead_statuses s on s.id = c.status_id),
    'by_state',       (select coalesce(jsonb_agg(jsonb_build_array(t.state, t.n) order by t.n desc, t.state), '[]'::jsonb)
                         from (select state, count(*) as n from l where state is not null group by state order by n desc, state limit 8) t),
    'appt_by_status', (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from a group by status_id) c
                         join public.appointment_statuses s on s.id = c.status_id),
    'months',         (select jsonb_agg(jsonb_build_object(
                          'key',   to_char(m.m, 'YYYY-MM'),
                          'label', to_char(m.m, 'Mon'),
                          'leads', (select count(*) from l where l.ym = to_char(m.m, 'YYYY-MM')),
                          'appts', (select count(*) from a where a.ym = to_char(m.m, 'YYYY-MM'))
                        ) order by m.i desc) from months m)
  );
$$;

-- Per-company lead and appointment totals plus the first assigned account
-- manager, for the clients page.
create or replace view public.company_rollups with (security_invoker = true) as
  select c.id as company_id,
         (select count(*) from public.leads l join public.projects p on p.id = l.project_id where p.company_id = c.id) as lead_count,
         (select count(*) from public.appointments a
            join public.leads l on l.id = a.lead_id
            join public.projects p on p.id = l.project_id
           where p.company_id = c.id) as appt_count,
         (select jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'email', u.email)
            from public.projects p
            join public.project_assignments pa on pa.project_id = p.id
            join public.users u on u.id = pa.ae_user_id
           where p.company_id = c.id
           order by p.id, pa.id
           limit 1) as manager
    from public.companies c;

-- Leads assigned to and appointments owned by each user.
create or replace view public.user_workload with (security_invoker = true) as
  select u.id as user_id,
         (select count(*) from public.leads l where l.assigned_user_id = u.id) as lead_count,
         (select count(*) from public.appointments a where a.user_id = u.id) as appt_count
    from public.users u;

-- How many states each carrier's leads sit in.
create or replace view public.agency_footprint with (security_invoker = true) as
  select agency_id, count(distinct state) as state_count
    from public.leads
   where agency_id is not null and state is not null
   group by agency_id;

grant execute on function public.get_lookups(), public.lead_counts(), public.rep_workload(),
                          public.dashboard_stats(), public.report_stats() to authenticated;
grant select on public.company_rollups, public.user_workload, public.agency_footprint to authenticated;

-- ===== supabase/migrations/20260921130000_global_search.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — global search
--
-- One call searches leads, clients, projects, users, documents and carriers
-- for the command palette (Ctrl+K). Runs as the caller, so each group holds
-- only what Row Level Security lets that user see.
-- ---------------------------------------------------------------------------

create or replace function public.global_search(q text, per_group int default 5)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with term as (
    -- Escape the LIKE wildcards so a literal % or _ in the query matches itself.
    select '%' || regexp_replace(coalesce(q, ''), '([%_\\])', '\\\1', 'g') || '%' as p
  )
  select jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select l.id, l.company_name as title,
               concat_ws(' · ', l.contact_name, nullif(concat_ws(', ', l.city, l.state), ''), l.phone) as subtitle
          from public.leads l, term
         where l.company_name ilike term.p or l.contact_name ilike term.p or l.city ilike term.p
            or l.phone ilike term.p or l.email ilike term.p
         order by l.lead_date desc nulls last, l.id desc
         limit per_group) x),
    'clients', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select c.id, c.name as title,
               concat_ws(' · ', c.contact_name, nullif(concat_ws(', ', c.city, c.state), '')) as subtitle
          from public.companies c, term
         where c.name ilike term.p or c.contact_name ilike term.p or c.city ilike term.p
         order by c.name
         limit per_group) x),
    'projects', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.name as title, coalesce(c.name, p.client_name) as subtitle
          from public.projects p
          left join public.companies c on c.id = p.company_id, term
         where p.name ilike term.p or p.client_name ilike term.p or c.name ilike term.p
         order by p.name
         limit per_group) x),
    'users', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select u.id, nullif(concat_ws(' ', u.first_name, u.last_name), '') as title, u.email as subtitle, u.email
          from public.users u, term
         where u.first_name ilike term.p or u.last_name ilike term.p or u.email ilike term.p
         order by u.first_name, u.last_name
         limit per_group) x),
    'documents', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select d.id, d.name as title, concat_ws(' · ', d.file_type, c.name) as subtitle
          from public.documents d
          left join public.companies c on c.id = d.company_id, term
         where d.name ilike term.p
         order by d.created_at desc
         limit per_group) x),
    'carriers', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select a.id, a.name as title, a.association as subtitle
          from public.agencies a, term
         where a.name ilike term.p or a.association ilike term.p
         order by a.name
         limit per_group) x)
  );
$$;

grant execute on function public.global_search(text, int) to authenticated;

-- ===== supabase/seed.sql =====
-- =============================================================================
-- Beacon CRM — seed data
--
-- The legacy SQL Server dumps are schema-only (structure + stored procedures,
-- no rows), so this seeds the lookup values the legacy app relied on plus a
-- realistic working data set: staff, client companies, campaigns, leads,
-- X-dates, appointments, feedback, documents and alerts.
--
-- Demo logins (all use password: Beacon!2026)
--   admin@beacon.test    — Administrator
--   sean@beacon.test     — Account Manager
--   mike@beacon.test     — Account Manager
--   rachel@beacon.test   — Account Manager
--   agent@beacon.test    — Agent
--   client@beacon.test   — Client (Garry Insurance portal)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------
insert into public.user_types (code, description) values
  ('ADMIN',  'Administrator'),
  ('AE',     'Account Manager'),
  ('AGENT',  'Agent'),
  ('CLIENT', 'Client');

insert into public.lead_statuses (code, name) values
  ('appt',    'Phone appointment'),
  ('survey',  'Survey appointment'),
  ('hot',     'X-date hot lead'),
  ('xdate',   'X-date lead'),
  ('profile', 'X-date profile'),
  ('new',     'New');

insert into public.appointment_statuses (name) values
  ('Scheduled'), ('Confirmed'), ('Held'), ('Rescheduled'), ('Cancelled'), ('No Show');

insert into public.project_types (code, description) values
  ('DBDV', 'Database Development'),
  ('APPT', 'Appointment Setting');

insert into public.project_statuses (name) values
  ('Active'), ('Paused'), ('Draft'), ('Completed');

insert into public.nature_of_enquiry (name) values
  ('Appointment quality'), ('Lead accuracy'), ('Rep professionalism'),
  ('Scheduling'), ('Data completeness'), ('General');

insert into public.fb_statuses (name) values
  ('Open'), ('In review'), ('Resolved'), ('Closed');

insert into public.timezones (name) values
  ('EST'), ('CST'), ('MST'), ('PST'), ('AKST'), ('HST');

insert into public.sic_codes (code, description) values
  ('6411', 'Insurance Agents, Brokers & Service'),
  ('6311', 'Life Insurance'),
  ('6331', 'Fire, Marine & Casualty Insurance'),
  ('1731', 'Electrical Work'),
  ('4213', 'Trucking, Except Local'),
  ('5211', 'Lumber & Other Building Materials'),
  ('8011', 'Offices & Clinics of Doctors of Medicine'),
  ('2411', 'Logging'),
  ('3441', 'Fabricated Structural Metal'),
  ('7349', 'Building Cleaning & Maintenance Services');

-- ---------------------------------------------------------------------------
-- Auth users (Supabase GoTrue) — local demo accounts.
-- ---------------------------------------------------------------------------
do $$
declare
  acct record;
  uid  uuid;
begin
  for acct in
    select * from (values
      ('admin@beacon.test'),
      ('sean@beacon.test'),
      ('mike@beacon.test'),
      ('rachel@beacon.test'),
      ('agent@beacon.test'),
      ('client@beacon.test')
    ) as t(email)
  loop
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      acct.email, crypt('Beacon!2026', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false,
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', acct.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Client companies (the "Clients" screen)
-- ---------------------------------------------------------------------------
insert into public.companies
  (name, city, state, phone, contact_name, contact_title, email, website, sic_code, timezone_id, status, subscription_start, subscription_end)
values
  ('Garry Insurance',   'Phoenix',        'AZ', '(602) 555-0100', 'Jeff Garry',     'Principal',        'jeff@garryins.test',    'garryins.test',    '6411', (select id from public.timezones where name='MST'), 'active', '2024-01-15', '2026-12-31'),
  ('Rural Insurance',   'Cedar Rapids',   'IA', '(319) 555-0100', 'Laura Meyer',    'Agency Owner',     'laura@ruralins.test',   'ruralins.test',    '6411', (select id from public.timezones where name='CST'), 'active', '2024-03-01', '2026-12-31'),
  ('Insurance Pro AZ',  'Tucson',         'AZ', '(520) 555-0100', 'Jeff Matthews',  'Managing Partner', 'jeff@inspro.test',      'inspro.test',      '6331', (select id from public.timezones where name='MST'), 'active', '2024-06-01', '2026-12-31'),
  ('Summit Benefits',   'Denver',         'CO', '(303) 555-0100', 'Brian Vicini',   'VP Benefits',      'brian@summitben.test',  'summitben.test',   '6311', (select id from public.timezones where name='MST'), 'active', '2025-01-10', '2026-12-31'),
  ('Heartland Wealth',  'Omaha',          'NE', '(402) 555-0100', 'Dana Zinda',     'Principal',        'dana@heartlandw.test',  'heartlandw.test',  '6311', (select id from public.timezones where name='CST'), 'active', '2025-02-20', '2026-12-31'),
  ('Meridian Partners', 'Salt Lake City', 'UT', '(801) 555-0100', 'Paula Reyes',    'Director',         'paula@meridianp.test',  'meridianp.test',   '6411', (select id from public.timezones where name='MST'), 'active', '2025-05-05', '2026-12-31');

-- ---------------------------------------------------------------------------
-- Application users, linked to the auth accounts above
-- ---------------------------------------------------------------------------
insert into public.users
  (auth_id, company_id, user_type_id, role, first_name, last_name, email, username, phone, city, state, status, ip_locked, last_login)
values
  ((select id from auth.users where email='admin@beacon.test'),  null,
   (select id from public.user_types where code='ADMIN'),  'admin',   'Darcy',  'Johnston',  'admin@beacon.test',  'darcy',  '(480) 555-0111', 'Scottsdale', 'AZ', 'active', true,  now() - interval '2 hours'),

  ((select id from auth.users where email='sean@beacon.test'),   null,
   (select id from public.user_types where code='AE'),     'manager', 'Sean',   'Fitzgerald','sean@beacon.test',   'seanf',  '(480) 555-0122', 'Phoenix',    'AZ', 'active', false, now() - interval '1 day'),

  ((select id from auth.users where email='mike@beacon.test'),   null,
   (select id from public.user_types where code='AE'),     'manager', 'Mike',   'Preston',   'mike@beacon.test',   'mikep',  '(319) 555-0133', 'Cedar Rapids','IA','active', false, now() - interval '3 hours'),

  ((select id from auth.users where email='rachel@beacon.test'), null,
   (select id from public.user_types where code='AE'),     'manager', 'Rachel', 'Colestock', 'rachel@beacon.test', 'rcole',  '(520) 555-0144', 'Tucson',     'AZ', 'active', false, now() - interval '5 days'),

  ((select id from auth.users where email='agent@beacon.test'),  null,
   (select id from public.user_types where code='AGENT'),  'agent',   'Tyler',  'Nguyen',    'agent@beacon.test',  'tylern', '(602) 555-0155', 'Phoenix',    'AZ', 'active', false, now() - interval '20 minutes'),

  ((select id from auth.users where email='client@beacon.test'),
   (select id from public.companies where name='Garry Insurance'),
   (select id from public.user_types where code='CLIENT'), 'client',  'Jeff',   'Garry',     'client@beacon.test', 'jgarry', '(602) 555-0148', 'Phoenix',    'AZ', 'active', false, now() - interval '4 days');

-- A couple of non-login staff records so the directory looks real.
insert into public.users (user_type_id, role, first_name, last_name, email, username, status)
values
  ((select id from public.user_types where code='AGENT'), 'agent', 'Bianca', 'Ortiz',  'bianca@beacon.test', 'biancao', 'active'),
  ((select id from public.user_types where code='AGENT'), 'agent', 'Andre',  'Whitlow','andre@beacon.test',  'andrew',  'invited');

-- ---------------------------------------------------------------------------
-- Projects (campaigns)
-- ---------------------------------------------------------------------------
insert into public.projects
  (company_id, name, project_type_id, status_id, client_name, description, start_date, end_date, amount_paid, city, state, timezone_id)
values
  ((select id from public.companies where name='Garry Insurance'),   'Q3 X-Date Renewals',
   (select id from public.project_types where code='DBDV'), (select id from public.project_statuses where name='Active'),
   'Garry Insurance',   'Commercial P&C renewal x-dates across AZ metro.',        '2026-07-01','2026-09-30',  8500.00, 'Phoenix','AZ',(select id from public.timezones where name='MST')),

  ((select id from public.companies where name='Rural Insurance'),   'Appt Setting — P&C',
   (select id from public.project_types where code='APPT'), (select id from public.project_statuses where name='Active'),
   'Rural Insurance',   'Outbound appointment setting for farm & commercial P&C.','2026-05-01','2026-12-31', 12000.00, 'Cedar Rapids','IA',(select id from public.timezones where name='CST')),

  ((select id from public.companies where name='Summit Benefits'),   'Medicare AEP Push',
   (select id from public.project_types where code='DBDV'), (select id from public.project_statuses where name='Active'),
   'Summit Benefits',   'Annual enrollment period lead development.',             '2026-08-01','2026-12-07',  9750.00, 'Denver','CO',(select id from public.timezones where name='MST')),

  ((select id from public.companies where name='Heartland Wealth'),  'Life X-Date Profile',
   (select id from public.project_types where code='DBDV'), (select id from public.project_statuses where name='Paused'),
   'Heartland Wealth',  'Life and 401(k) profiling for high-net-worth prospects.','2026-04-01','2026-10-31',  6200.00, 'Omaha','NE',(select id from public.timezones where name='CST')),

  ((select id from public.companies where name='Insurance Pro AZ'),  'Survey Campaign',
   (select id from public.project_types where code='APPT'), (select id from public.project_statuses where name='Active'),
   'Insurance Pro AZ',  'Survey-style discovery appointments, southern AZ.',      '2026-06-15','2026-11-30',  7400.00, 'Tucson','AZ',(select id from public.timezones where name='MST')),

  ((select id from public.companies where name='Meridian Partners'), 'Commercial Outbound',
   (select id from public.project_types where code='APPT'), (select id from public.project_statuses where name='Draft'),
   'Meridian Partners', 'Commercial lines outbound, Wasatch Front.',              '2026-10-01','2027-03-31',  5000.00, 'Salt Lake City','UT',(select id from public.timezones where name='MST'));

-- Assign account managers (AE) to projects.
insert into public.project_assignments (project_id, ae_user_id, cl_user_id)
values
  ((select id from public.projects where name='Q3 X-Date Renewals'),   (select id from public.users where email='sean@beacon.test'),   (select id from public.users where email='client@beacon.test')),
  ((select id from public.projects where name='Appt Setting — P&C'),   (select id from public.users where email='mike@beacon.test'),   null),
  ((select id from public.projects where name='Medicare AEP Push'),    (select id from public.users where email='sean@beacon.test'),   null),
  ((select id from public.projects where name='Life X-Date Profile'),  (select id from public.users where email='mike@beacon.test'),   null),
  ((select id from public.projects where name='Survey Campaign'),      (select id from public.users where email='rachel@beacon.test'), null),
  ((select id from public.projects where name='Commercial Outbound'),  (select id from public.users where email='mike@beacon.test'),   null);

-- ---------------------------------------------------------------------------
-- Agencies (the "Insurance Companies" screen)
-- ---------------------------------------------------------------------------
insert into public.agencies (name, association, locations, employees, autos, sales_volume, producer_name, territory, country, years_in_business, import_date)
values
  ('Travelers',            'National Carrier', '42', '30000', '—',   '$34B',  'Regional Desk',  'National', 'USA', '170', now() - interval '90 days'),
  ('The Hartford',         'National Carrier', '31', '18500', '—',   '$22B',  'Regional Desk',  'National', 'USA', '215', now() - interval '90 days'),
  ('Nationwide',           'National Carrier', '55', '25000', '—',   '$28B',  'Regional Desk',  'National', 'USA', '99',  now() - interval '60 days'),
  ('Cincinnati Insurance', 'Regional Carrier', '12', '5200',  '—',   '$8.6B', 'Midwest Desk',   'Midwest',  'USA', '75',  now() - interval '60 days'),
  ('EMC Insurance',        'Regional Carrier', '16', '2400',  '—',   '$1.9B', 'Midwest Desk',   'Midwest',  'USA', '112', now() - interval '45 days'),
  ('West Bend Mutual',     'Regional Carrier', '8',  '1300',  '—',   '$1.4B', 'Midwest Desk',   'Midwest',  'USA', '130', now() - interval '45 days'),
  ('Acuity',               'Regional Carrier', '6',  '1600',  '—',   '$2.1B', 'Midwest Desk',   'Midwest',  'USA', '98',  now() - interval '30 days'),
  ('Berkshire Hathaway',   'National Carrier', '70', '39000', '—',   '$46B',  'National Desk',  'National', 'USA', '55',  now() - interval '30 days');

-- ---------------------------------------------------------------------------
-- Leads — hero records matching the demo, plus generated volume.
-- ---------------------------------------------------------------------------
insert into public.leads (
  project_id, status_id, agency_id, assigned_user_id, dbdv_user_id,
  company_name, contact_name, contact_title, phone, email, city, state, zip, county,
  sic_code, description, list_source, employees, covered_employees, autos, sales_volume,
  years_in_business, estimated_annual_premium, notes_dcm,
  lead_date, import_date, date_last_worked, qa_date_dbdv
)
select
  p.id, s.id, a.id, ae.id, dv.id,
  v.company_name, v.contact_name, v.contact_title, v.phone, v.email,
  v.city, v.state, v.zip, v.county, v.sic, v.descr, v.list_source,
  v.employees, v.covered, v.autos, v.volume, v.yrs, v.premium, v.notes,
  now() - (v.age_days || ' days')::interval,
  now() - (v.age_days + 5 || ' days')::interval,
  now() - (v.worked_days || ' days')::interval,
  now() - (v.worked_days || ' days')::interval
from (values
  ('Garry Insurance',    'Jeff Garry',     'Principal',        '(602) 555-0148','jeff@garryins.test',     'Phoenix','AZ','85016','Maricopa','6411','Commercial P&C renewal, 3 locations','Q3 AZ Commercial List','48','44','22','$12.4M','18','$86,000','Decision maker confirmed. Wants Q3 review.',           12, 3, 'Q3 X-Date Renewals','appt',    'Travelers',            'sean@beacon.test','agent@beacon.test'),
  ('Rural Insurance',    'Laura Meyer',    'Agency Owner',     '(319) 555-0173','laura@ruralins.test',    'Cedar Rapids','IA','52402','Linn','6411','Farm + commercial book, seeking quotes','IA Farm Bureau List','32','28','41','$8.1M','26','$64,500','Survey scheduled, send prep packet.',                       9, 2, 'Appt Setting — P&C','survey',  'EMC Insurance',        'mike@beacon.test','agent@beacon.test'),
  ('Insurance Pro AZ',   'Jeff Matthews',  'Managing Partner', '(520) 555-0119','jeff@inspro.test',       'Tucson','AZ','85718','Pima','6331','Hot x-date, renewal within 30 days','AZ Commercial Renewals','67','61','35','$19.2M','22','$142,000','HOT — ultimate x-date inside 30 days. Priority.',          4, 1, 'Survey Campaign','hot',        'The Hartford',         'rachel@beacon.test','agent@beacon.test'),
  ('Summit Benefits',    'Brian Vicini',   'VP Benefits',      '(303) 555-0192','brian@summitben.test',   'Denver','CO','80202','Denver','6311','Group health + dental renewal profile','CO Benefits List','120','104','18','$31.0M','14','$210,000','Broker of record letter pending.',                         21, 6, 'Medicare AEP Push','xdate',   'Nationwide',           'sean@beacon.test','agent@beacon.test'),
  ('Heartland Wealth',   'Dana Zinda',     'Principal',        '(402) 555-0165','dana@heartlandw.test',   'Omaha','NE','68114','Douglas','6311','401(k) + life profile built','NE Wealth List','26','24','11','$6.7M','31','$48,000','Profile complete, awaiting client review.',                 30, 11,'Life X-Date Profile','profile','Cincinnati Insurance', 'mike@beacon.test','agent@beacon.test'),
  ('Collier & Co.',      'Chris Collier',  'Owner',            '(208) 555-0107','chris@collierco.test',   'Boise','ID','83702','Ada','5211','New import, not yet worked','ID Commercial Import','19','17','9','$4.2M','12',null,'Fresh import — needs first dial.',                             1, 1, 'Commercial Outbound','new',   'Acuity',               null,'agent@beacon.test'),
  ('Bender Group',       'Jordan Bender',  'CFO',              '(701) 555-0134','jordan@bendergrp.test',  'Fargo','ND','58103','Cass','4213','Trucking fleet, 40 units','ND Transport List','58','50','40','$14.8M','19','$96,000','Phone appointment confirmed for next week.',                7, 2, 'Appt Setting — P&C','appt',   'West Bend Mutual',     'sean@beacon.test','agent@beacon.test'),
  ('Zimmermann Agency',  'Sam Zimmermann', 'Principal',        '(316) 555-0156','sam@zimmagency.test',    'Wichita','KS','67206','Sedgwick','6411','Hot x-date, comp review requested','KS Commercial List','44','39','27','$10.3M','24','$78,000','HOT — asked for comparison by Friday.',                     3, 1, 'Q3 X-Date Renewals','hot',    'Travelers',            'rachel@beacon.test','agent@beacon.test'),
  ('Meridian Partners',  'Paula Reyes',    'Director',         '(801) 555-0188','paula@meridianp.test',   'Salt Lake City','UT','84101','Salt Lake','6411','Survey appointment set','UT Commercial List','73','66','31','$22.5M','16','$155,000','Survey appt — 45 min block requested.',                     6, 2, 'Survey Campaign','survey',    'Berkshire Hathaway',   'mike@beacon.test','agent@beacon.test'),
  ('Foxline Insurance',  'Erin Fox',       'Agency Owner',     '(509) 555-0121','erin@foxline.test',      'Spokane','WA','99201','Spokane','6331','X-date captured for January','WA Commercial List','35','31','16','$7.9M','21','$58,000','X-date Jan 09 — nurture until December.',                  15, 4, 'Medicare AEP Push','xdate',   'Nationwide',           'sean@beacon.test','agent@beacon.test'),
  ('Cascade Logistics',  'Owen Pratt',     'Operations Mgr',   '(503) 555-0164','owen@cascadelog.test',   'Portland','OR','97204','Multnomah','4213','Fleet of 62, workers comp focus','OR Transport List','88','80','62','$27.4M','13','$188,000','WC x-date is the opener. Good fit.',                       18, 5, 'Q3 X-Date Renewals','xdate',   'The Hartford',         'sean@beacon.test','agent@beacon.test'),
  ('Northgate Medical',  'Dr. Ana Ruiz',   'Practice Admin',   '(208) 555-0198','ana@northgatemed.test',  'Meridian','ID','83642','Ada','8011','Med practice, prof liability','ID Professional List','41','38','12','$9.6M','9','$71,500','Professional liability x-date in March.',                  25, 8, 'Life X-Date Profile','profile','Cincinnati Insurance', 'mike@beacon.test','agent@beacon.test')
) as v(company_name, contact_name, contact_title, phone, email, city, state, zip, county, sic, descr, list_source, employees, covered, autos, volume, yrs, premium, notes, age_days, worked_days, project_name, status_code, agency_name, ae_email, dv_email)
join public.projects p       on p.name = v.project_name
join public.lead_statuses s  on s.code = v.status_code
left join public.agencies a  on a.name = v.agency_name
left join public.users ae    on ae.email = v.ae_email
left join public.users dv    on dv.email = v.dv_email;

-- Generated volume so list views, counts and reports look real.
insert into public.leads (
  project_id, status_id, agency_id, assigned_user_id,
  company_name, contact_name, contact_title, phone, email,
  city, state, zip, sic_code, list_source, description,
  employees, covered_employees, autos, sales_volume, years_in_business,
  estimated_annual_premium, lead_date, import_date, date_last_worked
)
select
  p.id,
  s.id,
  a.id,
  ae.id,
  fc.first_part || ' ' || fc.second_part,
  fn.name,
  (array['Owner','Principal','CFO','Operations Mgr','Controller','President','Office Mgr','Risk Manager'])[1 + (g % 8)],
  '(' || (200 + (g * 7) % 700)::text || ') 555-0' || lpad(((g * 37) % 900 + 99)::text, 3, '0'),
  lower(replace(fc.first_part, '''', '')) || g::text || '@example.test',
  loc.city, loc.state, loc.zip,
  (array['6411','6311','6331','1731','4213','5211','8011','2411','3441','7349'])[1 + (g % 10)],
  loc.state || ' Commercial List',
  'Imported lead — ' || loc.city || ', ' || loc.state,
  (8 + (g * 13) % 240)::text,
  (6 + (g * 11) % 200)::text,
  ((g * 5) % 70)::text,
  '$' || (1 + (g * 3) % 40)::text || '.' || ((g * 7) % 10)::text || 'M',
  (3 + (g * 3) % 40)::text,
  '$' || ((12 + (g * 9) % 200) * 1000)::text,
  now() - ((g % 120) || ' days')::interval,
  now() - ((g % 120) + 6 || ' days')::interval,
  now() - ((g % 30) || ' days')::interval
from generate_series(1, 108) as g
cross join lateral (
  select (array['Summit','Ridgeline','Blue River','Copper Creek','Granite','Harborview','Ironwood','Lakeshore','Meadowbrook','Northstar','Old Mill','Pinehurst','Quarry','Redstone','Silverton','Timberline','Union Square','Valley Forge','Westgate','Yellow Birch'])[1 + (g % 20)] as first_part,
         (array['Group','Partners','Holdings','Industries','Services','Contracting','Logistics','Manufacturing','Associates','Enterprises'])[1 + (g % 10)] as second_part
) fc
cross join lateral (
  select (array['Marcus Webb','Elena Ortiz','Grant Halvorsen','Priya Raman','Dale Whitmore','Nora Kessler','Victor Amaya','Beth Lindqvist','Omar Haddad','Jill Trenton','Carl Boyd','Sophia Marsh'])[1 + (g % 12)] as name
) fn
cross join lateral (
  select * from (values
    ('Phoenix','AZ','85016'),('Tucson','AZ','85718'),('Cedar Rapids','IA','52402'),
    ('Des Moines','IA','50309'),('Denver','CO','80202'),('Colorado Springs','CO','80903'),
    ('Omaha','NE','68114'),('Lincoln','NE','68508'),('Salt Lake City','UT','84101'),
    ('Provo','UT','84601'),('Boise','ID','83702'),('Spokane','WA','99201'),
    ('Fargo','ND','58103'),('Wichita','KS','67206'),('Portland','OR','97204')
  ) as l(city, state, zip) offset (g % 15) limit 1
) loc
cross join lateral (
  select id, row_number() over (order by id) rn from public.lead_statuses
) s_all
join public.lead_statuses s on s.id = s_all.id and s_all.rn = 1 + (g % 6)
cross join lateral (
  select id from public.projects order by id offset (g % 6) limit 1
) p
cross join lateral (
  select id from public.agencies order by id offset (g % 8) limit 1
) a
cross join lateral (
  select id from public.users where role = 'manager' order by id offset (g % 3) limit 1
) ae;

-- ---------------------------------------------------------------------------
-- Insurance detail (X-dates) for the hero leads
-- ---------------------------------------------------------------------------
insert into public.insurance_details (
  lead_id, agency_name, ultimate_xdate, pkg_xdate, pkg_carrier, wc_xdate, wc_carrier,
  auto_xdate, auto_carrier, health_xdate, health_carrier, covered_employees, autos
)
select l.id, v.agency, v.ult::date, v.pkg::date, v.pkgc, v.wc::date, v.wcc,
       v.auto::date, v.autoc, v.health::date, v.healthc, l.covered_employees, l.autos
from (values
  ('Garry Insurance',   'Travelers',            '2026-10-14','2026-10-14','Travelers',           '2026-11-01','The Hartford','2026-10-14','Travelers',           '2027-01-01','Nationwide'),
  ('Rural Insurance',   'EMC Insurance',        '2026-11-02','2026-11-02','EMC Insurance',       '2026-12-15','Acuity',      '2026-11-02','EMC Insurance',       '2027-01-01','Nationwide'),
  ('Insurance Pro AZ',  'The Hartford',         '2026-09-29','2026-09-29','The Hartford',        '2026-09-29','The Hartford','2026-10-30','Travelers',           '2027-02-01','Nationwide'),
  ('Summit Benefits',   'Nationwide',           '2026-12-11','2027-01-01','Nationwide',          '2027-01-01','Nationwide',  '2027-01-01','Nationwide',          '2026-12-11','Nationwide'),
  ('Heartland Wealth',  'Cincinnati Insurance', '2026-10-30','2026-10-30','Cincinnati Insurance','2026-11-30','West Bend Mutual','2026-10-30','Cincinnati Insurance','2027-03-01','Nationwide'),
  ('Bender Group',      'West Bend Mutual',     '2026-11-18','2026-11-18','West Bend Mutual',    '2026-11-18','West Bend Mutual','2026-11-18','West Bend Mutual','2027-01-01','Nationwide'),
  ('Zimmermann Agency', 'Travelers',            '2026-09-24','2026-09-24','Travelers',           '2026-10-01','Travelers',   '2026-09-24','Travelers',           '2027-01-01','Nationwide'),
  ('Meridian Partners', 'Berkshire Hathaway',   '2026-12-03','2026-12-03','Berkshire Hathaway',  '2027-01-15','Travelers',   '2026-12-03','Berkshire Hathaway',  '2027-01-01','Nationwide'),
  ('Foxline Insurance', 'Nationwide',           '2027-01-09','2027-01-09','Nationwide',          '2027-02-01','Acuity',      '2027-01-09','Nationwide',          '2027-01-09','Nationwide'),
  ('Cascade Logistics', 'The Hartford',         '2026-10-20','2026-10-20','The Hartford',        '2026-10-20','The Hartford','2026-11-05','Travelers',           '2027-01-01','Nationwide'),
  ('Northgate Medical', 'Cincinnati Insurance', '2027-03-01','2027-03-01','Cincinnati Insurance','2027-03-01','Acuity',      '2027-03-01','Cincinnati Insurance','2027-03-01','Nationwide')
) as v(company, agency, ult, pkg, pkgc, wc, wcc, auto, autoc, health, healthc)
join public.leads l on l.company_name = v.company;

-- ---------------------------------------------------------------------------
-- Appointments — today, tomorrow, and recent history
-- ---------------------------------------------------------------------------
insert into public.appointments
  (lead_id, user_id, rep_name, rep_first_name, rep_last_name, appt_date, appt_time,
   duration_min, status_id, list_source, appt_create_date, qa_date)
select l.id, u.id, v.rep, split_part(v.rep,' ',1), split_part(v.rep,' ',2),
       (current_date + v.day_offset), v.tm, v.dur,
       (select id from public.appointment_statuses where name = v.status),
       l.list_source, now() - interval '3 days', now() - interval '2 days'
from (values
  ('Garry Insurance',   'Sean Fitzgerald', 0,  '9:30 AM',  30, 'Confirmed'),
  ('Rural Insurance',   'Mike Preston',    0,  '11:00 AM', 45, 'Confirmed'),
  ('Insurance Pro AZ',  'Rachel Colestock',0,  '1:15 PM',  30, 'Scheduled'),
  ('Summit Benefits',   'Sean Fitzgerald', 0,  '3:45 PM',  30, 'Scheduled'),
  ('Bender Group',      'Sean Fitzgerald', 1,  '10:00 AM', 30, 'Scheduled'),
  ('Meridian Partners', 'Mike Preston',    1,  '2:30 PM',  45, 'Scheduled'),
  ('Zimmermann Agency', 'Rachel Colestock',2,  '9:00 AM',  30, 'Scheduled'),
  ('Cascade Logistics', 'Sean Fitzgerald', 3,  '1:00 PM',  45, 'Scheduled'),
  ('Foxline Insurance', 'Sean Fitzgerald', 4,  '11:30 AM', 30, 'Scheduled'),
  ('Northgate Medical', 'Mike Preston',    -3, '10:15 AM', 30, 'Held'),
  ('Heartland Wealth',  'Mike Preston',    -5, '2:00 PM',  45, 'Held'),
  ('Collier & Co.',     'Rachel Colestock',-8, '9:45 AM',  30, 'No Show')
) as v(company, rep, day_offset, tm, dur, status)
join public.leads l on l.company_name = v.company
join public.users u on u.first_name || ' ' || u.last_name = v.rep;

-- Historical appointment volume for reports.
insert into public.appointments
  (lead_id, user_id, rep_name, appt_date, appt_time, duration_min, status_id, appt_create_date)
select l.id, u.id, u.first_name || ' ' || u.last_name,
       current_date - ((g % 75) + 5),
       (array['9:00 AM','10:30 AM','1:00 PM','2:15 PM','3:30 PM','4:00 PM'])[1 + (g % 6)],
       (array[30,45,60])[1 + (g % 3)],
       (select id from public.appointment_statuses where name = (array['Held','Held','Held','Confirmed','Rescheduled','Cancelled','No Show'])[1 + (g % 7)]),
       now() - ((g % 75) + 8 || ' days')::interval
from generate_series(1, 90) as g
cross join lateral (select id, list_source, company_name from public.leads order by id offset (g % 100) limit 1) l
cross join lateral (select id, first_name, last_name from public.users where role='manager' order by id offset (g % 3) limit 1) u;

-- ---------------------------------------------------------------------------
-- Call records (QA screen)
-- ---------------------------------------------------------------------------
insert into public.call_records (lead_id, project_id, user_id, call_date, call_result, notes, qa_score, qa_result, qa_date)
select l.id, l.project_id, u.id,
       now() - ((g % 21) || ' days')::interval - ((g * 17 % 600) || ' minutes')::interval,
       (array['Appointment set','Callback requested','Not interested','Left voicemail','Wrong number','Gatekeeper','X-date captured','Do not call'])[1 + (g % 8)],
       (array['Good conversation, decision maker engaged.','Asked for a callback next quarter.','Happy with current carrier.','VM left, will retry Thursday.','Number disconnected — needs scrub.','Blocked at reception, try direct dial.','Captured ultimate x-date and carrier.','Requested removal from list.'])[1 + (g % 8)],
       score.v,
       case when score.v >= 85 then 'Passed' when score.v >= 70 then 'Review' else 'Failed' end,
       now() - ((g % 21) || ' days')::interval
from generate_series(1, 120) as g
cross join lateral (select id, project_id from public.leads order by id offset (g % 110) limit 1) l
cross join lateral (select id from public.users where role in ('agent','manager') order by id offset (g % 5) limit 1) u
cross join lateral (select 58 + ((g * 29) % 42) as v) score;

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
insert into public.feedback (appointment_id, lead_id, user_id, nature_id, fb_status_id, rating, content, additional_comment, submitted_by, created_at)
select a.id, a.lead_id,
       (select id from public.users where email='client@beacon.test'),
       (select id from public.nature_of_enquiry where name = v.nature),
       (select id from public.fb_statuses where name = v.status),
       v.rating, v.content, v.comment, v.who, now() - (v.age || ' days')::interval
from (values
  ('Garry Insurance',   'Appointment quality', 'Resolved',  5, 'Appointment was well qualified and the contact was expecting the call.', 'Great prep packet.',              'Jeff Garry',   2),
  ('Rural Insurance',   'Lead accuracy',       'Open',      4, 'Good lead, though the employee count was a little off.',                 'Otherwise accurate.',             'Laura Meyer',  5),
  ('Insurance Pro AZ',  'Rep professionalism', 'Resolved',  5, 'Rachel was excellent — very professional and well briefed.',             'Would like her on future work.',  'Jeff Matthews',8),
  ('Summit Benefits',   'Scheduling',          'In review', 3, 'Appointment time slipped twice before it stuck.',                        'Please confirm 24h ahead.',       'Brian Vicini', 11),
  ('Heartland Wealth',  'Data completeness',   'Resolved',  4, 'Profile was thorough, missing only the current 401(k) provider.',        'Easy to follow up on.',           'Dana Zinda',   14),
  ('Meridian Partners', 'General',             'Closed',    5, 'Very happy with the first month of the campaign.',                       'Keep it going.',                  'Paula Reyes',  20)
) as v(company, nature, status, rating, content, comment, who, age)
join public.leads l on l.company_name = v.company
join public.appointments a on a.lead_id = l.id
where a.id = (select min(id) from public.appointments where lead_id = l.id);

-- ---------------------------------------------------------------------------
-- Bulletin board
-- ---------------------------------------------------------------------------
insert into public.bulletin_board (message, message_type, status, user_id, project_id, created_at)
values
  ('Q3 x-date push ends Friday — get remaining Garry Insurance renewals dialed.', 'AL', 'active',
   (select id from public.users where email='sean@beacon.test'),
   (select id from public.projects where name='Q3 X-Date Renewals'), now() - interval '4 hours'),
  ('New IA list loaded for Rural Insurance — 240 records, please QA the first 20.', 'IN', 'active',
   (select id from public.users where email='mike@beacon.test'),
   (select id from public.projects where name='Appt Setting — P&C'), now() - interval '1 day'),
  ('Reminder: log every x-date in the insurance detail panel, not the notes field.', 'IN', 'active',
   (select id from public.users where email='admin@beacon.test'), null, now() - interval '2 days'),
  ('Medicare AEP starts Oct 15 — Summit Benefits scripts are in Documents.', 'IN', 'active',
   (select id from public.users where email='sean@beacon.test'),
   (select id from public.projects where name='Medicare AEP Push'), now() - interval '3 days'),
  ('Life X-Date Profile is paused pending client budget approval.', 'AL', 'archived',
   (select id from public.users where email='mike@beacon.test'),
   (select id from public.projects where name='Life X-Date Profile'), now() - interval '9 days');

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
insert into public.documents (name, file_type, size_bytes, company_id, project_id, uploaded_by, created_at)
values
  ('Garry-Q3-Renewal-List.csv',      'CSV',  184320,  (select id from public.companies where name='Garry Insurance'),  (select id from public.projects where name='Q3 X-Date Renewals'), (select id from public.users where email='sean@beacon.test'),  now() - interval '6 days'),
  ('Rural-Insurance-Agreement.pdf',  'PDF',  742400,  (select id from public.companies where name='Rural Insurance'),  (select id from public.projects where name='Appt Setting — P&C'), (select id from public.users where email='mike@beacon.test'),  now() - interval '21 days'),
  ('Medicare-AEP-Call-Script.docx',  'DOCX', 51200,   (select id from public.companies where name='Summit Benefits'),  (select id from public.projects where name='Medicare AEP Push'),   (select id from public.users where email='sean@beacon.test'),  now() - interval '11 days'),
  ('Survey-Campaign-Brief.pdf',      'PDF',  333824,  (select id from public.companies where name='Insurance Pro AZ'), (select id from public.projects where name='Survey Campaign'),      (select id from public.users where email='rachel@beacon.test'),now() - interval '30 days'),
  ('QA-Scorecard-Template.docx',     'DOCX', 40960,   null, null, (select id from public.users where email='admin@beacon.test'), now() - interval '45 days'),
  ('Heartland-Profile-Export.csv',   'CSV',  96256,   (select id from public.companies where name='Heartland Wealth'), (select id from public.projects where name='Life X-Date Profile'),  (select id from public.users where email='mike@beacon.test'),  now() - interval '15 days'),
  ('Beacon-Logo-Pack.png',           'PNG',  225280,  null, null, (select id from public.users where email='admin@beacon.test'), now() - interval '60 days');

-- ---------------------------------------------------------------------------
-- Import batches
-- ---------------------------------------------------------------------------
insert into public.import_batches (file_name, source, project_id, row_count, imported_count, error_count, status, imported_by, created_at)
values
  ('az-commercial-q3.csv',   'InfoUSA',      (select id from public.projects where name='Q3 X-Date Renewals'),  1240, 1218, 22, 'completed', (select id from public.users where email='sean@beacon.test'),  now() - interval '6 days'),
  ('ia-farm-bureau.csv',     'Farm Bureau',  (select id from public.projects where name='Appt Setting — P&C'),   980,  972,  8, 'completed', (select id from public.users where email='mike@beacon.test'),  now() - interval '12 days'),
  ('co-benefits-aep.csv',    'InfoUSA',      (select id from public.projects where name='Medicare AEP Push'),    1560, 1503, 57, 'completed', (select id from public.users where email='sean@beacon.test'),  now() - interval '18 days'),
  ('ut-commercial.csv',      'D&B',          (select id from public.projects where name='Commercial Outbound'),   640,    0,  0, 'pending',   (select id from public.users where email='mike@beacon.test'),  now() - interval '1 day'),
  ('az-southern-survey.csv', 'InfoUSA',      (select id from public.projects where name='Survey Campaign'),       720,  701, 19, 'completed', (select id from public.users where email='rachel@beacon.test'),now() - interval '25 days');

-- ---------------------------------------------------------------------------
-- Alert engine (the legacy MailAlert feature, modernized)
-- ---------------------------------------------------------------------------
insert into public.alert_rules (name, trigger, channel, recipients, enabled) values
  ('X-date 30-day warning',   'xdate_30d',     'email', 'account-managers@beacon.test', true),
  ('New appointment set',     'appt_created',  'email', 'ops@beacon.test',             true),
  ('Appointment reminder',    'appt_reminder', 'email', 'reps@beacon.test',            true),
  ('Hot lead assigned',       'hot_lead',      'inapp', null,                          true),
  ('Daily import summary',    'import_done',   'email', 'admin@beacon.test',           true),
  ('Client feedback received','feedback_new',  'email', 'admin@beacon.test',           false);

insert into public.alert_log (rule_id, subject, detail, status, created_at)
select r.id, v.subject, v.detail, v.status, now() - (v.age || ' hours')::interval
from (values
  ('X-date 30-day warning',    'X-date approaching: Insurance Pro AZ',  'Ultimate x-date 2026-09-29 is within 30 days.',          'sent',   3),
  ('New appointment set',      'Appointment set: Garry Insurance',      'Sean Fitzgerald set a 9:30 AM appointment.',             'sent',   7),
  ('Appointment reminder',     'Reminder: 4 appointments today',        'Daily reminder dispatched to 3 reps.',                   'sent',  11),
  ('Hot lead assigned',        'Hot lead: Zimmermann Agency',           'Assigned to Rachel Colestock.',                          'sent',  26),
  ('Daily import summary',     'Import complete: az-commercial-q3.csv', '1218 of 1240 rows imported, 22 errors.',                 'sent',  50),
  ('X-date 30-day warning',    'X-date approaching: Zimmermann Agency', 'Ultimate x-date 2026-09-24 is within 30 days.',          'sent',  74),
  ('New appointment set',      'Appointment set: Bender Group',         'Sean Fitzgerald set a 10:00 AM appointment.',            'failed',98)
) as v(rule, subject, detail, status, age)
join public.alert_rules r on r.name = v.rule;

-- ---------------------------------------------------------------------------
-- IP whitelist + settings
-- ---------------------------------------------------------------------------
insert into public.ip_whitelist (ip_address, label) values
  ('45.61.157.16',  'Production office'),
  ('72.14.201.88',  'Scottsdale office'),
  ('10.0.0.0/8',    'Internal VPN');

insert into public.app_settings (key, value) values
  ('organization', '{"name":"Signature Marketing","email":"info@signaturemktg.net","phone":"(480) 555-0100","timezone":"MST"}'::jsonb),
  ('security',     '{"ip_lockdown":true,"session_timeout_min":60,"password_min_length":10}'::jsonb),
  ('mail',         '{"provider":"smtp","from":"alerts@signaturemktg.net","host":"smtp.office365.com","port":587}'::jsonb),
  ('branding',     '{"primary":"#2b57c9","accent":"#38bdf8","logo":"/logo.svg"}'::jsonb);

-- ---------------------------------------------------------------------------
-- X-dates for the generated leads. Renewal dates are the core of this product,
-- so every lead carries one rather than only the hand-written records.
-- ---------------------------------------------------------------------------
insert into public.insurance_details (
  lead_id, agency_name, ultimate_xdate, pkg_xdate, pkg_carrier,
  wc_xdate, wc_carrier, auto_xdate, auto_carrier, covered_employees, autos
)
select
  l.id,
  a.name,
  d.ult,
  d.ult,
  a.name,
  d.ult + 45,
  a.name,
  d.ult,
  a.name,
  l.covered_employees,
  l.autos
from public.leads l
join public.agencies a on a.id = l.agency_id
cross join lateral (
  select (current_date + (((l.id * 17) % 300)::int) - 30)::date as ult
) d
where not exists (select 1 from public.insurance_details i where i.lead_id = l.id);

