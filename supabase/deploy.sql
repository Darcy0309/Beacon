-- Lighthouse CRM — full database setup for a hosted Supabase project.
-- Generated from supabase/migrations/* + supabase/seed.sql by `npm run db:bundle`. Run once in the SQL Editor.
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

-- ===== supabase/migrations/20260922100000_security_and_activity.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — retire IP lockdown, add activity logging
--
-- The legacy app pinned each user to an IP address, which broke whenever
-- somebody worked from a different desk and did nothing against a stolen
-- password. It is replaced by two-factor authentication (TOTP), which
-- Supabase Auth stores in the auth schema — so there is nothing to add here
-- beyond a way for administrators to see who has it switched on.
--
-- The activity log answers "how much is this account actually using the
-- system": every sign-in, and the record changes that matter.
-- ---------------------------------------------------------------------------

-- --- IP lockdown, removed -------------------------------------------------
drop policy if exists ip_whitelist_read on public.ip_whitelist;
drop policy if exists ip_whitelist_write on public.ip_whitelist;
drop table if exists public.ip_whitelist;
alter table public.users drop column if exists ip_locked;

-- --- Two-factor status ----------------------------------------------------
-- auth.mfa_factors is not exposed through the API, so this reads it on the
-- caller's behalf: administrators and managers see every account's status,
-- everyone else sees only their own.
create or replace function public.mfa_status()
returns table (user_id bigint, enabled boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id,
         exists (select 1 from auth.mfa_factors f
                  where f.user_id = u.auth_id and f.status = 'verified')
    from public.users u
   where public.is_manager() or u.auth_id = auth.uid();
$$;

grant execute on function public.mfa_status() to authenticated;

-- --- Activity log ---------------------------------------------------------
create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  user_id    bigint references public.users(id) on delete set null,
  action     text not null,                 -- sign_in, sign_out, lead.create, …
  entity     text,                          -- lead, project, user, …
  entity_id  bigint,
  detail     text,                          -- a short human-readable summary
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_created_idx on public.activity_log (user_id, created_at desc);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

-- Anyone may record their own activity; nobody may rewrite history.
create policy activity_log_insert_self on public.activity_log
  for insert to authenticated
  with check (user_id = public.app_user_id());

-- Staff leaders see everything, everyone else sees only their own trail.
create policy activity_log_read on public.activity_log
  for select to authenticated
  using (public.is_manager() or user_id = public.app_user_id());

grant select, insert on public.activity_log to authenticated;

/**
 * Per-user activity roll-up for the administration screen: sign-ins this
 * calendar month, sign-ins in the last 30 days, total recorded actions and
 * when the account was last seen.
 */
create or replace function public.activity_summary()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'last_active' desc nulls last), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'user_id',        u.id,
               'first_name',     u.first_name,
               'last_name',      u.last_name,
               'email',          u.email,
               'role',           u.role,
               'logins_month',   count(*) filter (where a.action = 'sign_in' and a.created_at >= date_trunc('month', now())),
               'logins_30d',     count(*) filter (where a.action = 'sign_in' and a.created_at >= now() - interval '30 days'),
               'actions_30d',    count(*) filter (where a.action <> 'sign_in' and a.created_at >= now() - interval '30 days'),
               'last_active',    max(a.created_at)
             ) as x
        from public.users u
        left join public.activity_log a on a.user_id = u.id
       group by u.id, u.first_name, u.last_name, u.email, u.role
    ) t;
$$;

grant execute on function public.activity_summary() to authenticated;

-- ===== supabase/migrations/20260924100000_lead_sheet_fields.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the last three lead-sheet fields
--
-- The client's own lead sheet and their export both carry a fax number, the
-- decision maker's title and a professionals count. Everything else on that
-- sheet already had a column here; these three did not.
-- ---------------------------------------------------------------------------

alter table public.leads add column if not exists fax           text;
alter table public.leads add column if not exists dm_title      text;
alter table public.leads add column if not exists professionals text;

-- ---------------------------------------------------------------------------
-- The dispositions their call sheets actually use. Without these, every
-- "Not Interested", "Disconnected" and "Out of Business" record imports as
-- "New", which overstates the live pipeline by a wide margin.
-- ---------------------------------------------------------------------------
insert into public.lead_statuses (code, name) values
  ('not_interested', 'Not interested'),
  ('disconnected',   'Disconnected number'),
  ('out_of_business','Out of business')
on conflict (code) do nothing;

-- ===== supabase/migrations/20260924110000_activity_log_grants.sql =====
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

-- ===== supabase/migrations/20260927100000_lead_explorer.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the lead explorer
--
-- Querying the whole book at once: pick an industry, some ZIP codes and a
-- renewal month, and get back the matching leads, how many there are, and
-- whose book they sit on. The old system could not do this, and it is the
-- question the business actually asks ("every plumber in these ZIPs renewing
-- in July, and which clients they belong to").
--
-- One call returns the page of rows, the total and every breakdown. Runs as
-- the caller, so Row Level Security scopes it exactly like any other query:
-- a client only ever explores their own leads.
-- ---------------------------------------------------------------------------

-- Their imported book is mostly 1711; without this the industry filter would
-- show a bare code with no name against it.
insert into public.sic_codes (code, description) values
  ('1711', 'Plumbing, Heating & Air-Conditioning'),
  ('1721', 'Painting & Paper Hanging'),
  ('1761', 'Roofing, Siding & Sheet Metal Work'),
  ('1791', 'Structural Steel Erection'),
  ('7349', 'Building Cleaning & Maintenance')
on conflict (code) do nothing;

create or replace function public.lead_explore(
  criteria jsonb default '{}'::jsonb,
  page int default 1,
  per_page int default 10
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'statuses',  '[]'::jsonb)))          as statuses,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select (jsonb_array_elements_text(coalesce(criteria->'carriers', '[]'::jsonb)))::bigint) as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      -- Escape the LIKE wildcards so a literal % or _ matches itself.
      nullif('%' || regexp_replace(btrim(coalesce(criteria->>'q', '')), '([%_\\])', '\\\1', 'g') || '%', '%%') as q
  ),
  m as (
    select l.id, l.company_name, l.contact_name, l.phone, l.email,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           co.id as client_id, co.name as client_name,
           ag.name as carrier_name,
           st.code as status_code, st.name as status_name,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.lead_statuses st on st.id = l.status_id
      left join public.users u      on u.id  = l.assigned_user_id
     where (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.statuses) = 0 or st.code            = any(c.statuses))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
       and (cardinality(c.carriers) = 0 or l.agency_id        = any(c.carriers))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       and (cardinality(c.months)   = 0 or extract(month from ins.ultimate_xdate)::int = any(c.months))
       and (c.q is null
            or l.company_name ilike c.q or l.contact_name ilike c.q
            or l.phone ilike c.q or l.email ilike c.q or l.city ilike c.q)
  ),
  win as (
    select * from m
     order by lead_date desc nulls last, id desc
     limit greatest(coalesce(per_page, 10), 1)
    offset greatest(coalesce(page, 1) - 1, 0) * greatest(coalesce(per_page, 10), 1)
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win)), '[]'::jsonb) from win),
    -- "How many, and whose book are they on" — the question he asked for.
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from ultimate_xdate)::int as mon, count(*) as n
                            from m where ultimate_xdate is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('code', t.status_code, 'label', coalesce(t.status_name, '—'), 'count', t.n)
                                            order by t.n desc), '[]'::jsonb)
                    from (select status_code, status_name, count(*) as n from m group by status_code, status_name) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where ultimate_xdate is not null)
  );
$$;

-- The values actually present in the caller's book, for the criteria pickers.
-- Built from the leads themselves, so no filter ever offers a dead end.
create or replace function public.lead_explore_options()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.sic_code, 'label', coalesce(s.description, t.sic_code), 'count', t.n)
                                             order by t.n desc), '[]'::jsonb)
                     from (select sic_code, count(*) as n from public.leads where sic_code is not null group by sic_code) t
                     left join public.sic_codes s on s.code = t.sic_code),
    'states',     (select coalesce(jsonb_agg(jsonb_build_object('value', t.state, 'label', t.state, 'count', t.n)
                                             order by t.state), '[]'::jsonb)
                     from (select state, count(*) as n from public.leads where state is not null group by state) t),
    'counties',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.county, 'label', t.county, 'count', t.n)
                                             order by t.county), '[]'::jsonb)
                     from (select county, count(*) as n from public.leads where county is not null group by county) t),
    'statuses',   (select coalesce(jsonb_agg(jsonb_build_object('value', code, 'label', name) order by id), '[]'::jsonb)
                     from public.lead_statuses),
    'clients',    (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from public.companies),
    'carriers',   (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from public.agencies where name is not null),
    'reps',       (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', nullif(concat_ws(' ', first_name, last_name), '')) order by first_name, last_name), '[]'::jsonb)
                     from public.users where role in ('admin', 'manager', 'agent'))
  );
$$;

grant execute on function public.lead_explore(jsonb, int, int), public.lead_explore_options() to authenticated;

-- ===== supabase/migrations/20260928100000_notifications.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — in-app notifications
--
-- Staff across two offices and at home are reached by email today, and nobody
-- can tell whether a message was seen. This gives every user an inbox behind
-- the bell in the top bar:
--
--   * Events raise notifications on their own — an appointment set, leads
--     assigned, an import finished, client feedback, an announcement posted.
--     Each follows its switch on the Alert Engine page, and every one that
--     fires is written to the alert log.
--   * Administrators and account managers can message people or whole roles
--     directly, and see who has read it.
--
-- New rows are published to Supabase Realtime, so the bell updates and pops
-- up the moment something arrives. Row Level Security keeps each inbox to
-- its owner; Realtime applies the same policies.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users(id) on delete cascade,  -- recipient
  sender_id   bigint references public.users(id) on delete set null,          -- who caused it
  batch_id    uuid,                                                           -- one direct message sent to many
  kind        text not null default 'message'
              check (kind in ('message','appointment','lead','feedback','import','bulletin','system')),
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_inbox  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread on public.notifications (user_id) where read_at is null;
create index if not exists notifications_batch  on public.notifications (batch_id) where batch_id is not null;
create index if not exists notifications_sender on public.notifications (sender_id, created_at desc) where batch_id is not null;

alter table public.notifications enable row level security;

-- Your own inbox, plus the direct messages you sent (for read receipts).
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (user_id = public.app_user_id()
         or (batch_id is not null and sender_id = public.app_user_id()));

-- Recipients may mark their own notifications read — and change nothing else.
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- Rows are only ever created by the functions below, never inserted directly.
revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- The two rules the old engine never had.
insert into public.alert_rules (name, trigger, channel, recipients, enabled)
select v.name, v.trigger, 'inapp', null, true
  from (values ('Lead assigned to you', 'lead_assigned'),
               ('Announcement posted',  'bulletin_posted')) as v(name, trigger)
 where not exists (select 1 from public.alert_rules r where r.trigger = v.trigger);

-- ---------------------------------------------------------------------------
-- Delivery. Internal: only the triggers and send_notification() call this.
-- Skips a rule that has been switched off, skips inactive accounts, never
-- notifies the person who caused the event, and logs what it sent.
-- ---------------------------------------------------------------------------
create or replace function public.notify_users(
  p_recipients bigint[],
  p_kind       text,
  p_title      text,
  p_body       text,
  p_link       text,
  p_rule       text default null,
  p_batch      uuid default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_rule_id bigint;
  v_enabled boolean;
  v_actor   bigint := public.app_user_id();
  v_count   int;
begin
  if p_rule is not null then
    select id, enabled into v_rule_id, v_enabled
      from public.alert_rules where trigger = p_rule order by id limit 1;
    if v_rule_id is not null and not v_enabled then
      return 0;
    end if;
  end if;

  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, link)
  select u.id, v_actor, p_batch, p_kind, left(p_title, 160), left(p_body, 1000), p_link
    from public.users u
   where u.id = any(p_recipients)
     and u.status = 'active'
     and u.id is distinct from v_actor;
  get diagnostics v_count = row_count;

  if v_count > 0 and v_rule_id is not null then
    insert into public.alert_log (rule_id, subject, detail, status)
    values (v_rule_id, left(p_title, 200),
            format('In-app to %s %s', v_count, case when v_count = 1 then 'person' else 'people' end),
            'sent');
  end if;
  return v_count;
end $$;

revoke execute on function public.notify_users(bigint[], text, text, text, text, text, uuid) from public, anon, authenticated;

/** "Sean Fitzgerald", or null when there is no signed-in user (a system job). */
create or replace function public.actor_name()
returns text
language sql stable security definer set search_path = public as $$
  select nullif(concat_ws(' ', first_name, last_name), '') from public.users where id = public.app_user_id();
$$;
revoke execute on function public.actor_name() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Appointments set → admins, the project's account manager, the lead's rep,
-- and the client's own portal users. Statement-level, so an import that
-- creates fifty appointments sends one summary per client, not fifty.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_appointments()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_to bigint[];
begin
  for r in
    select p.company_id,
           min(co.name) as company,
           count(*) as n,
           min(a.appt_date) as first_date,
           max(a.appt_date) as last_date,
           array_agg(distinct p.id) filter (where p.id is not null) as project_ids,
           array_agg(distinct l.assigned_user_id) filter (where l.assigned_user_id is not null) as reps,
           (array_agg(l.company_name order by a.appt_date, a.id))[1] as lead_name,
           (array_agg(a.appt_time order by a.appt_date, a.id))[1] as first_time
      from new_rows a
      left join public.leads l     on l.id  = a.lead_id
      left join public.projects p  on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
     group by p.company_id
  loop
    v_to := array(
      select id from public.users where role = 'admin'
      union
      select pa.ae_user_id from public.project_assignments pa
       where pa.project_id = any(r.project_ids) and pa.ae_user_id is not null
      union
      select u.id from public.users u
       where u.role = 'client' and r.company_id is not null and u.company_id = r.company_id
      union
      select unnest(r.reps)
    );
    perform public.notify_users(
      v_to, 'appointment',
      case when r.n = 1 then 'Appointment set: ' || coalesce(r.lead_name, 'a lead')
           else r.n || ' appointments set' || coalesce(' for ' || r.company, '') end,
      case when r.n = 1
           then concat_ws(' · ',
                  to_char(r.first_date, 'Dy Mon FMDD') || coalesce(' at ' || r.first_time, ''),
                  r.company,
                  'set by ' || public.actor_name())
           else concat_ws(' · ',
                  to_char(r.first_date, 'Mon FMDD') || ' – ' || to_char(r.last_date, 'Mon FMDD'),
                  'set by ' || public.actor_name()) end,
      '/calendar?view=' || case when r.n = 1 then 'day' else 'month' end
        || '&d=' || coalesce(r.first_date, current_date)::text,
      'appt_created');
  end loop;
  return null;
end $$;

drop trigger if exists notify_appointments on public.appointments;
create trigger notify_appointments
  after insert on public.appointments
  referencing new table as new_rows
  for each statement execute function public.tg_notify_appointments();

-- ---------------------------------------------------------------------------
-- Leads assigned → the rep they were assigned to. Grouped per rep, so a bulk
-- import or reassignment sends "12 leads assigned to you", not twelve pings.
-- Hot leads follow the "Hot lead assigned" rule; the rest "Lead assigned".
-- ---------------------------------------------------------------------------
create or replace function public.notify_lead_assignment(
  p_user bigint, p_hot boolean, p_n bigint, p_lead bigint, p_name text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_link text;
begin
  select role into v_role from public.users where id = p_user;
  -- Managers work from Clients and the Lead Explorer rather than the leads
  -- list, so their link lands where they can open it.
  v_link := case
    when v_role = 'manager' then '/explore?reps=' || p_user || case when p_hot then '&statuses=hot' else '' end
    when p_n = 1            then '/leads/' || p_lead
    else '/leads' || case when p_hot then '?status=hot' else '' end
  end;
  perform public.notify_users(
    array[p_user], 'lead',
    case when p_n = 1 then (case when p_hot then 'Hot lead assigned to you: ' else 'Lead assigned to you: ' end) || coalesce(p_name, 'a lead')
         else p_n || case when p_hot then ' hot leads' else ' leads' end || ' assigned to you' end,
    coalesce('Assigned by ' || public.actor_name(), 'Assigned automatically'),
    v_link,
    case when p_hot then 'hot_lead' else 'lead_assigned' end);
end $$;
revoke execute on function public.notify_lead_assignment(bigint, boolean, bigint, bigint, text) from public, anon, authenticated;

create or replace function public.tg_notify_leads_assigned()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- Each branch is only planned when it runs, so the INSERT path never
  -- touches old_rows, which an insert trigger does not have.
  if tg_op = 'INSERT' then
    for r in
      select n.assigned_user_id as uid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
       group by 1, 2
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name);
    end loop;
  else
    for r in
      select n.assigned_user_id as uid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        join old_rows o on o.id = n.id
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
         and n.assigned_user_id is distinct from o.assigned_user_id
       group by 1, 2
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists notify_leads_assigned_ins on public.leads;
create trigger notify_leads_assigned_ins
  after insert on public.leads
  referencing new table as new_rows
  for each statement execute function public.tg_notify_leads_assigned();

drop trigger if exists notify_leads_assigned_upd on public.leads;
create trigger notify_leads_assigned_upd
  after update on public.leads
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.tg_notify_leads_assigned();

-- ---------------------------------------------------------------------------
-- Imports finished → administrators.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_import()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_users(
    array(select id from public.users where role = 'admin'), 'import',
    case when new.status = 'failed' then 'Import failed: ' else 'Import finished: ' end || new.file_name,
    format('%s of %s rows imported · %s skipped', new.imported_count, new.row_count, new.error_count)
      || coalesce(' · by ' || public.actor_name(), ''),
    '/imports',
    'import_done');
  return null;
end $$;

drop trigger if exists notify_import on public.import_batches;
create trigger notify_import
  after insert on public.import_batches
  for each row execute function public.tg_notify_import();

-- ---------------------------------------------------------------------------
-- Client feedback received → administrators.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_feedback()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company text;
begin
  select co.name into v_company
    from public.leads l
    join public.projects p   on p.id  = l.project_id
    join public.companies co on co.id = p.company_id
   where l.id = new.lead_id;
  perform public.notify_users(
    array(select id from public.users where role = 'admin'), 'feedback',
    'New client feedback' || coalesce(' from ' || v_company, ''),
    concat_ws(' · ',
      case when new.rating is not null then repeat('★', new.rating) || repeat('☆', 5 - new.rating) end,
      left(new.content, 140)),
    '/feedback',
    'feedback_new');
  return null;
end $$;

drop trigger if exists notify_feedback on public.feedback;
create trigger notify_feedback
  after insert on public.feedback
  for each row execute function public.tg_notify_feedback();

-- ---------------------------------------------------------------------------
-- Announcement posted on the bulletin board → all staff.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_bulletin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_users(
    array(select id from public.users where role in ('admin', 'manager', 'agent')), 'bulletin',
    case when new.message_type = 'AL' then 'Alert posted' else 'New announcement' end
      || coalesce(' by ' || public.actor_name(), ''),
    new.message,
    '/bulletin',
    'bulletin_posted');
  return null;
end $$;

drop trigger if exists notify_bulletin on public.bulletin_board;
create trigger notify_bulletin
  after insert on public.bulletin_board
  for each row execute function public.tg_notify_bulletin();

-- ---------------------------------------------------------------------------
-- Direct messages. Administrators and account managers only. Recipients are
-- people and/or whole roles; the link, if any, must stay inside the app.
-- ---------------------------------------------------------------------------
create or replace function public.send_notification(
  p_user_ids bigint[],
  p_roles    text[],
  p_title    text,
  p_body     text,
  p_link     text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_sent  int;
  v_title text := btrim(coalesce(p_title, ''));
  v_link  text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can send notifications'
      using errcode = '42501';
  end if;
  if length(v_title) = 0 then
    raise exception 'A title is required' using errcode = '22023';
  end if;
  -- Internal paths only: never a link that leaves the app.
  if v_link is not null and (v_link !~ '^/[^/\\]' and v_link <> '/') then
    raise exception 'Links must point inside Lighthouse, like /leads/123' using errcode = '22023';
  end if;

  v_sent := public.notify_users(
    array(select id from public.users
           where id = any(coalesce(p_user_ids, '{}'))
              or role = any(coalesce(p_roles, '{}'))),
    'message', v_title, nullif(btrim(coalesce(p_body, '')), ''), v_link, null, v_batch);

  return jsonb_build_object('batch', v_batch, 'sent', v_sent);
end $$;

grant execute on function public.send_notification(bigint[], text[], text, text, text) to authenticated;

-- What the caller has sent, one row per message, with who has read it.
create or replace function public.sent_notifications(p_limit int default 20)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(b order by b->>'sent_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'batch',   n.batch_id,
               'title',   min(n.title),
               'body',    min(n.body),
               'link',    min(n.link),
               'sent_at', min(n.created_at),
               'total',   count(*),
               'read',    count(n.read_at),
               'recipients', jsonb_agg(jsonb_build_object(
                  'name', coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), u.email),
                  'role', u.role,
                  'read_at', n.read_at) order by n.read_at nulls last, u.first_name)
             ) as b
        from public.notifications n
        join public.users u on u.id = n.user_id
       where n.sender_id = public.app_user_id() and n.batch_id is not null
       group by n.batch_id
       order by min(n.created_at) desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;
$$;

grant execute on function public.sent_notifications(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: publish new rows so the bell updates without a page load.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ===== supabase/migrations/20260929100000_security_hardening.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — security hardening
--
-- An audit found four holes in the database's own defences:
--
--   1. Any signed-in user could change their own row in public.users — role,
--      company, status — and become an administrator with one REST call.
--   2. Setting an account to "disabled" changed nothing: the helper functions
--      the policies rely on only ever read the role, never the status.
--   3. Two-factor was enforced only by the web app. A password alone yields a
--      token the REST API accepts, so an attacker with a stolen password and
--      no authenticator had full data access.
--   4. Account managers could switch off the organisation's alert rules, and
--      a direct message's link check could be slipped past with a tab.
--
-- A review of the first draft added: two-factor must also bind the elevated
-- (security definer) functions, not just table reads; a disabled account must
-- lose even the reference tables; and the password-change notice must not be
-- something a user can fire at will or put their own words into.
--
-- Everything here runs inside the database, so it holds for the app, the
-- REST API, Realtime and anything else that presents a user's token.
-- ---------------------------------------------------------------------------

-- --- 3. Two-factor holds at the database ------------------------------------
-- True when the caller has cleared two-factor, or has never set it up. Reads
-- auth.mfa_factors on the caller's behalf, so no grant on the auth schema is
-- needed. The assurance level is a claim in the token PostgREST presents.
create or replace function public.mfa_satisfied()
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- --- 2. No role without an active account and a satisfied second factor --
-- Every policy — and every role check inside the elevated functions such as
-- send_notification() — goes through these helpers. So a disabled or invited
-- account, or a session that has not yet entered its two-factor code, has no
-- identity, no role and no company anywhere at once. Invited accounts become
-- active when they set their password (activate_invited_account below).
create or replace function public.app_user_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.users
   where auth_id = auth.uid() and status = 'active' and public.mfa_satisfied()
   limit 1;
$$;

create or replace function public.app_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.users
   where auth_id = auth.uid() and status = 'active' and public.mfa_satisfied()
   limit 1;
$$;

create or replace function public.app_company_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select company_id from public.users
   where auth_id = auth.uid() and status = 'active' and public.mfa_satisfied()
   limit 1;
$$;

-- --- 1. Nobody promotes themselves -----------------------------------------
-- Row Level Security cannot limit which columns a policy lets through, so a
-- trigger holds the line: only an administrator may change the columns that
-- decide what an account is. The check is skipped for the database owner and
-- the service role (migrations, seeds, admin API), which never carry a user.
-- Runs as the invoker on purpose: inside a security-definer function
-- current_user would be the owner, never 'authenticated'.
create or replace function public.tg_users_guard_protected_columns()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if (new.role, new.status, new.company_id, new.auth_id, new.email, new.user_type_id)
     is distinct from
     (old.role, old.status, old.company_id, old.auth_id, old.email, old.user_type_id) then
    raise exception 'Only an administrator can change a user''s role, status, client account or sign-in identity'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists users_guard_protected_columns on public.users;
create trigger users_guard_protected_columns
  before update on public.users
  for each row execute function public.tg_users_guard_protected_columns();

-- Restrictive policies are ANDed with every permissive one, whatever a
-- table's own policies say:
--   mfa_required             — an enrolled account that has not entered its
--                              code reads and writes nothing (every table);
--   active_account_required  — a disabled or invited account reads and writes
--                              nothing, reference tables included (every table
--                              but users, where reading your own row is how
--                              the app knows to show "account disabled").
-- The checks sit in sub-selects so Postgres runs them once per query rather
-- than once per row. Re-running this is safe and covers tables added later.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public' and rowsecurity
  loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated
         using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', t);
    execute format('drop policy if exists active_account_required on public.%I', t);
    if t <> 'users' then
      execute format(
        'create policy active_account_required on public.%I as restrictive for all to authenticated
           using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null)', t);
    end if;
  end loop;
end $$;

-- A disabled or invited account may still read its own row, but not edit it.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (auth_id = auth.uid() and (select public.app_user_id()) is not null)
  with check (auth_id = auth.uid());

-- --- 4. Organisation-wide settings belong to administrators ------------------
drop policy if exists alert_rules_write on public.alert_rules;
create policy alert_rules_write on public.alert_rules
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The alert log is written by notify_users() (security definer); nobody
-- writes it by hand.
drop policy if exists alert_log_write on public.alert_log;
create policy alert_log_write on public.alert_log
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Direct-message links: inside the app only, and no whitespace or control
-- characters that could smuggle a second URL past the check.
create or replace function public.send_notification(
  p_user_ids bigint[],
  p_roles    text[],
  p_title    text,
  p_body     text,
  p_link     text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_sent  int;
  v_title text := btrim(coalesce(p_title, ''));
  v_link  text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can send notifications'
      using errcode = '42501';
  end if;
  if length(v_title) = 0 then
    raise exception 'A title is required' using errcode = '22023';
  end if;
  if v_link is not null and v_link !~ '^/([^/\\[:space:][:cntrl:]][^[:space:][:cntrl:]]*)?$' then
    raise exception 'Links must point inside Lighthouse, like /leads/123' using errcode = '22023';
  end if;

  v_sent := public.notify_users(
    array(select id from public.users
           where id = any(coalesce(p_user_ids, '{}'))
              or role = any(coalesce(p_roles, '{}'))),
    'message', v_title, nullif(btrim(coalesce(p_body, '')), ''), v_link, null, v_batch);

  return jsonb_build_object('batch', v_batch, 'sent', v_sent);
end $$;

-- --- The activity trail records who really acted, and when --------------------
-- Rows written through the API get the caller's identity and the current
-- time stamped on, so nobody can log actions as someone else or backdate.
create or replace function public.tg_activity_log_stamp()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.user_id := public.app_user_id();
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists activity_log_stamp on public.activity_log;
create trigger activity_log_stamp
  before insert on public.activity_log
  for each row execute function public.tg_activity_log_stamp();

-- --- Invitations and passwords -------------------------------------------------
-- An invited person who has just set their password turns their own account
-- on. This is the one status change a user may make for themselves, and it
-- only goes one way.
create or replace function public.activate_invited_account()
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update public.users set status = 'active', updated_at = now()
   where auth_id = auth.uid() and status = 'invited';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke execute on function public.activate_invited_account() from public, anon;
grant execute on function public.activate_invited_account() to authenticated;

-- When someone other than an administrator sets or changes their password,
-- the administrators hear about it (the client asked to be told when a client
-- account does this). Hardened so it cannot be abused as a messaging channel:
--   * only the server raises it — with the service key, right after the
--     password really changed — so a user can neither fire it at will nor
--     choose its wording;
--   * the wording is fixed and names the account by its email, which only an
--     administrator can change — nothing the user typed reaches the title;
--   * at most one notice per account per quarter hour.
drop function if exists public.notify_password_changed();
drop function if exists public.notify_password_changed(boolean);
create or replace function public.notify_password_changed(p_auth_id uuid, p_first_time boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_me    public.users%rowtype;
  v_link  text;
begin
  select * into v_me from public.users where auth_id = p_auth_id and status = 'active';
  if v_me.id is null or v_me.role = 'admin' then
    return 0;
  end if;

  v_link := '/users?q=' || replace(replace(replace(replace(replace(
              v_me.email, '%', '%25'), '+', '%2B'), '&', '%26'), '#', '%23'), ' ', '%20');
  if exists (select 1 from public.notifications
              where kind = 'system' and link = v_link and created_at > now() - interval '15 minutes') then
    return 0;
  end if;

  return public.notify_users(
    array(select id from public.users where role = 'admin'),
    'system',
    case when p_first_time then 'Invitation accepted: ' else 'Password changed: ' end || v_me.email,
    'Role: ' || v_me.role || coalesce(' · ' || (select name from public.companies where id = v_me.company_id), ''),
    v_link,
    null, null);
end $$;
revoke execute on function public.notify_password_changed(uuid, boolean) from public, anon, authenticated;
grant execute on function public.notify_password_changed(uuid, boolean) to service_role;

-- --- Exact email lookup ---------------------------------------------------------
-- Case-insensitive and exact. The invite form needs this: through the API,
-- LIKE patterns treat both "_" and "*" as wildcards, so a pattern match could
-- attach a new invitation to someone else's directory row. Runs as the caller.
create index if not exists users_email_lower_idx on public.users (lower(email));

create or replace function public.user_by_email(p_email text)
returns table (id bigint, auth_id uuid, status text)
language sql stable security invoker set search_path = public as $$
  select u.id, u.auth_id, u.status
    from public.users u
   where lower(u.email) = lower(btrim(p_email))
   order by u.id
   limit 1;
$$;
revoke execute on function public.user_by_email(text) from public, anon;
grant execute on function public.user_by_email(text) to authenticated;

-- --- Role checks run once per query, not once per row ----------------------------
-- The role helpers now also check two-factor, which made every policy that
-- calls them bare (is_staff(), app_company_id(), …) pay that cost for every
-- row — about 3x slower, enough to push the Lead Explorer past the statement
-- timeout at around 20,000 leads. Wrapping each call in a sub-select lets
-- Postgres evaluate it once per query (an InitPlan). Rewrites the existing
-- policies in place; calls already wrapped are left alone, so this is safe to
-- run again and picks up policies added later.
do $$
declare
  p record;
  v_re constant text := '(?<!SELECT )\m(public\.)?(is_staff|is_manager|is_admin|app_user_id|app_role|app_company_id)\(\)';
  v_qual  text;
  v_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and policyname not in ('mfa_required', 'active_account_required')
  loop
    v_qual  := regexp_replace(p.qual,       v_re, '(select public.\2())', 'g');
    v_check := regexp_replace(p.with_check, v_re, '(select public.\2())', 'g');
    if v_qual is distinct from p.qual then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, v_qual);
    end if;
    if v_check is distinct from p.with_check then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, v_check);
    end if;
  end loop;
end $$;

-- ===== supabase/migrations/20260930100000_notification_replies.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — open a notification, and reply to whoever sent it
--
-- A notification could only be marked read: a direct message had nowhere to
-- open, the bell cut it to two lines, and the person who got it could not
-- answer. Now every notification opens on its own page, and one that a
-- person sent shows the conversation with them and a reply box, so messages
-- can go back and forth like a chat.
--
-- A reply is a notification like any other, so it reaches the other
-- person's bell straight away. It records the message it answers (reply_to).
--
-- Who may write to whom: administrators and account managers can message
-- anyone (send_notification). Everyone else can answer a person who has
-- notified them. So a client can reply to the agent who set their
-- appointment, but cannot open a conversation with staff out of the blue.
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists reply_to bigint references public.notifications(id) on delete set null;

-- One person's messages to another, newest first: both halves of a conversation.
create index if not exists notifications_pair
  on public.notifications (user_id, sender_id, created_at desc)
  where kind = 'message';

-- ---------------------------------------------------------------------------
-- One notification from the caller's inbox, the person who sent it, and the
-- latest messages between the two of them, oldest first. Null when the
-- notification is not the caller's.
--
-- Security definer because a client cannot read staff rows in users, and
-- needs the sender's name. It only ever returns the caller's own
-- notification, and messages where the caller is the sender or the recipient.
-- ---------------------------------------------------------------------------
create or replace function public.notification_thread(p_id bigint, p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me       bigint := public.app_user_id();
  v_limit    int := least(greatest(coalesce(p_limit, 100), 1), 500);
  n          public.notifications;
  v_person   jsonb;
  v_messages jsonb := '[]'::jsonb;
begin
  if v_me is null then
    return null;
  end if;

  select * into n from public.notifications where id = p_id and user_id = v_me;
  if not found then
    return null;
  end if;

  if n.sender_id is not null then
    select jsonb_build_object(
             'id',     u.id,
             'name',   coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Lighthouse user'),
             'role',   u.role,
             'active', u.status = 'active')
      into v_person
      from public.users u
     where u.id = n.sender_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id',         t.id,
             'mine',       t.sender_id = v_me,
             'title',      t.title,
             'body',       t.body,
             'reply_to',   t.reply_to,
             'read_at',    t.read_at,
             'created_at', t.created_at) order by t.created_at, t.id), '[]'::jsonb)
      into v_messages
      from (
        select m.*
          from public.notifications m
         where m.kind = 'message'
           and ((m.user_id = v_me and m.sender_id = n.sender_id)
             or (m.user_id = n.sender_id and m.sender_id = v_me))
         order by m.created_at desc, m.id desc
         limit v_limit
      ) t;
  end if;

  return jsonb_build_object(
    'notification', jsonb_build_object(
       'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link,
       'read_at', n.read_at, 'created_at', n.created_at, 'reply_to', n.reply_to),
    'person',   v_person,
    'messages', v_messages);
end $$;

revoke execute on function public.notification_thread(bigint, int) from public, anon;
grant execute on function public.notification_thread(bigint, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Reply to a notification in your inbox. The reply goes to the person who
-- sent it, and answering marks the original read. Returns the new message
-- in the same shape as notification_thread's messages.
-- ---------------------------------------------------------------------------
create or replace function public.reply_to_notification(p_id bigint, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_body  text := btrim(coalesce(p_body, ''));
  n       public.notifications;
  v_to    public.users;
  v_row   public.notifications;
begin
  if v_me is null then
    raise exception 'Sign in to reply' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'Write a reply first' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep a reply under 1,000 characters' using errcode = '22023';
  end if;

  -- Only a notification in your own inbox, and only one a person sent.
  select * into n from public.notifications where id = p_id and user_id = v_me;
  if not found then
    raise exception 'That notification is not in your inbox' using errcode = '42501';
  end if;
  if n.sender_id is null then
    raise exception 'This notification came from Lighthouse itself, so there is no one to reply to'
      using errcode = '22023';
  end if;

  select * into v_to from public.users where id = n.sender_id;
  if not found or v_to.status <> 'active' then
    raise exception '% can no longer receive messages',
      coalesce(nullif(concat_ws(' ', v_to.first_name, v_to.last_name), ''), 'That person')
      using errcode = '22023';
  end if;

  -- A person typing will not hit this; a script sending in a loop will.
  if (select count(*) from public.notifications
       where sender_id = v_me and reply_to is not null
         and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending replies too quickly. Wait a moment and try again.'
      using errcode = '54000';
  end if;

  -- A batch id like any direct message, so the sender can read it back (notifications_read).
  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, reply_to)
  values (v_to.id, v_me, gen_random_uuid(), 'message',
          left('Re: ' || regexp_replace(n.title, '^\s*(re:\s*)+', '', 'i'), 160),
          v_body, n.id)
  returning * into v_row;

  update public.notifications set read_at = now() where id = n.id and read_at is null;

  return jsonb_build_object(
    'id', v_row.id, 'mine', true, 'title', v_row.title, 'body', v_row.body,
    'reply_to', v_row.reply_to, 'read_at', null, 'created_at', v_row.created_at);
end $$;

revoke execute on function public.reply_to_notification(bigint, text) from public, anon;
grant execute on function public.reply_to_notification(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The Sent list shows what the caller sent out, with read receipts. Replies
-- live in their conversations, so they stay off it.
-- ---------------------------------------------------------------------------
create or replace function public.sent_notifications(p_limit int default 20)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(b order by b->>'sent_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'batch',   n.batch_id,
               'title',   min(n.title),
               'body',    min(n.body),
               'link',    min(n.link),
               'sent_at', min(n.created_at),
               'total',   count(*),
               'read',    count(n.read_at),
               'recipients', jsonb_agg(jsonb_build_object(
                  'name', coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), u.email),
                  'role', u.role,
                  'read_at', n.read_at) order by n.read_at nulls last, u.first_name)
             ) as b
        from public.notifications n
        join public.users u on u.id = n.user_id
       where n.sender_id = (select public.app_user_id())
         and n.batch_id is not null
         and n.reply_to is null
       group by n.batch_id
       order by min(n.created_at) desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;
$$;

grant execute on function public.sent_notifications(int) to authenticated;

-- ===== supabase/migrations/20260930120000_lead_lifecycle.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the lead lifecycle
--
-- The client's spreadsheet "New Call Result (Action Buttons) for AccountMgr
-- Drop-Downs" is the spec. A list is imported into a database-development
-- (DBDev) project; account managers call through it; each call result either
-- keeps the name on their list or resolves it. A name that becomes a Lead is
-- promoted to the linked appointment (Appt) project, where the appointment
-- manager calls it for an appointment. Every result can pay, or charge back.
--
--   call_results             the 36 results, per project type, with what each does
--   record_call_result()     applies one result atomically: the call, the weight,
--                            the list, promotion, appointment + QA staging, pay
--   call_list()              a rep's names on a project, least-called first
--   distribute_project_names() split a project's names evenly across its reps
--   review_appointment_qa()  pass or fail an appointment; the client hears on pass
--   pay_events               per-rep production, with chargebacks as negatives
--
-- One rep holds a name at a time (leads.assigned_user_id): the DBDev account
-- manager, then the appointment manager after promotion. dbdv_user_id keeps
-- who developed it, so an invalid lead is charged back to the right person.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The results
-- ---------------------------------------------------------------------------

insert into public.lead_statuses (code, name)
select v.code, v.name
  from (values ('not_qualified', 'Not qualified'),
               ('do_not_call',   'Do not call'),
               ('removed',       'Removed'),
               ('invalid',       'Invalid lead')) as v(code, name)
 where not exists (select 1 from public.lead_statuses s where s.code = v.code)
   -- A fresh install gets them from seed.sql, in their place in the list
   -- (the seed is what adds the base statuses, such as 'new').
   and exists (select 1 from public.lead_statuses where code = 'new');

insert into public.appointment_statuses (name)
select 'Invalid'
 where not exists (select 1 from public.appointment_statuses where name = 'Invalid')
   and exists (select 1 from public.appointment_statuses);

create table if not exists public.call_results (
  id           bigint generated always as identity primary key,
  project_type text    not null check (project_type in ('DBDV', 'APPT')),
  name         text    not null,               -- exactly as the client titled it
  sort_order   integer not null,
  viable       boolean not null,               -- stays on the call lists
  callable     boolean not null default true,  -- false: viable, but held back (Pending)
  sort_last    boolean not null default false, -- Lead-Not Shopping: always at the end of the list
  effect       text    not null default 'none'
               check (effect in ('none', 'promote', 'appointment', 'confirm',
                                 'appointment_invalid', 'lead_invalid', 'correct_xdate', 'pending')),
  pay_kind     text    check (pay_kind in ('lead', 'appointment', 'confirmation')),
  -- name: a button on the call sheet · appointment: acts on the name's open
  -- appointment (the confirmation follow-up) · report: set by another result
  applies_to   text    not null default 'name' check (applies_to in ('name', 'appointment', 'report')),
  status_code  text,                           -- the lead status it implies; null leaves it
  action       text    not null,               -- the client's own description of what happens
  aliases      text[]  not null default '{}',   -- old-system names meaning the same (imports)
  unique (project_type, name)
);

-- Upsert, so re-running this file refreshes wording without breaking ids.
insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases)
values
  -- DBDev - Leads
  ('DBDV', 'Viable-No Contact',     10, true,  true,  false, 'none', null, 'name', 'new',
   'Stays on active DBDev call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['call 0', 'viable no contact', 'no contact']),
  ('DBDV', 'Viable-Staged',         20, true,  true,  false, 'none', null, 'name', 'profile',
   'Stays on active DBDev call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled, these will be names with a potential renewal date, but not confirmed as Leads yet',
   array['x-date profile', 'xdate profile', 'profile', 'staged']),
  ('DBDV', 'Viable-Left Message',   30, true,  true,  false, 'none', null, 'name', 'new',
   'Stays on active DBDev call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['left message', 'left voicemail', 'lm']),
  ('DBDV', 'Viable-Email',          40, true,  true,  false, 'none', null, 'name', 'new',
   'Stays on active DBDev call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['email', 'emailed']),
  ('DBDV', 'Lead',                  50, false, true,  false, 'promote', 'lead', 'name', 'xdate',
   'Removed from DBDev call lists and promoted to Appt project/Appt Mgr assigned to project as Lead-No Contact, flagged for Account Mgr pay for daily production at pre-defined Lead rate at project level',
   array['x-date-lead', 'x-date lead', 'xdate lead', 'x-date hot lead', 'hot lead']),
  ('DBDV', 'Appointment',           60, false, true,  false, 'appointment', 'appointment', 'name', 'survey',
   'Removed from DBDev call lists and promoted to Appt Project as an Appointment, moved to project calendar, staged in QA section, client notified after QA, posted as follow-up item for confirmation by Account Mgr (won''t show as active Lead for Appt Mgr to call), flagged for account Mgr Pay for daily production at pre-defined Appt rate at project level',
   array['survey appointment', 'appointment']),
  ('DBDV', 'Appointment-Phone',     70, false, true,  false, 'appointment', 'appointment', 'name', 'appt',
   'Removed from DBDev call lists and promoted to Appt Project as an Appointment, moved to project calendar, staged in QA section, client notified after QA, posted as follow-up item for confirmation by Account Mgr (won''t show as active Lead for Appt Mgr to call), flagged for account Mgr Pay for daily production at pre-defined Appt rate at project level',
   array['phone appointment']),
  ('DBDV', 'Appointment-Confirmed', 80, false, true,  false, 'confirm', 'confirmation', 'appointment', null,
   'Confirmation details updated on client calendar, notification sent to Client, flagged as confirmed for additional Account Mgr pay for daily production at pre-defined Confirmation pay rate at project level',
   array['confirmed', 'appointment confirmed']),
  ('DBDV', 'Not Interested',        90, false, true,  false, 'none', null, 'name', 'not_interested',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['not interested']),
  ('DBDV', 'Disco#',               100, false, true,  false, 'none', null, 'name', 'disconnected',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['disconnected #', 'disconnected', 'disco #', 'disco']),
  ('DBDV', 'Out of Business',      110, false, true,  false, 'none', null, 'name', 'out_of_business',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['out of business', 'oob']),
  ('DBDV', 'Branch',               120, false, true,  false, 'none', null, 'name', 'removed',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['branch']),
  ('DBDV', 'Removed',              130, false, true,  false, 'none', null, 'name', 'removed',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['removed']),
  ('DBDV', 'Not Qualified',        140, false, true,  false, 'none', null, 'name', 'not_qualified',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['not qualified', 'nq']),
  ('DBDV', 'DoNotCall',            150, false, true,  false, 'none', null, 'name', 'do_not_call',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['do not call', 'dnc']),
  ('DBDV', 'Client',               160, false, true,  false, 'none', null, 'name', 'removed',
   'Removed from DBDev call lists and reported as resolved by result type for DBDev project', array['client', 'existing client']),
  ('DBDV', 'Pending',              170, true,  false, false, 'pending', null, 'name', 'new',
   'Stays on active DBDev call lists, but not included yet as Viable record to be called - names not assigned to Account Mgr yet. Viewable results stays as titled',
   array['pending']),
  ('DBDV', 'Lead-Invalid',         180, false, true,  false, 'none', null, 'report', 'invalid',
   'This would be for an invalid Lead Appt Mgr uncovered so we can charge back the DBDev rep who developed it', '{}'),
  ('DBDV', 'Appointment-Invalid',  190, false, true,  false, 'appointment_invalid', null, 'appointment', 'xdate',
   'Removed from Appt total at project level, stays as Lead under project reports, pay amount given to Account Mgr flagged on daily production report as negative # against current total',
   array['appointment invalid']),
  -- Appts
  ('APPT', 'Lead-No Contact',       10, true,  true,  false, 'none', null, 'name', 'xdate',
   'Stays on active Appt project call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['xd-call 0', 'xd call 0', 'lead no contact']),
  ('APPT', 'Lead-Left Message',     20, true,  true,  false, 'none', null, 'name', 'xdate',
   'Stays on active Appt project call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['xd-left message', 'xd-lm']),
  ('APPT', 'Lead-Email',            30, true,  true,  false, 'none', null, 'name', 'xdate',
   'Stays on active Appt project call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['xd-email']),
  ('APPT', 'Appointment',           40, false, true,  false, 'appointment', 'appointment', 'name', 'survey',
   'Removed from Appt project call lists, moved to project calendar, staged in QA section, client notified after QA, posted as follow-up item for confirmation by Account Mgr, flagged for Account Mgr Pay for daily production at pre-defined Appt rate at project level',
   array['-$appointment', 'appt from x-date', 'appointment', 'survey appointment']),
  ('APPT', 'Appointment-Phone',     50, false, true,  false, 'appointment', 'appointment', 'name', 'appt',
   'Removed from Appt project call lists, moved to project calendar, staged in QA section, client notified after QA, posted as follow-up item for confirmation by Account Mgr, flagged for Account Mgr Pay for daily production at pre-defined Appt rate at project level',
   array['phone appointment']),
  ('APPT', 'Appointment-Confirmed', 60, false, true,  false, 'confirm', 'confirmation', 'appointment', null,
   'Confirmation details updated on client calendar, notification sent to Client, flagged as confirmed for additional Account Mgr pay for daily production at pre-defined Confirmation pay rate at project level',
   array['confirmed', 'appointment confirmed']),
  ('APPT', 'Lead-Not Shopping',     70, true,  true,  true,  'none', null, 'name', 'xdate',
   'Stays on active Appt project call lists, but issued highest call weight so it will continue to come up last on the call lists (tracked by # of calls made to each name/weighted). Viewable results stays as titled',
   array['xd-not shopping', 'not shopping']),
  ('APPT', 'Lead-Never Shops',      80, false, true,  false, 'none', null, 'name', 'not_interested',
   'Removed from Appt project call lists', array['xd-never shops', 'never shops']),
  ('APPT', 'Lead-Corrected',        90, true,  true,  false, 'correct_xdate', null, 'name', 'xdate',
   'Record would be updated with corrected renewal month and stay on active Appt project call lists, system will record note of original renewal month that was on the original Lead',
   array['xd-corrected']),
  ('APPT', 'Lead-Removed',         100, false, true,  false, 'none', null, 'name', 'removed', 'Removed from Appt project call lists', array['xd-removed']),
  ('APPT', 'Lead-DoNotCall',       110, false, true,  false, 'none', null, 'name', 'do_not_call', 'Removed from Appt project call lists', array['xd-do not call', 'xd-dnc']),
  ('APPT', 'Lead-Out of Business', 120, false, true,  false, 'none', null, 'name', 'out_of_business', 'Removed from Appt project call lists', array['xd-out of business']),
  ('APPT', 'Lead-Branch',          130, false, true,  false, 'none', null, 'name', 'removed', 'Removed from Appt project call lists', array['xd-branch']),
  ('APPT', 'Lead-Not Qualified',   140, false, true,  false, 'none', null, 'name', 'not_qualified', 'Removed from Appt project call lists', array['xd-not qualified']),
  ('APPT', 'Lead-Client',          150, false, true,  false, 'none', null, 'name', 'removed', 'Removed from Appt project call lists', array['xd-client']),
  ('APPT', 'Lead-Invalid',         160, false, true,  false, 'lead_invalid', 'lead', 'name', 'invalid',
   'Removed from Appt project call lists, flagged to show the DB Dev Account Mgr that developed the original lead and flagged on daily production report as negative # against current total',
   array['xd-invalid', 'invalid lead']),
  ('APPT', 'Appointment-Invalid',  170, false, true,  false, 'appointment_invalid', null, 'appointment', 'xdate',
   'Removed from Appt total at project level, stays as Lead under project reports, pay amount given to Account Mgr flagged on daily production report as negative # against current total',
   array['appointment invalid'])
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable,
  sort_last = excluded.sort_last, effect = excluded.effect, pay_kind = excluded.pay_kind,
  applies_to = excluded.applies_to, status_code = excluded.status_code,
  action = excluded.action, aliases = excluded.aliases;

alter table public.call_results enable row level security;
drop policy if exists call_results_read on public.call_results;
create policy call_results_read on public.call_results for select to authenticated using (true);
drop policy if exists call_results_write on public.call_results;
create policy call_results_write on public.call_results for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.call_results to authenticated;

/** A result by its title or any old-system name, for one project type. Null when unknown. */
create or replace function public.call_result_from_text(p_type text, p_text text)
returns bigint
language sql stable set search_path = public as $$
  select id from public.call_results
   where project_type = p_type
     and (lower(name) = lower(btrim(p_text)) or lower(btrim(p_text)) = any(aliases))
   order by sort_order
   limit 1;
$$;
grant execute on function public.call_result_from_text(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Where each name is in its life
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists appt_project_id   bigint references public.projects(id) on delete set null,
  add column if not exists lead_rate         numeric(10,2) not null default 0,
  add column if not exists appointment_rate  numeric(10,2) not null default 0,
  add column if not exists confirmation_rate numeric(10,2) not null default 0;

alter table public.leads
  add column if not exists stage             text not null default 'dbdev',
  add column if not exists result_id         bigint references public.call_results(id),
  add column if not exists call_weight       integer not null default 0,
  add column if not exists source_project_id bigint references public.projects(id) on delete set null,
  add column if not exists promoted_at       timestamptz,
  add column if not exists resolved_at       timestamptz,
  add column if not exists original_xdate    date;

alter table public.appointments
  add column if not exists project_id      bigint references public.projects(id) on delete set null, -- where it lives (the Appt project)
  add column if not exists set_project_id  bigint references public.projects(id) on delete set null, -- where the call that set it was made
  add column if not exists set_stage       text,
  add column if not exists call_record_id  bigint references public.call_records(id) on delete set null,
  add column if not exists qa_status       text,
  add column if not exists qa_by           bigint references public.users(id) on delete set null,
  add column if not exists qa_at           timestamptz,
  add column if not exists qa_note         text,
  add column if not exists confirmed_at    timestamptz,
  add column if not exists confirmed_by    bigint references public.users(id) on delete set null,
  add column if not exists invalid_at      timestamptz;

alter table public.call_records
  add column if not exists result_id      bigint references public.call_results(id),
  add column if not exists stage          text,
  add column if not exists appointment_id bigint references public.appointments(id) on delete set null;

do $$
begin
  -- Named constraints, added once, so re-running the file is safe.
  if not exists (select 1 from pg_constraint where conname = 'leads_stage_check') then
    alter table public.leads add constraint leads_stage_check check (stage in ('dbdev', 'appt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_call_weight_check') then
    alter table public.leads add constraint leads_call_weight_check check (call_weight >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_rates_check') then
    alter table public.projects add constraint projects_rates_check
      check (lead_rate >= 0 and appointment_rate >= 0 and confirmation_rate >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_qa_status_check') then
    alter table public.appointments add constraint appointments_qa_status_check check (qa_status in ('pending', 'passed', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_set_stage_check') then
    alter table public.appointments add constraint appointments_set_stage_check check (set_stage in ('dbdev', 'appt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'call_records_stage_check') then
    alter table public.call_records add constraint call_records_stage_check check (stage in ('dbdev', 'appt'));
  end if;
end $$;

create index if not exists leads_call_list_idx       on public.leads (project_id, assigned_user_id, call_weight, id);
create index if not exists leads_source_project_idx  on public.leads (source_project_id) where source_project_id is not null;
create index if not exists leads_result_idx          on public.leads (result_id);
create index if not exists leads_dbdv_user_idx       on public.leads (dbdv_user_id) where dbdv_user_id is not null;
create index if not exists call_records_user_date_idx    on public.call_records (user_id, call_date desc);
create index if not exists call_records_project_date_idx on public.call_records (project_id, call_date desc);
create index if not exists appointments_followup_idx on public.appointments (user_id) where confirmed_at is null and invalid_at is null;
create index if not exists appointments_qa_idx       on public.appointments (qa_status) where qa_status = 'pending';
create index if not exists appointments_lead_idx     on public.appointments (lead_id);

-- ---------------------------------------------------------------------------
-- 3. Pay: one row per paid event; a chargeback is a negative row pointing at
--    what it reverses. Written only by the functions below.
-- ---------------------------------------------------------------------------

create table if not exists public.pay_events (
  id             bigint generated always as identity primary key,
  user_id        bigint references public.users(id) on delete set null,
  project_id     bigint references public.projects(id) on delete set null,
  lead_id        bigint references public.leads(id) on delete set null,
  appointment_id bigint references public.appointments(id) on delete set null,
  call_record_id bigint references public.call_records(id) on delete set null,
  kind           text not null check (kind in ('lead', 'appointment', 'confirmation')),
  amount         numeric(10,2) not null,
  reverses_id    bigint references public.pay_events(id) on delete set null,
  note           text,
  created_by     bigint references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists pay_events_user_date_idx    on public.pay_events (user_id, created_at desc);
create index if not exists pay_events_project_date_idx on public.pay_events (project_id, created_at desc);
create index if not exists pay_events_lead_idx         on public.pay_events (lead_id);
create index if not exists pay_events_appointment_idx  on public.pay_events (appointment_id);
-- Nothing is charged back twice.
create unique index if not exists pay_events_one_reversal on public.pay_events (reverses_id) where reverses_id is not null;

alter table public.pay_events enable row level security;
drop policy if exists pay_events_read on public.pay_events;
create policy pay_events_read on public.pay_events for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
revoke insert, update, delete, truncate on public.pay_events from anon, authenticated;
grant select on public.pay_events to authenticated;

-- The account-wide rules from the security migration, for the new tables too.
do $$
declare t text;
begin
  foreach t in array array['call_results', 'pay_events'] loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format('create policy mfa_required on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', t);
    execute format('drop policy if exists active_account_required on public.%I', t);
    execute format('create policy active_account_required on public.%I as restrictive for all to authenticated using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null)', t);
  end loop;
end $$;

-- Clients see an appointment once it has passed QA, and never one found invalid.
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using (
    (select public.is_staff())
    or (coalesce(qa_status, 'passed') = 'passed'
        and invalid_at is null
        and lead_id in (select l.id from public.leads l where l.project_id in (select public.client_project_ids())))
  );

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

/** 'DBDV' or 'APPT' for a project. */
create or replace function public.project_type_code(p_project bigint)
returns text
language sql stable set search_path = public as $$
  select t.code from public.projects p join public.project_types t on t.id = p.project_type_id where p.id = p_project;
$$;
grant execute on function public.project_type_code(bigint) to authenticated;

/**
 * The renewal date that matters: the ultimate X-date when there is one,
 * otherwise the earliest X-date on any policy line.
 */
create or replace function public.lead_renewal_date(p_lead bigint)
returns date
language sql stable set search_path = public as $$
  select min(coalesce(i.ultimate_xdate,
                      least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                            i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)))
    from public.insurance_details i where i.lead_id = p_lead;
$$;
grant execute on function public.lead_renewal_date(bigint) to authenticated;

/** The active rep on a project holding the fewest names still to call. Null if nobody is assigned. */
create or replace function public.least_loaded_rep(p_project bigint)
returns bigint
language sql stable security definer set search_path = public as $$
  select pa.ae_user_id
    from public.project_assignments pa
    join public.users u on u.id = pa.ae_user_id and u.status = 'active'
   where pa.project_id = p_project
   order by (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
              where l.project_id = p_project and l.assigned_user_id = pa.ae_user_id and r.viable and r.callable),
            pa.ae_user_id
   limit 1;
$$;
revoke execute on function public.least_loaded_rep(bigint) from public, anon, authenticated;

/** A lead's stage follows its project's type; a name moved by hand starts that stage fresh. */
create or replace function public.tg_leads_stage()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_type text;
  v_stage text;
begin
  if tg_op = 'INSERT' or new.project_id is distinct from old.project_id then
    v_type := public.project_type_code(new.project_id);
    if v_type is not null then
      v_stage := case v_type when 'APPT' then 'appt' else 'dbdev' end;
      if v_type = 'DBDV' and new.source_project_id is null then
        new.source_project_id := new.project_id;
      end if;
      if tg_op = 'INSERT' or new.stage is distinct from v_stage then
        new.stage := v_stage;
      end if;
    end if;
  end if;
  -- A name loaded without a result takes the one its old-system columns name.
  if new.result_id is null then
    new.result_id := public.call_result_from_text(case new.stage when 'appt' then 'APPT' else 'DBDV' end,
                                                  case new.stage when 'appt' then new.call_result_appt else new.call_result_dbdv end);
  end if;
  -- A result from the other stage's list does not fit: start the stage fresh.
  if new.result_id is null
     or (select project_type from public.call_results where id = new.result_id)
        is distinct from (case new.stage when 'appt' then 'APPT' else 'DBDV' end)
        and (select applies_to from public.call_results where id = new.result_id) = 'name' then
    new.result_id := public.call_result_from_text(case new.stage when 'appt' then 'APPT' else 'DBDV' end,
                                                  case new.stage when 'appt' then 'Lead-No Contact' else 'Viable-No Contact' end);
    if tg_op = 'UPDATE' then
      new.call_weight := 0;
      new.resolved_at := null;
    end if;
  end if;
  return new;
end $$;

/** Pay rates and the promotion link are set by administrators; the link must pair DBDev → Appt within one client. */
create or replace function public.tg_projects_lifecycle_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin()
     and (tg_op = 'INSERT' and (new.lead_rate, new.appointment_rate, new.confirmation_rate) is distinct from (0::numeric, 0::numeric, 0::numeric)
          or tg_op = 'UPDATE' and (new.lead_rate, new.appointment_rate, new.confirmation_rate)
                                   is distinct from (old.lead_rate, old.appointment_rate, old.confirmation_rate)) then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  if new.appt_project_id is not null then
    if new.appt_project_id = new.id then
      raise exception 'A project cannot promote to itself' using errcode = '23514';
    end if;
    if (select t.code from public.project_types t where t.id = new.project_type_id) is distinct from 'DBDV' then
      raise exception 'Only a database-development project promotes leads to an appointment project' using errcode = '23514';
    end if;
    if not exists (select 1 from public.projects a join public.project_types t on t.id = a.project_type_id
                    where a.id = new.appt_project_id and t.code = 'APPT' and a.company_id is not distinct from new.company_id) then
      raise exception 'Leads can only be promoted to an appointment project for the same client' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists projects_lifecycle_guard on public.projects;
create trigger projects_lifecycle_guard
  before insert or update on public.projects
  for each row execute function public.tg_projects_lifecycle_guard();

-- ---------------------------------------------------------------------------
-- 5. Notifications that follow the lifecycle
-- ---------------------------------------------------------------------------

insert into public.alert_rules (name, trigger, channel, recipients, enabled)
select v.name, v.trigger, 'inapp', null, true
  from (values ('Appointment confirmed',       'appt_confirmed'),
               ('Appointment QA result',       'appt_qa'),
               ('Lead marked invalid',         'lead_invalid')) as v(name, trigger)
 where not exists (select 1 from public.alert_rules r where r.trigger = v.trigger);

-- New appointments: as before, except a client hears only once QA has passed it.
create or replace function public.tg_notify_appointments()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_to bigint[];
begin
  for r in
    select p.company_id,
           min(co.name) as company,
           count(*) as n,
           min(a.appt_date) as first_date,
           max(a.appt_date) as last_date,
           array_agg(distinct p.id) filter (where p.id is not null) as project_ids,
           array_agg(distinct l.assigned_user_id) filter (where l.assigned_user_id is not null) as reps,
           (array_agg(l.company_name order by a.appt_date, a.id))[1] as lead_name,
           (array_agg(a.appt_time order by a.appt_date, a.id))[1] as first_time,
           bool_or(coalesce(a.qa_status, 'passed') = 'passed') as client_may_know
      from new_rows a
      left join public.leads l     on l.id  = a.lead_id
      left join public.projects p  on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
     group by p.company_id
  loop
    v_to := array(
      select id from public.users where role = 'admin'
      union
      select pa.ae_user_id from public.project_assignments pa
       where pa.project_id = any(r.project_ids) and pa.ae_user_id is not null
      union
      select u.id from public.users u
       where r.client_may_know and u.role = 'client' and r.company_id is not null and u.company_id = r.company_id
      union
      select unnest(r.reps)
    );
    perform public.notify_users(
      v_to, 'appointment',
      case when r.n = 1 then 'Appointment set: ' || coalesce(r.lead_name, 'a lead')
           else r.n || ' appointments set' || coalesce(' for ' || r.company, '') end,
      case when r.n = 1
           then concat_ws(' · ',
                  to_char(r.first_date, 'Dy Mon FMDD') || coalesce(' at ' || r.first_time, ''),
                  r.company,
                  'set by ' || public.actor_name())
           else concat_ws(' · ',
                  to_char(r.first_date, 'Mon FMDD') || ' – ' || to_char(r.last_date, 'Mon FMDD'),
                  'set by ' || public.actor_name()) end,
      '/calendar?view=' || case when r.n = 1 then 'day' else 'month' end
        || '&d=' || coalesce(r.first_date, current_date)::text,
      'appt_created');
  end loop;
  return null;
end $$;

/** Tell the client about one appointment (after QA, or when confirmed). */
create or replace function public.notify_client_appointment(p_appointment bigint, p_confirmed boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  select ap.appt_date, ap.appt_time, l.company_name, co.id as company_id, co.name as company
    into a
    from public.appointments ap
    join public.leads l on l.id = ap.lead_id
    left join public.projects p on p.id = l.project_id
    left join public.companies co on co.id = p.company_id
   where ap.id = p_appointment;
  if a.company_id is null then return; end if;
  perform public.notify_users(
    array(select u.id from public.users u where u.role = 'client' and u.company_id = a.company_id),
    'appointment',
    (case when p_confirmed then 'Appointment confirmed: ' else 'Appointment set: ' end) || coalesce(a.company_name, 'a lead'),
    concat_ws(' · ', to_char(a.appt_date, 'Dy Mon FMDD') || coalesce(' at ' || a.appt_time, ''), a.company),
    '/calendar?view=day&d=' || coalesce(a.appt_date, current_date)::text,
    case when p_confirmed then 'appt_confirmed' else 'appt_created' end);
end $$;
revoke execute on function public.notify_client_appointment(bigint, boolean) from public, anon, authenticated;

-- Lead assignments now link to the call list the names are on.
drop function if exists public.notify_lead_assignment(bigint, boolean, bigint, bigint, text);
create or replace function public.notify_lead_assignment(
  p_user bigint, p_hot boolean, p_n bigint, p_lead bigint, p_name text, p_project bigint
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_users(
    array[p_user], 'lead',
    case when p_n = 1 then (case when p_hot then 'Hot lead assigned to you: ' else 'Lead assigned to you: ' end) || coalesce(p_name, 'a lead')
         else p_n || case when p_hot then ' hot leads' else ' leads' end || ' assigned to you' end,
    coalesce('Assigned by ' || public.actor_name(), 'Assigned automatically'),
    case when p_n = 1 then '/leads/' || p_lead || coalesce('?project=' || p_project, '')
         when p_project is not null then '/work/' || p_project
         else '/work' end,
    case when p_hot then 'hot_lead' else 'lead_assigned' end);
end $$;
revoke execute on function public.notify_lead_assignment(bigint, boolean, bigint, bigint, text, bigint) from public, anon, authenticated;

create or replace function public.tg_notify_leads_assigned()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    for r in
      select n.assigned_user_id as uid, n.project_id as pid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
       group by 1, 2, 3
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name, r.pid);
    end loop;
  else
    for r in
      select n.assigned_user_id as uid, n.project_id as pid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        join old_rows o on o.id = n.id
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
         and n.assigned_user_id is distinct from o.assigned_user_id
         -- The rep who set an appointment keeps it; that is not a new assignment.
         and n.assigned_user_id is distinct from public.app_user_id()
       group by 1, 2, 3
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name, r.pid);
    end loop;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The engine
-- ---------------------------------------------------------------------------

/** Pay `p_user` for one event at the given project's rate; returns the row as JSON. */
create or replace function public.pay(p_user bigint, p_project bigint, p_kind text, p_lead bigint,
                                      p_appointment bigint, p_call bigint, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_id bigint;
begin
  select case p_kind when 'lead' then lead_rate when 'appointment' then appointment_rate else confirmation_rate end
    into v_amount from public.projects where id = p_project;
  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, note, created_by)
  values (p_user, p_project, p_lead, p_appointment, p_call, p_kind, coalesce(v_amount, 0), p_note, public.app_user_id())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'user_id', p_user, 'kind', p_kind, 'amount', coalesce(v_amount, 0));
end $$;
revoke execute on function public.pay(bigint, bigint, text, bigint, bigint, bigint, text) from public, anon, authenticated;

/** Reverse every unreversed payment matching a filter; returns the chargebacks as JSON. */
create or replace function public.charge_back(p_lead bigint, p_appointment bigint, p_kinds text[], p_call bigint, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_out jsonb := '[]'::jsonb;
  v_id bigint;
begin
  for e in
    select pe.* from public.pay_events pe
     where pe.kind = any(p_kinds)
       and pe.reverses_id is null
       and (p_lead is null or pe.lead_id = p_lead)
       and (p_appointment is null or pe.appointment_id = p_appointment)
       and not exists (select 1 from public.pay_events x where x.reverses_id = pe.id)
     order by pe.id
     for update
  loop
    insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, reverses_id, note, created_by)
    values (e.user_id, e.project_id, e.lead_id, e.appointment_id, p_call, e.kind, -e.amount, e.id, p_note, public.app_user_id())
    returning id into v_id;
    v_out := v_out || jsonb_build_object('id', v_id, 'user_id', e.user_id, 'kind', e.kind, 'amount', -e.amount, 'reverses', e.id);
  end loop;
  return v_out;
end $$;
revoke execute on function public.charge_back(bigint, bigint, text[], bigint, text) from public, anon, authenticated;

/**
 * Record one call result on a name, and do everything the client's sheet says
 * that result does, in one transaction.
 *
 *   p_appointment      {date: 'YYYY-MM-DD', time: '9:30 AM', duration: 30, rep_name: '…'}
 *                      for Appointment / Appointment-Phone
 *   p_corrected_xdate  the corrected renewal date, for Lead-Corrected
 *
 * Who may record: an administrator; the name's rep; anyone assigned to its
 * project; and, for an appointment follow-up, whoever set that appointment.
 */
create or replace function public.record_call_result(
  p_lead_id bigint,
  p_result_id bigint,
  p_notes text default null,
  p_appointment jsonb default null,
  p_corrected_xdate date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me       bigint := public.app_user_id();
  v_role     text   := public.app_role();
  v_notes    text   := nullif(btrim(coalesce(p_notes, '')), '');
  l          public.leads;
  r          public.call_results;
  a_r        public.call_results;      -- the appointment-stage twin of a DBDev result
  p          public.projects;          -- the project the call is made on
  v_type     text;
  v_appt     public.appointments;
  v_call     bigint;
  v_status   bigint;
  v_rep      bigint;
  v_old_xdate date;
  v_pay      jsonb := '[]'::jsonb;
  v_date     date;
  v_time     text;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff can record call results' using errcode = '42501';
  end if;
  if length(coalesce(v_notes, '')) > 1000 then
    raise exception 'Keep call notes under 1,000 characters' using errcode = '22023';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select * into r from public.call_results where id = p_result_id;
  if not found then
    raise exception 'Unknown call result' using errcode = '22023';
  end if;
  if r.applies_to = 'report' then
    raise exception '% is recorded automatically, not from a call', r.name using errcode = '22023';
  end if;

  select * into p from public.projects where id = l.project_id;
  if not found then
    raise exception 'This name is not in a project yet' using errcode = '22023';
  end if;
  v_type := public.project_type_code(p.id);

  -- An appointment follow-up acts on the name's open appointment, recorded
  -- against the stage that appointment was set at so each project counts it.
  if r.applies_to = 'appointment' then
    select * into v_appt from public.appointments
     where lead_id = l.id and invalid_at is null
     order by appt_create_date desc, id desc
     limit 1
     for update;
    if not found then
      raise exception 'This name has no appointment to %', case r.effect when 'confirm' then 'confirm' else 'mark invalid' end
        using errcode = '22023';
    end if;
    if r.effect = 'confirm' and v_appt.confirmed_at is not null then
      raise exception 'This appointment is already confirmed' using errcode = '22023';
    end if;
    select * into r from public.call_results
     where name = r.name and project_type = case coalesce(v_appt.set_stage, l.stage) when 'dbdev' then 'DBDV' else 'APPT' end;
  elsif r.project_type <> v_type then
    raise exception '% is not a result for % projects', r.name,
      case v_type when 'DBDV' then 'database-development' else 'appointment' end using errcode = '22023';
  end if;

  if v_role <> 'admin'
     and l.assigned_user_id is distinct from v_me
     and not exists (select 1 from public.project_assignments pa where pa.project_id = l.project_id and pa.ae_user_id = v_me)
     and not (r.applies_to = 'appointment' and v_appt.user_id = v_me) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;

  -- The call itself.
  insert into public.call_records (lead_id, project_id, user_id, call_result, notes, result_id, stage, call_date)
  values (l.id, l.project_id, v_me, r.name, v_notes, r.id, l.stage, now())
  returning id into v_call;

  select id into v_status from public.lead_statuses where code = r.status_code;

  update public.leads set
    result_id        = r.id,
    call_result_dbdv = case when r.project_type = 'DBDV' then r.name else call_result_dbdv end,
    call_result_appt = case when r.project_type = 'APPT' then r.name
                            when r.effect = 'appointment_invalid' and stage = 'appt' then r.name
                            else call_result_appt end,
    call_weight      = call_weight + case when r.applies_to = 'name' then 1 else 0 end,
    date_last_worked = now(),
    status_id        = coalesce(v_status, status_id),
    resolved_at      = case when r.viable then null else coalesce(resolved_at, now()) end,
    assigned_user_id = case when r.effect = 'pending' then null else assigned_user_id end
  where id = l.id;

  -- What the result does.
  if r.effect in ('promote', 'appointment') then
    if r.effect = 'appointment' then
      v_date := nullif(p_appointment->>'date', '')::date;
      v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
      if v_date is null then
        raise exception 'Choose the appointment date' using errcode = '22023';
      end if;
      if v_date < current_date - 1 then
        raise exception 'The appointment date has passed' using errcode = '22023';
      end if;
      if v_time is not null and v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
        raise exception 'Give the time like 9:30 AM' using errcode = '22023';
      end if;
    end if;

    -- From DBDev, the name moves to the linked appointment project.
    if v_type = 'DBDV' then
      if p.appt_project_id is null then
        raise exception 'Link % to an appointment project before promoting its names', p.name using errcode = '22023';
      end if;
      select * into a_r from public.call_results
       where project_type = 'APPT' and name = case r.effect when 'promote' then 'Lead-No Contact' else r.name end;
      -- A new lead goes to the appointment manager with the fewest names; an
      -- appointment stays with the rep who set it, who confirms it.
      v_rep := case r.effect when 'promote' then public.least_loaded_rep(p.appt_project_id) else v_me end;
      update public.leads set
        stage             = 'appt',
        project_id        = p.appt_project_id,
        source_project_id = coalesce(source_project_id, l.project_id),
        dbdv_user_id      = v_me,
        assigned_user_id  = v_rep,
        result_id         = a_r.id,
        call_result_appt  = a_r.name,
        call_weight       = 0,
        promoted_at       = now(),
        resolved_at       = case when a_r.viable then null else now() end
      where id = l.id;
    end if;

    if r.effect = 'appointment' then
      insert into public.appointments
        (lead_id, user_id, rep_name, appt_date, appt_time, duration_min, status_id, list_source,
         call_result_dbdv, project_id, set_project_id, set_stage, call_record_id, qa_status)
      values
        (l.id, v_me, nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), v_date, v_time,
         coalesce(nullif(p_appointment->>'duration', '')::int, 30),
         (select id from public.appointment_statuses where name = 'Scheduled'),
         l.list_source,
         case when v_type = 'DBDV' then r.name end,
         coalesce(p.appt_project_id, p.id), p.id, l.stage, v_call, 'pending')
      returning * into v_appt;
      update public.leads set appt_created_date = now() where id = l.id;
      update public.call_records set appointment_id = v_appt.id where id = v_call;
    end if;

    v_pay := v_pay || public.pay(v_me, p.id, r.pay_kind, l.id, v_appt.id, v_call);

  elsif r.effect = 'confirm' then
    update public.appointments set
      status_id    = (select id from public.appointment_statuses where name = 'Confirmed'),
      confirmed_at = now(),
      confirmed_by = v_me,
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := v_pay || public.pay(v_me, coalesce(v_appt.set_project_id, p.id), 'confirmation', l.id, v_appt.id, v_call);
    -- The client hears now only if QA has already let them see it.
    if coalesce(v_appt.qa_status, 'passed') = 'passed' then
      perform public.notify_client_appointment(v_appt.id, true);
    end if;

  elsif r.effect = 'appointment_invalid' then
    update public.appointments set
      invalid_at = now(),
      status_id  = (select id from public.appointment_statuses where name = 'Invalid'),
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := public.charge_back(l.id, v_appt.id, array['appointment', 'confirmation'], v_call, 'Appointment invalid');

  elsif r.effect = 'lead_invalid' then
    update public.leads set call_result_dbdv = 'Lead-Invalid' where id = l.id and source_project_id is not null;
    v_pay := public.charge_back(l.id, null, array['lead'], v_call, 'Lead invalid');
    -- No record of the original payment (an older lead): charge the developer at today's rate.
    if jsonb_array_length(v_pay) = 0 and l.dbdv_user_id is not null and l.source_project_id is not null then
      insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
      select l.dbdv_user_id, l.source_project_id, l.id, v_call, 'lead', -sp.lead_rate, 'Lead invalid (no original payment on record)', v_me
        from public.projects sp where sp.id = l.source_project_id;
      v_pay := jsonb_build_array(jsonb_build_object('user_id', l.dbdv_user_id, 'kind', 'lead',
                 'amount', -(select lead_rate from public.projects where id = l.source_project_id)));
    end if;
    if l.dbdv_user_id is not null then
      perform public.notify_users(
        array[l.dbdv_user_id], 'lead', 'Lead marked invalid: ' || coalesce(l.company_name, 'a lead'),
        concat_ws(' · ', 'Charged back on your production report', 'marked by ' || public.actor_name()),
        '/leads/' || l.id, 'lead_invalid');
    end if;

  elsif r.effect = 'correct_xdate' then
    if p_corrected_xdate is null then
      raise exception 'Enter the corrected renewal date' using errcode = '22023';
    end if;
    v_old_xdate := public.lead_renewal_date(l.id);
    -- The corrected date becomes the lead's ultimate X-date, which is its
    -- renewal; the dates on the individual policy lines are left as recorded.
    update public.insurance_details set ultimate_xdate = p_corrected_xdate where lead_id = l.id;
    if not found then
      insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_corrected_xdate);
    end if;
    update public.leads set original_xdate = coalesce(original_xdate, v_old_xdate) where id = l.id;
    update public.call_records
       set notes = concat_ws(E'\n', notes, 'Renewal corrected from '
                   || coalesce(to_char(v_old_xdate, 'FMMonth YYYY'), 'none') || ' to ' || to_char(p_corrected_xdate, 'FMMonth YYYY'))
     where id = v_call;
  end if;

  select * into l from public.leads where id = l.id;
  return jsonb_build_object(
    'call_record_id', v_call,
    'lead_id',        l.id,
    'result',         r.name,
    'stage',          l.stage,
    'project_id',     l.project_id,
    'promoted',       l.project_id is distinct from p.id,
    'on_list',        (select viable and callable from public.call_results where id = l.result_id) and l.assigned_user_id is not null,
    'appointment_id', v_appt.id,
    'pay',            v_pay);
end $$;

revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date) to authenticated;

/**
 * A rep's call list on one project: names still to call, least-called first,
 * "Not Shopping" always last, then whoever was worked longest ago. It starts
 * over by itself once every name has been called the same number of times.
 * `p_search` narrows it by company, contact or phone (digits match however
 * the number is written). Managers and administrators may open another rep's list.
 */
drop function if exists public.call_list(bigint, bigint, int, int);
create or replace function public.call_list(p_project_id bigint, p_rep bigint default null,
                                            p_limit int default 50, p_offset int default 0,
                                            p_search text default null)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  result text, call_weight int, sort_last boolean, date_last_worked timestamptz,
  renewal_date date, total bigint
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_rep    bigint := coalesce(p_rep, public.app_user_id());
  v_term   text   := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text   := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  return query
    select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
           r.name, l.call_weight, r.sort_last, l.date_last_worked,
           public.lead_renewal_date(l.id), count(*) over ()
      from public.leads l
      join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id
       and l.assigned_user_id = v_rep
       and r.viable and r.callable
       and (v_term is null
            or l.company_name ilike '%' || v_term || '%'
            or l.contact_name ilike '%' || v_term || '%'
            or (length(v_digits) >= 3 and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'))
     order by r.sort_last, l.call_weight, l.date_last_worked nulls first, l.id
     limit greatest(least(coalesce(p_limit, 50), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
grant execute on function public.call_list(bigint, bigint, int, int, text) to authenticated;

/**
 * Split a project's names still to call evenly across the reps assigned to
 * it. Names held by someone no longer on the project go back in the pool,
 * a rep over their share gives up their least-called names, and a rep under
 * it takes from the pool. Names already resolved stay where they are, and
 * Pending names wait until they are released.
 */
create or replace function public.distribute_names(p_project_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reps   bigint[];
  v_k      int;
  v_total  int;
  v_base   int;
  v_extra  int;
  rep      record;
  v_target int;
  v_before jsonb;
  v_moved  int := 0;
  v_n      int;
begin
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(pa.ae_user_id order by pa.ae_user_id), '{}')
    into v_reps
    from public.project_assignments pa
    join public.users u on u.id = pa.ae_user_id and u.status = 'active'
   where pa.project_id = p_project_id;
  v_k := coalesce(array_length(v_reps, 1), 0);

  -- Names held by anyone no longer on the project go back in the pool.
  update public.leads l set assigned_user_id = null
    from public.call_results r
   where r.id = l.result_id and r.viable and r.callable
     and l.project_id = p_project_id
     and l.assigned_user_id is not null
     and not (l.assigned_user_id = any(v_reps));

  select coalesce(jsonb_object_agg(uid, n), '{}') into v_before
    from (select l.assigned_user_id as uid, count(*) as n
            from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p_project_id and r.viable and r.callable and l.assigned_user_id is not null
           group by 1) c;

  if v_k = 0 then
    return jsonb_build_object('project_id', p_project_id, 'reps', 0, 'moved', 0,
                              'message', 'Nobody is assigned to this project yet');
  end if;

  select count(*) into v_total
    from public.leads l join public.call_results r on r.id = l.result_id
   where l.project_id = p_project_id and r.viable and r.callable;
  v_base  := v_total / v_k;
  v_extra := v_total % v_k;

  -- Whoever holds most keeps the larger shares, so the fewest names move.
  for rep in
    select u.uid, row_number() over (order by coalesce(c.n, 0) desc, u.uid) as rank_no, coalesce(c.n, 0) as held
      from unnest(v_reps) as u(uid)
      left join (select l.assigned_user_id as uid, count(*) as n
                   from public.leads l join public.call_results r on r.id = l.result_id
                  where l.project_id = p_project_id and r.viable and r.callable
                  group by 1) c on c.uid = u.uid
  loop
    v_target := v_base + case when rep.rank_no <= v_extra then 1 else 0 end;
    if rep.held > v_target then
      update public.leads set assigned_user_id = null
       where id in (select l.id from public.leads l join public.call_results r on r.id = l.result_id
                     where l.project_id = p_project_id and l.assigned_user_id = rep.uid and r.viable and r.callable
                     order by l.call_weight, l.date_last_worked nulls first, l.id desc
                     limit rep.held - v_target);
      get diagnostics v_n = row_count;
      v_moved := v_moved + v_n;
    end if;
  end loop;

  for rep in
    select u.uid, row_number() over (order by coalesce(c.n, 0) desc, u.uid) as rank_no, coalesce(c.n, 0) as held
      from unnest(v_reps) as u(uid)
      left join (select l.assigned_user_id as uid, count(*) as n
                   from public.leads l join public.call_results r on r.id = l.result_id
                  where l.project_id = p_project_id and r.viable and r.callable
                  group by 1) c on c.uid = u.uid
  loop
    v_target := v_base + case when rep.rank_no <= v_extra then 1 else 0 end;
    if rep.held < v_target then
      update public.leads set assigned_user_id = rep.uid
       where id in (select l.id from public.leads l join public.call_results r on r.id = l.result_id
                     where l.project_id = p_project_id and l.assigned_user_id is null and r.viable and r.callable
                     order by l.id
                     limit v_target - rep.held);
    end if;
  end loop;

  return jsonb_build_object(
    'project_id', p_project_id,
    'names', v_total,
    'reps', v_k,
    'moved', v_moved,
    'before', v_before,
    'after', (select coalesce(jsonb_object_agg(uid, n), '{}')
                from (select l.assigned_user_id as uid, count(*) as n
                        from public.leads l join public.call_results r on r.id = l.result_id
                       where l.project_id = p_project_id and r.viable and r.callable and l.assigned_user_id is not null
                       group by 1) c));
end $$;
revoke execute on function public.distribute_names(bigint) from public, anon, authenticated;

create or replace function public.distribute_project_names(p_project_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can distribute names' using errcode = '42501';
  end if;
  return public.distribute_names(p_project_id);
end $$;
revoke execute on function public.distribute_project_names(bigint) from public, anon;
grant execute on function public.distribute_project_names(bigint) to authenticated;

/**
 * QA an appointment set from a call. Passing it tells the client; failing it
 * tells whoever set it. Nobody but an administrator reviews their own.
 */
create or replace function public.review_appointment_qa(p_appointment_id bigint, p_passed boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_role text   := public.app_role();
  v_appt public.appointments;
  v_lead text;
begin
  if v_me is null or v_role not in ('admin', 'agent') then
    raise exception 'Only administrators and QA staff can review appointments' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'That appointment no longer exists' using errcode = 'P0002';
  end if;
  if v_appt.qa_status is distinct from 'pending' then
    raise exception 'This appointment has already been reviewed' using errcode = '22023';
  end if;
  if v_appt.user_id = v_me and v_role <> 'admin' then
    raise exception 'Someone else has to QA an appointment you set' using errcode = '42501';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Keep the QA note under 500 characters' using errcode = '22023';
  end if;

  update public.appointments set
    qa_status = case when p_passed then 'passed' else 'failed' end,
    qa_by = v_me, qa_at = now(), qa_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_appt.id;
  update public.call_records set
    qa_result = case when p_passed then 'Passed' else 'Failed' end,
    qa_date = now()
  where id = v_appt.call_record_id;

  select company_name into v_lead from public.leads where id = v_appt.lead_id;
  if p_passed then
    perform public.notify_client_appointment(v_appt.id, v_appt.confirmed_at is not null);
  elsif v_appt.user_id is not null then
    perform public.notify_users(
      array[v_appt.user_id], 'appointment', 'Appointment failed QA: ' || coalesce(v_lead, 'a lead'),
      coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'See the lead sheet for details'),
      '/leads/' || v_appt.lead_id, 'appt_qa');
  end if;
  return jsonb_build_object('appointment_id', v_appt.id, 'qa_status', case when p_passed then 'passed' else 'failed' end);
end $$;
revoke execute on function public.review_appointment_qa(bigint, boolean, text) from public, anon;
grant execute on function public.review_appointment_qa(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Bring existing records into the lifecycle
--
-- A function, so the seed (and anything that loads names without results)
-- can run it again after loading; every step only touches what it has not
-- done before.
-- ---------------------------------------------------------------------------
create or replace function public.lifecycle_backfill()
returns void
language plpgsql security definer set search_path = public as $$
declare
  pid bigint;
begin
  -- Pair each DBDev project with its client's appointment project, where there is exactly one.
  update public.projects d
     set appt_project_id = (select a.id from public.projects a join public.project_types t on t.id = a.project_type_id
                             where t.code = 'APPT' and a.company_id = d.company_id)
   where d.appt_project_id is null
     and d.company_id is not null
     and public.project_type_code(d.id) = 'DBDV'
     and (select count(*) from public.projects a join public.project_types t on t.id = a.project_type_id
           where t.code = 'APPT' and a.company_id = d.company_id) = 1;

  -- Stage from the project type; DBDev names remember where they were developed.
  update public.leads l
     set stage = case when public.project_type_code(l.project_id) = 'APPT' then 'appt' else 'dbdev' end,
         source_project_id = case when public.project_type_code(l.project_id) = 'DBDV' then l.project_id else l.source_project_id end
   where l.result_id is null;

  -- Results from the old names on the record.
  update public.leads l
     set result_id = coalesce(public.call_result_from_text('DBDV', l.call_result_dbdv),
                              public.call_result_from_text('DBDV', 'Viable-No Contact'))
   where l.result_id is null and l.stage = 'dbdev';

  update public.leads l
     set result_id = coalesce(public.call_result_from_text('APPT', l.call_result_appt),
                              public.call_result_from_text('APPT', 'Lead-No Contact'))
   where l.result_id is null and l.stage = 'appt';

  -- Names the old system had already made leads or appointments move to the
  -- linked appointment project, and are shared out among its appointment managers.
  update public.leads l
     set stage = 'appt',
         project_id = p.appt_project_id,
         promoted_at = coalesce(l.lead_date, l.updated_at),
         dbdv_user_id = coalesce(l.dbdv_user_id, l.assigned_user_id),
         result_id = coalesce(public.call_result_from_text('APPT', l.call_result_appt),
                              case r.effect when 'appointment' then public.call_result_from_text('APPT', r.name)
                                            else public.call_result_from_text('APPT', 'Lead-No Contact') end),
         call_weight = 0
    from public.call_results r, public.projects p
   where r.id = l.result_id and r.effect in ('promote', 'appointment')
     and l.stage = 'dbdev' and p.id = l.project_id and p.appt_project_id is not null;

  update public.leads l
     set resolved_at = coalesce(l.date_last_worked, l.updated_at)
    from public.call_results r
   where r.id = l.result_id and not r.viable and l.resolved_at is null;

  update public.leads l
     set call_weight = c.n
    from (select lead_id, project_id, count(*)::int as n from public.call_records group by 1, 2) c
   where c.lead_id = l.id and c.project_id = l.project_id and l.call_weight = 0;



  -- Appointments already on the books have been seen by the client.
  update public.appointments a
     set project_id = l.project_id,
         set_project_id = coalesce(a.set_project_id, l.project_id),
         set_stage = coalesce(a.set_stage, l.stage),
         qa_status = coalesce(a.qa_status, 'passed'),
         confirmed_at = case when (select s.name from public.appointment_statuses s where s.id = a.status_id) = 'Confirmed'
                             then coalesce(a.confirmed_at, a.status_update_date, a.updated_at) else a.confirmed_at end
    from public.leads l
   where l.id = a.lead_id and a.project_id is null;

  -- Promoted names whose rep is not on the appointment project get shared out there.
  for pid in
    select distinct l.project_id
      from public.leads l
      join public.call_results r on r.id = l.result_id and r.viable and r.callable
     where l.stage = 'appt' and l.promoted_at is not null and l.project_id is not null
       and not exists (select 1 from public.project_assignments pa
                        where pa.project_id = l.project_id and pa.ae_user_id = l.assigned_user_id)
       and exists (select 1 from public.project_assignments pa where pa.project_id = l.project_id and pa.ae_user_id is not null)
  loop
    perform public.distribute_names(pid);
  end loop;
end $$;
revoke execute on function public.lifecycle_backfill() from public, anon, authenticated;
grant execute on function public.lifecycle_backfill() to service_role;

select public.lifecycle_backfill();
alter table public.leads alter column result_id set not null;

drop trigger if exists leads_stage on public.leads;
create trigger leads_stage
  before insert or update of project_id, result_id on public.leads
  for each row execute function public.tg_leads_stage();

-- ===== supabase/migrations/20261001100000_account_manager_screens.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the account manager's day
--
-- What the screens need on top of the lifecycle engine:
--   work_projects()   "My Projects": the projects someone is assigned to (all of
--                     them for an administrator), with the names they have left,
--                     appointments waiting on their confirmation, and when they
--                     last worked each one
--   get_lookups()     projects now carry their client and type, so a DBDev
--                     project can be paired with its client's Appt project
-- ---------------------------------------------------------------------------

create or replace function public.work_projects()
returns table (
  id bigint, name text, client text, company_id bigint, type text, timezone text,
  state text, status text, appt_project_id bigint,
  names_left bigint,       -- the caller's names still to call
  names_left_all bigint,   -- everyone's (what an administrator watches)
  follow_ups bigint,       -- the caller's upcoming appointments waiting to be confirmed
  last_worked timestamptz  -- the caller's last call on the project
)
language sql stable security invoker set search_path = public as $$
  with me as (select public.app_user_id() as uid, coalesce(public.is_admin(), false) as admin)
  select p.id, p.name, co.name, p.company_id, t.code, tz.name, p.state, ps.name, p.appt_project_id,
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and l.assigned_user_id = me.uid and r.viable and r.callable),
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and r.viable and r.callable),
         (select count(*) from public.appointments a
           where a.set_project_id = p.id and a.user_id = me.uid and a.confirmed_at is null and a.invalid_at is null
             and a.appt_date >= current_date - 1),
         (select max(c.call_date) from public.call_records c where c.project_id = p.id and c.user_id = me.uid)
    from public.projects p
    cross join me
    left join public.companies co        on co.id = p.company_id
    left join public.project_types t     on t.id = p.project_type_id
    left join public.timezones tz        on tz.id = p.timezone_id
    left join public.project_statuses ps on ps.id = p.status_id
   where me.uid is not null
     and (me.admin or exists (select 1 from public.project_assignments pa
                               where pa.project_id = p.id and pa.ae_user_id = me.uid))
   order by p.name;
$$;
grant execute on function public.work_projects() to authenticated;

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
    'projects',        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'company_id', p.company_id, 'type', t.code) order by p.name), '[]'::jsonb)
                          from public.projects p left join public.project_types t on t.id = p.project_type_id),
    'managers',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'email', email) order by id), '[]'::jsonb)
                          from public.users where role in ('manager', 'agent')),
    'agencies',        (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.agencies),
    'companies',       (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.companies)
  );
$$;

-- ===== supabase/migrations/20261002100000_lead_volume.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — lead volume over a chosen period
--
-- The dashboard's Lead Volume chart showed a fixed eight weeks. It now offers
-- one, two, six or twelve months; this returns new leads per day over the
-- last year (only days that have any), and the chart groups them into days,
-- weeks or months for the period picked, without another round trip.
--
-- Security invoker: Row Level Security scopes the counts to what the caller
-- may see, like every other dashboard figure.
-- ---------------------------------------------------------------------------

create or replace function public.lead_volume_daily(p_days int default 366)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'leads', t.n) order by t.day), '[]'::jsonb)
    from (
      select (coalesce(l.lead_date, l.created_at) at time zone 'UTC')::date as day, count(*) as n
        from public.leads l
       where coalesce(l.lead_date, l.created_at) >= now() - make_interval(days => least(greatest(coalesce(p_days, 366), 1), 800))
       group by 1
    ) t;
$$;

revoke execute on function public.lead_volume_daily(int) from public, anon;
grant execute on function public.lead_volume_daily(int) to authenticated;

-- ===== supabase/migrations/20261002120000_admin_side.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the administrator's side
--
-- What the project drill-down and the two new reports need:
--   business_tz()        the time zone a "day" is counted in: the
--                        'business_timezone' setting, America/Phoenix until set
--   project_overview()   one project's true totals, for its page tiles
--   project_reps()       who works a project: names held, calls today and this
--                        month, appointments this month, last worked
--   set_project_rep()    put a rep on a project or take them off, and share its
--                        names out evenly again, in one transaction
--   xdates_by_month()    renewals per month of the year: total, appointments,
--                        off the list, viable left
--   xdate_month_leads()  the leads behind any number in that report
--   production_report()  calls and paid events per day, rep and project
--   set_project_rates()  an administrator sets a project's pay rates
--
-- Reads are security invoker: Row Level Security scopes them as everywhere
-- else. The production report shows anyone but an administrator only their
-- own rows, as pay_events already does.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Days
-- ---------------------------------------------------------------------------

/** The business's time zone, for "today" and "this month". Unknown names fall back to Phoenix. */
create or replace function public.business_tz()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value->>'name' from public.app_settings s
      where s.key = 'business_timezone'
        and exists (select 1 from pg_timezone_names z where z.name = s.value->>'name')),
    'America/Phoenix');
$$;
revoke execute on function public.business_tz() from public, anon;
grant execute on function public.business_tz() to authenticated;

/** Midnight today and on the 1st of this month, in the business's time zone. */
create or replace function public.business_bounds(out day_start timestamptz, out month_start timestamptz)
language sql stable security invoker set search_path = public as $$
  select date_trunc('day', now() at time zone tz) at time zone tz,
         date_trunc('month', now() at time zone tz) at time zone tz
    from (select public.business_tz() as tz) t;
$$;
grant execute on function public.business_bounds() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pay events: which rows are chargebacks
--
-- A chargeback normally reverses a payment (reverses_id). One for an older
-- lead with no payment on record to reverse is written at minus today's
-- rate, which is $0 until rates are set, so its note is what marks it.
-- ---------------------------------------------------------------------------

alter table public.pay_events
  add column if not exists is_chargeback boolean generated always as (
    reverses_id is not null or amount < 0 or coalesce(note, '') like 'Lead invalid (no original payment%'
  ) stored;

-- ---------------------------------------------------------------------------
-- 3. One project, as an administrator watches it
-- ---------------------------------------------------------------------------

create or replace function public.project_overview(p_project_id bigint)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with b as (select * from public.business_bounds()),
  l as (
    select l.assigned_user_id, r.viable, r.callable
      from public.leads l join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id
  ),
  a as (
    select a.qa_status, a.appt_create_date from public.appointments a
     where (a.project_id = p_project_id or a.set_project_id = p_project_id) and a.invalid_at is null
  ),
  c as (select c.call_date from public.call_records c where c.project_id = p_project_id),
  days as (
    select generate_series(0, 13) as ago
  )
  select jsonb_build_object(
    'leads',        (select count(*) from l),
    'viable_left',  (select count(*) from l where viable and callable),
    'unassigned',   (select count(*) from l where viable and callable and assigned_user_id is null),
    'pending',      (select count(*) from l where viable and not callable),
    'off_list',     (select count(*) from l where not viable),
    'appointments', (select count(*) from a),
    'appts_month',  (select count(*) from a, b where a.appt_create_date >= b.month_start),
    'qa_pending',   (select count(*) from a where a.qa_status = 'pending'),
    'calls_today',  (select count(*) from c, b where c.call_date >= b.day_start),
    'calls_month',  (select count(*) from c, b where c.call_date >= b.month_start),
    'last_worked',  (select max(c.call_date) from c),
    -- Calls per day for the last two weeks, oldest first (the tile sparkline).
    'calls_14d',    (select coalesce(jsonb_agg(n order by ago desc), '[]'::jsonb)
                       from (select d.ago, (select count(*) from c, b
                                             where c.call_date >= b.day_start - make_interval(days => d.ago)
                                               and c.call_date <  b.day_start - make_interval(days => d.ago - 1)) as n
                               from days d) t)
  );
$$;
revoke execute on function public.project_overview(bigint) from public, anon;
grant execute on function public.project_overview(bigint) to authenticated;

create or replace function public.project_reps(p_project_id bigint)
returns table (
  user_id bigint, first_name text, last_name text, email text, role text, status text,
  names_left bigint,   -- names still to call on their list
  leads_held bigint,   -- every name on the project in their hands, resolved or not
  calls_today bigint, calls_month bigint,
  appts_month bigint,  -- appointments they set from this project this month
  last_worked timestamptz
)
language sql stable security invoker set search_path = public as $$
  select u.id, u.first_name, u.last_name, u.email, u.role, u.status,
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p_project_id and l.assigned_user_id = u.id and r.viable and r.callable),
         (select count(*) from public.leads l where l.project_id = p_project_id and l.assigned_user_id = u.id),
         (select count(*) from public.call_records c
           where c.project_id = p_project_id and c.user_id = u.id and c.call_date >= b.day_start),
         (select count(*) from public.call_records c
           where c.project_id = p_project_id and c.user_id = u.id and c.call_date >= b.month_start),
         (select count(*) from public.appointments a
           where a.set_project_id = p_project_id and a.user_id = u.id and a.invalid_at is null
             and a.appt_create_date >= b.month_start),
         (select max(c.call_date) from public.call_records c where c.project_id = p_project_id and c.user_id = u.id)
    from (select distinct pa.ae_user_id from public.project_assignments pa
           where pa.project_id = p_project_id and pa.ae_user_id is not null) pa
    join public.users u on u.id = pa.ae_user_id
    cross join public.business_bounds() b
   order by u.first_name, u.last_name, u.id;
$$;
revoke execute on function public.project_reps(bigint) from public, anon;
grant execute on function public.project_reps(bigint) to authenticated;

/**
 * Put a rep on a project (p_on) or take them off, then share the project's
 * names still to call evenly across whoever is on it now. Returns what
 * distribute_names() reports: names, reps, how many moved, before and after.
 */
create or replace function public.set_project_rep(p_project_id bigint, p_user_id bigint, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user public.users;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can change who works a project' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'That person no longer has an account' using errcode = 'P0002';
  end if;

  if p_on then
    if v_user.role not in ('admin', 'manager', 'agent') then
      raise exception 'Only staff can work a project' using errcode = '22023';
    end if;
    if v_user.status is distinct from 'active' then
      raise exception '% cannot work a project until their account is active',
        coalesce(nullif(concat_ws(' ', v_user.first_name, v_user.last_name), ''), v_user.email) using errcode = '22023';
    end if;
    insert into public.project_assignments (project_id, ae_user_id)
    select p_project_id, p_user_id
     where not exists (select 1 from public.project_assignments
                        where project_id = p_project_id and ae_user_id = p_user_id);
  else
    -- A row that also links a client contact keeps that link.
    update public.project_assignments set ae_user_id = null
     where project_id = p_project_id and ae_user_id = p_user_id and cl_user_id is not null;
    delete from public.project_assignments
     where project_id = p_project_id and ae_user_id = p_user_id;
  end if;

  return public.distribute_names(p_project_id);
end $$;
revoke execute on function public.set_project_rep(bigint, bigint, boolean) from public, anon;
grant execute on function public.set_project_rep(bigint, bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. X-dates by month
--
-- A renewal comes round every year, so names group by the month of their
-- renewal date (lead_renewal_date(): the ultimate X-date, else the earliest
-- policy line), January to December; month 0 is "no renewal date". Each name
-- is in one bucket:
--   appointment  its result set an appointment (or confirmed one)
--   off          taken off the list for another reason (not qualified, DNC…)
--   viable       still to work
-- ---------------------------------------------------------------------------

create or replace function public.lead_xdate_bucket(p_viable boolean, p_effect text)
returns text
language sql immutable set search_path = public as $$
  select case when p_effect in ('appointment', 'confirm') then 'appointment'
              when p_viable then 'viable'
              else 'off' end;
$$;

create or replace function public.xdates_by_month(p_project_id bigint default null, p_company_id bigint default null)
returns table (month int, total bigint, appointments bigint, off_list bigint, viable_left bigint)
language sql stable security invoker set search_path = public as $$
  with x as (
    select coalesce(extract(month from public.lead_renewal_date(l.id))::int, 0) as m,
           public.lead_xdate_bucket(r.viable, r.effect) as bucket
      from public.leads l
      join public.call_results r on r.id = l.result_id
      left join public.projects p on p.id = l.project_id
     where (p_project_id is null or l.project_id = p_project_id)
       and (p_company_id is null or p.company_id = p_company_id)
  )
  select m, count(*),
         count(*) filter (where bucket = 'appointment'),
         count(*) filter (where bucket = 'off'),
         count(*) filter (where bucket = 'viable')
    from x
   group by m
   order by m;
$$;
revoke execute on function public.xdates_by_month(bigint, bigint) from public, anon;
grant execute on function public.xdates_by_month(bigint, bigint) to authenticated;

/** One page of the names behind a number in xdates_by_month(); p_bucket null means all of them. */
create or replace function public.xdate_month_leads(
  p_month int, p_bucket text default null, p_project_id bigint default null, p_company_id bigint default null,
  p_limit int default 20, p_offset int default 0
)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  project text, result text, renewal_date date, rep_first text, rep_last text, rep_email text, total bigint
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
         p.name, r.name, x.renewal, u.first_name, u.last_name, u.email, count(*) over ()
    from public.leads l
    join public.call_results r on r.id = l.result_id
    left join public.projects p on p.id = l.project_id
    left join public.users u on u.id = l.assigned_user_id
    cross join lateral (select public.lead_renewal_date(l.id) as renewal) x
   where (p_project_id is null or l.project_id = p_project_id)
     and (p_company_id is null or p.company_id = p_company_id)
     and coalesce(extract(month from x.renewal)::int, 0) = p_month
     and (p_bucket is null or public.lead_xdate_bucket(r.viable, r.effect) = p_bucket)
   order by extract(day from x.renewal) nulls last, l.company_name, l.id
   limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.xdate_month_leads(int, text, bigint, bigint, int, int) from public, anon;
grant execute on function public.xdate_month_leads(int, text, bigint, bigint, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Daily production and pay
-- ---------------------------------------------------------------------------

/**
 * Per day (in the business's time zone), rep and project: calls made, and
 * the paid events with their total. A chargeback counts once and its
 * negative amount comes off the total. Anyone but an administrator sees
 * only their own rows, whatever p_user_id says.
 */
create or replace function public.production_report(p_from date, p_to date,
                                                    p_project_id bigint default null, p_user_id bigint default null)
returns table (
  day date, user_id bigint, first_name text, last_name text, email text,
  project_id bigint, project text,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint,
  amount numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user_id else public.app_user_id() end;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a start date on or before the end date' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;

  return query
  with c as (
    select (cr.call_date at time zone v_tz)::date as d, cr.user_id as uid, cr.project_id as pid, count(*) as n
      from public.call_records cr
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date <  ((p_to + 1)::timestamp at time zone v_tz)
       and cr.user_id is not null
       and (v_user is null or cr.user_id = v_user)
       and (p_project_id is null or cr.project_id = p_project_id)
     group by 1, 2, 3
  ),
  e as (
    select (pe.created_at at time zone v_tz)::date as d, pe.user_id as uid, pe.project_id as pid,
           count(*) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as leads,
           count(*) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appts,
           count(*) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as confirms,
           count(*) filter (where pe.is_chargeback) as backs,
           sum(pe.amount) as amount
      from public.pay_events pe
     where pe.created_at >= (p_from::timestamp at time zone v_tz)
       and pe.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
       and pe.user_id is not null
       and (v_user is null or pe.user_id = v_user)
       and (p_project_id is null or pe.project_id = p_project_id)
     group by 1, 2, 3
  ),
  k as (select c.d, c.uid, c.pid from c union select e.d, e.uid, e.pid from e)
  select k.d, k.uid, u.first_name, u.last_name, u.email, k.pid, p.name,
         coalesce(c.n, 0), coalesce(e.leads, 0), coalesce(e.appts, 0), coalesce(e.confirms, 0), coalesce(e.backs, 0),
         coalesce(e.amount, 0)::numeric
    from k
    left join c on c.d = k.d and c.uid = k.uid and c.pid is not distinct from k.pid
    left join e on e.d = k.d and e.uid = k.uid and e.pid is not distinct from k.pid
    left join public.users u on u.id = k.uid
    left join public.projects p on p.id = k.pid
   order by k.d desc, u.first_name, u.last_name, p.name;
end $$;
revoke execute on function public.production_report(date, date, bigint, bigint) from public, anon;
grant execute on function public.production_report(date, date, bigint, bigint) to authenticated;

/** Set one project's pay rates (administrators only; the projects trigger enforces it too). */
create or replace function public.set_project_rates(p_project_id bigint, p_lead numeric, p_appointment numeric, p_confirmation numeric)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_row public.projects;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  if least(p_lead, p_appointment, p_confirmation) < 0 or greatest(p_lead, p_appointment, p_confirmation) > 10000 then
    raise exception 'Rates must be between $0 and $10,000' using errcode = '22023';
  end if;
  update public.projects
     set lead_rate = round(coalesce(p_lead, 0), 2),
         appointment_rate = round(coalesce(p_appointment, 0), 2),
         confirmation_rate = round(coalesce(p_confirmation, 0), 2)
   where id = p_project_id
  returning * into v_row;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'lead_rate', v_row.lead_rate,
                            'appointment_rate', v_row.appointment_rate, 'confirmation_rate', v_row.confirmation_rate);
end $$;
revoke execute on function public.set_project_rates(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function public.set_project_rates(bigint, numeric, numeric, numeric) to authenticated;

-- ===== supabase/migrations/20261003100000_calendar.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the date picker's appointment dots
--
-- When a date is picked for an appointment, each day of the month on show
-- carries a dot for every appointment already on it (up to three), so a rep
-- sees which days are filling up before choosing one.
--
-- Security invoker: Row Level Security decides which appointments count, as
-- everywhere else (a client counts only their own, once QA has passed them).
-- At most 93 days at a time: a month view shows six weeks.
-- ---------------------------------------------------------------------------

create or replace function public.appointment_day_counts(p_from date, p_to date)
returns table (day date, appointments bigint)
language sql stable security invoker set search_path = public as $$
  select a.appt_date, count(*)
    from public.appointments a
   where a.appt_date between p_from and least(p_to, p_from + 92)
     and a.invalid_at is null
   group by a.appt_date
   order by a.appt_date;
$$;

revoke execute on function public.appointment_day_counts(date, date) from public, anon;
grant execute on function public.appointment_day_counts(date, date) to authenticated;

-- ===== supabase/migrations/20261005100000_search_and_scale.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — search that finds things, at the size of the real book
--
--   search_words()         what was typed, as words: every word must match
--                          ("Sean Fitzgerald", "Drain, LLC", "(602) 851-8511",
--                          "+1 602 851 8511"); a number-like word as digits
--   search_doc()           text as a search reads it: lower-case, plus each
--                          run of digits and phone punctuation as bare digits,
--                          so a number matches however either side wrote it
--   leads.search_text      company, contact, city, state, ZIP, email and phone
--                          through search_doc(), with a trigram index: one
--                          place every lead search looks, fast at 100k+
--   global_search()        Ctrl+K: all words, per-group totals, the client and
--                          status beside each hit, only the groups asked for
--   lead_explore()         renewal month from any policy line (not only the
--                          ultimate X-date), carriers by name (as imports store
--                          them) as well as by record, the same word search
--   call_list()            a rep's list searched word by word, like the rest
--   notifications          the sender's name on every message, so a recipient
--                          (a client included) sees who it is from
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. What is searched, and what was typed
-- ---------------------------------------------------------------------------

/**
 * Text as a search reads it: lower-case, then each run of digits and phone
 * punctuation again as bare digits. "(602) 851-8511" also reads
 * "6028518511", "24-7 Plumbing" also "247", so a number-like word typed in
 * any style (search_words() cuts it to digits) finds it. Matches
 * searchDoc() in src/lib/search-words.js.
 */
create or replace function public.search_doc(t text)
returns text
language sql immutable parallel safe set search_path = public as $$
  select lower(coalesce(t, '')) || coalesce(' ' || (
           select string_agg(regexp_replace(m[1], '\D', '', 'g'), ' ')
             from regexp_matches(lower(coalesce(t, '')), '([0-9][0-9().+ -]*[0-9])', 'g') as m), '');
$$;

alter table public.leads
  add column if not exists search_text text
    -- || rather than concat_ws(), which is not immutable and so cannot feed a generated column.
    generated always as (public.search_doc(
      coalesce(company_name, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' || coalesce(zip, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))) stored;

create index if not exists leads_search_text_trgm on public.leads using gin (search_text extensions.gin_trgm_ops);

/**
 * What someone typed, as lower-case words ready for LIKE, at most eight:
 *   - punctuation that only separates (commas, brackets, quotes, semicolons,
 *     backslashes) splits words: "AZ Pro Plumbing and Drain, LLC" is six;
 *   - a US country code in front of a number is dropped ("+1", or "1"
 *     before an area code), and a number-like word ("851-8511",
 *     "602.851.8511", "1-602-851-8511") becomes its digits, without a
 *     leading country code;
 *   - LIKE's wildcards are escaped.
 * Matches searchWords() and wordForms() in src/lib/search-words.js.
 */
create or replace function public.search_words(q text)
returns text[]
language sql immutable parallel safe set search_path = public as $$
  with parts as (
    select ord, part, lead(part) over (order by ord) as next
      from unnest(regexp_split_to_array(lower(btrim(regexp_replace(coalesce(q, ''), '[,;"''()\[\]{}\\]', ' ', 'g'))), '\s+'))
           with ordinality as t(part, ord)
     where part <> ''
  ), words as (
    select ord,
           case when part ~ '^[0-9().+-]+$' and part ~ '[0-9]{2}'
                then regexp_replace(regexp_replace(part, '\D', '', 'g'), '^1([0-9]{10})$', '\1')
                else regexp_replace(part, '([%_\\])', '\\\1', 'g') end as w
      from parts
     where part <> '+1' and not (part = '1' and coalesce(next, '') ~ '^[0-9]{3}$')
  )
  select coalesce(array_agg(w order by ord), '{}')
    from (select ord, w from words where w <> '' order by ord limit 8) x;
$$;

/** '%word%' for each word: the patterns for `text LIKE ALL (...)`. */
create or replace function public.search_patterns(words text[])
returns text[]
language sql immutable parallel safe set search_path = public as $$
  select coalesce(array_agg('%' || w || '%'), '{}') from unnest(words) w;
$$;

/** The longest word's pattern: the one a trigram index narrows best, checked first. Null for no words. */
create or replace function public.search_lead_pattern(words text[])
returns text
language sql immutable parallel safe set search_path = public as $$
  select '%' || w || '%' from unnest(words) w order by length(w) desc, w limit 1;
$$;

/** A carrier's name as a filter compares it: lower-case, commas and runs of spaces as one space. */
create or replace function public.carrier_key(name text)
returns text
language sql immutable parallel safe set search_path = public as $$
  select nullif(btrim(regexp_replace(lower(coalesce(name, '')), '[\s,]+', ' ', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- 2. Ctrl+K
-- ---------------------------------------------------------------------------

drop function if exists public.global_search(text, int);

/**
 * Search every record type at once. Every word typed must appear (in any
 * order, in any of the record's fields). Each group comes back as
 * { total, items }, items carrying what the palette shows beside them: a
 * lead's contact, place, client and status; a project's client and status.
 * `groups` limits it to the kinds the caller can open (the app passes the
 * ones the role's pages allow). Row Level Security still scopes everything.
 */
create or replace function public.global_search(q text, per_group int default 5,
                                                groups text[] default array['leads','clients','projects','users','documents','carriers'])
returns jsonb
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_words text[] := public.search_words(q);
  v_pats  text[] := public.search_patterns(v_words);
  v_first text   := public.search_lead_pattern(v_words);
  v_n     int    := greatest(least(coalesce(per_group, 5), 20), 1);
  v_out   jsonb  := '{}'::jsonb;
  v_items jsonb;
  v_total bigint;
begin
  if cardinality(v_words) = 0 then
    return v_out;
  end if;

  if 'leads' = any(groups) then
    with hits as (
      select l.id, l.company_name, l.contact_name, l.city, l.state, l.phone, l.lead_date, l.project_id, l.status_id
        from public.leads l
       where l.search_text like v_first and l.search_text like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.lead_date desc nulls last, x.id desc), '[]'::jsonb) from (
             select h.id, h.lead_date, h.company_name as title, h.contact_name as contact,
                    nullif(concat_ws(', ', h.city, h.state), '') as place, h.phone,
                    co.name as client, s.name as status
               from hits h
               left join public.projects p on p.id = h.project_id
               left join public.companies co on co.id = p.company_id
               left join public.lead_statuses s on s.id = h.status_id
              order by h.lead_date desc nulls last, h.id desc
              limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('leads', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'clients' = any(groups) then
    with hits as (
      select c.* from public.companies c
       where public.search_doc(concat_ws(' ', c.name, c.contact_name, c.city, c.state)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.contact_name as contact, nullif(concat_ws(', ', h.city, h.state), '') as place,
                    (select count(*) from public.projects p where p.company_id = h.id) as projects
               from hits h order by h.name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('clients', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'projects' = any(groups) then
    with hits as (
      select p.id, p.name, coalesce(c.name, p.client_name) as client, ps.name as status, t.code as type
        from public.projects p
        left join public.companies c on c.id = p.company_id
        left join public.project_statuses ps on ps.id = p.status_id
        left join public.project_types t on t.id = p.project_type_id
       where public.search_doc(concat_ws(' ', p.name, p.client_name, c.name)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.client, h.status, h.type from hits h order by h.name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('projects', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'users' = any(groups) then
    with hits as (
      select u.* from public.users u
       where public.search_doc(concat_ws(' ', u.first_name, u.last_name, u.email)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, coalesce(nullif(concat_ws(' ', h.first_name, h.last_name), ''), h.email) as title,
                    h.email, h.role, h.status
               from hits h order by h.first_name, h.last_name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('users', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'documents' = any(groups) then
    with hits as (
      select d.id, d.name, d.file_type, d.created_at, c.name as client
        from public.documents d
        left join public.companies c on c.id = d.company_id
       where public.search_doc(concat_ws(' ', d.name, c.name)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
             select h.id, h.name as title, h.file_type, h.client, h.created_at from hits h order by h.created_at desc limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('documents', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'carriers' = any(groups) then
    with hits as (
      select a.* from public.agencies a
       where public.search_doc(concat_ws(' ', a.name, a.association)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.association from hits h order by h.name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('carriers', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  return v_out;
end $$;
revoke execute on function public.global_search(text, int, text[]) from public, anon;
grant execute on function public.global_search(text, int, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lead Explorer
-- ---------------------------------------------------------------------------

/**
 * As before, with these changes. A lead's renewal is lead_renewal_date()'s
 * rule (the ultimate X-date, else the earliest policy line), so a lead
 * whose only date is on its package or workers' comp line has a renewal
 * month too. A carrier is the lead's current one: its carrier record, or
 * when it has none, the carrier name an import stored on its policy; the
 * criteria name carriers by carrier_key() (old links by record id still
 * work). Free text is the word search the rest of the app uses.
 */
create or replace function public.lead_explore(criteria jsonb default '{}'::jsonb, page int default 1, per_page int default 10)
returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'statuses',  '[]'::jsonb)))          as statuses,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select jsonb_array_elements_text(coalesce(criteria->'carriers',  '[]'::jsonb)))          as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      public.search_patterns(public.search_words(criteria->>'q'))    as pats,
      public.search_lead_pattern(public.search_words(criteria->>'q')) as first_pat
  ),
  carrier_keys as (
    select coalesce(array_agg(distinct k) filter (where k is not null), '{}') as keys
      from (
        select public.carrier_key(v) as k from c, unnest(c.carriers) v where v !~ '^[0-9]+$'
        union all
        select public.carrier_key(a.name) from public.agencies a, c
         where a.id::text = any(array(select v from unnest(c.carriers) v where v ~ '^[0-9]{1,18}$'))
      ) t
  ),
  m as (
    select l.id, l.company_name, l.contact_name, l.phone, l.email,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name,
           coalesce(ag.name, nullif(btrim(ins.agency_name), '')) as carrier_name,
           st.code as status_code, st.name as status_name,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
      cross join carrier_keys ck
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.lead_statuses st on st.id = l.status_id
      left join public.users u      on u.id  = l.assigned_user_id
     where (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.statuses) = 0 or st.code            = any(c.statuses))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
       and (cardinality(c.carriers) = 0 or public.carrier_key(coalesce(ag.name, ins.agency_name)) = any(ck.keys))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       and (cardinality(c.months)   = 0 or extract(month from coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate,
              ins.health_xdate, ins.dental_xdate, ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)))::int = any(c.months))
       -- The longest word first, which the trigram index can answer; then every word.
       and (cardinality(c.pats)     = 0 or (l.search_text like c.first_pat and l.search_text like all (c.pats)))
  ),
  win as (
    select * from m
     order by lead_date desc nulls last, id desc
     limit greatest(least(coalesce(per_page, 10), 10000), 1)
    offset least(greatest(coalesce(page, 1) - 1, 0)::bigint * greatest(least(coalesce(per_page, 10), 10000), 1), 1000000000)
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win)), '[]'::jsonb) from win),
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from renewal_date)::int as mon, count(*) as n
                            from m where renewal_date is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('code', t.status_code, 'label', coalesce(t.status_name, '—'), 'count', t.n)
                                            order by t.n desc), '[]'::jsonb)
                    from (select status_code, status_name, count(*) as n from m group by status_code, status_name) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where renewal_date is not null)
  );
$$;

/**
 * The values present in the caller's own book, for the criteria pickers.
 * Carriers are every carrier record plus every name an import stored on a
 * policy, each once however it was capitalised or punctuated (the record's
 * spelling wins), with how many leads it is the current carrier of.
 */
create or replace function public.lead_explore_options()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.sic_code, 'label', coalesce(s.description, t.sic_code), 'count', t.n)
                                             order by t.n desc), '[]'::jsonb)
                     from (select sic_code, count(*) as n from public.leads where sic_code is not null group by sic_code) t
                     left join public.sic_codes s on s.code = t.sic_code),
    'states',     (select coalesce(jsonb_agg(jsonb_build_object('value', t.state, 'label', t.state, 'count', t.n)
                                             order by t.state), '[]'::jsonb)
                     from (select state, count(*) as n from public.leads where state is not null group by state) t),
    'counties',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.county, 'label', t.county, 'count', t.n)
                                             order by t.county), '[]'::jsonb)
                     from (select county, count(*) as n from public.leads where county is not null group by county) t),
    'statuses',   (select coalesce(jsonb_agg(jsonb_build_object('value', code, 'label', name) order by id), '[]'::jsonb)
                     from public.lead_statuses),
    'clients',    (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from public.companies),
    'carriers',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.k, 'label', t.label, 'count', t.n) order by t.k), '[]'::jsonb)
                     from (select k, (array_agg(label order by rec desc, label))[1] as label, sum(n)::bigint as n
                             from (select public.carrier_key(a.name) as k, btrim(a.name) as label, true as rec, 0 as n
                                     from public.agencies a
                                   union all
                                   select public.carrier_key(coalesce(ag.name, ins.agency_name)), btrim(coalesce(ag.name, ins.agency_name)), false, 1
                                     from public.leads l
                                     left join public.agencies ag on ag.id = l.agency_id
                                     left join public.insurance_details ins on ins.lead_id = l.id) x
                            where k is not null
                            group by k) t),
    'reps',       (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', nullif(concat_ws(' ', first_name, last_name), '')) order by first_name, last_name), '[]'::jsonb)
                     from public.users where role in ('admin', 'manager', 'agent'))
  );
$$;

-- ---------------------------------------------------------------------------
-- 3b. A rep's call list, searched like everything else
-- ---------------------------------------------------------------------------

/**
 * As before, but `p_search` matches word by word, in any order, across the
 * company, contact, city, state, ZIP, email and phone (search_text), where
 * it used to need the whole phrase in one field.
 */
create or replace function public.call_list(p_project_id bigint, p_rep bigint default null,
                                            p_limit int default 50, p_offset int default 0,
                                            p_search text default null)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  result text, call_weight int, sort_last boolean, date_last_worked timestamptz,
  renewal_date date, total bigint
)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_rep   bigint := coalesce(p_rep, public.app_user_id());
  v_words text[] := public.search_words(p_search);
  v_pats  text[] := public.search_patterns(v_words);
  v_first text   := public.search_lead_pattern(v_words);
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  return query
    select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
           r.name, l.call_weight, r.sort_last, l.date_last_worked,
           public.lead_renewal_date(l.id), count(*) over ()
      from public.leads l
      join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id
       and l.assigned_user_id = v_rep
       and r.viable and r.callable
       and (v_first is null or (l.search_text like v_first and l.search_text like all (v_pats)))
     order by r.sort_last, l.call_weight, l.date_last_worked nulls first, l.id
     limit greatest(least(coalesce(p_limit, 50), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
grant execute on function public.call_list(bigint, bigint, int, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who a message is from
--
-- A recipient may not be allowed to read the users table (a client cannot),
-- so the name travels with the notification: filled in from the sender's
-- account on every insert, whichever function sends it.
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists sender_name text;

create or replace function public.tg_notifications_sender_name()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_id is not null and new.sender_name is null then
    select coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Lighthouse user')
      into new.sender_name
      from public.users u where u.id = new.sender_id;
  end if;
  return new;
end $$;

drop trigger if exists notifications_sender_name on public.notifications;
create trigger notifications_sender_name
  before insert on public.notifications
  for each row execute function public.tg_notifications_sender_name();

update public.notifications n
   set sender_name = coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Lighthouse user')
  from public.users u
 where u.id = n.sender_id and n.sender_name is null;

-- ---------------------------------------------------------------------------
-- 5. The two policies left calling auth.uid() for every row
-- ---------------------------------------------------------------------------

drop policy if exists users_read_self on public.users;
create policy users_read_self on public.users for select to authenticated
  using (auth_id = (select auth.uid()));

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (auth_id = (select auth.uid()) and (select public.app_user_id()) is not null)
  with check (auth_id = (select auth.uid()));

-- ===== supabase/migrations/20261005110000_audit_fixes.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — fixes from the October audit
--
--   1. One appointment per name at a time: recording "Appointment" again on
--      a name whose appointment is still to come (or waiting for QA) moves
--      it instead of setting and paying a second; a lead pays its developer
--      once unless that payment was charged back.
--   2. QA, confirmation and invalid marks change only through their own
--      steps; an appointment saved from a form waits for QA like one set
--      from a call.
--   3. A client's feedback can only be about their own leads and
--      appointments, filed now, as Open.
--   4. Two internal functions closed to signed-out callers.
--   5. Dashboard and report figures on the business's day: today, this week
--      (not every future appointment), lead volume per day and month; and
--      appointments marked invalid left out of every count.
--   6. The business time zone accepts only names a browser understands.
--   7. A client's appointment message comes from the rep who set it (their
--      reply goes there), and still arrives when "Appointment confirmed" is
--      switched off.
--   8. Alert rule names and log rows that say what really happened.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. One appointment per name at a time; a lead paid once
-- ---------------------------------------------------------------------------

create or replace function public.record_call_result(
  p_lead_id bigint,
  p_result_id bigint,
  p_notes text default null,
  p_appointment jsonb default null,
  p_corrected_xdate date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me       bigint := public.app_user_id();
  v_role     text   := public.app_role();
  v_notes    text   := nullif(btrim(coalesce(p_notes, '')), '');
  l          public.leads;
  r          public.call_results;
  a_r        public.call_results;      -- the appointment-stage twin of a DBDev result
  p          public.projects;          -- the project the call is made on
  v_type     text;
  v_appt     public.appointments;
  v_open     public.appointments;      -- an appointment the name already holds, which this one moves
  v_call     bigint;
  v_status   bigint;
  v_rep      bigint;
  v_old_xdate date;
  v_pay      jsonb := '[]'::jsonb;
  v_date     date;
  v_time     text;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff can record call results' using errcode = '42501';
  end if;
  if length(coalesce(v_notes, '')) > 1000 then
    raise exception 'Keep call notes under 1,000 characters' using errcode = '22023';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select * into r from public.call_results where id = p_result_id;
  if not found then
    raise exception 'Unknown call result' using errcode = '22023';
  end if;
  if r.applies_to = 'report' then
    raise exception '% is recorded automatically, not from a call', r.name using errcode = '22023';
  end if;

  select * into p from public.projects where id = l.project_id;
  if not found then
    raise exception 'This name is not in a project yet' using errcode = '22023';
  end if;
  v_type := public.project_type_code(p.id);

  -- An appointment follow-up acts on the name's open appointment, recorded
  -- against the stage that appointment was set at so each project counts it.
  if r.applies_to = 'appointment' then
    select * into v_appt from public.appointments
     where lead_id = l.id and invalid_at is null
     order by appt_create_date desc, id desc
     limit 1
     for update;
    if not found then
      raise exception 'This name has no appointment to %', case r.effect when 'confirm' then 'confirm' else 'mark invalid' end
        using errcode = '22023';
    end if;
    if r.effect = 'confirm' and v_appt.confirmed_at is not null then
      raise exception 'This appointment is already confirmed' using errcode = '22023';
    end if;
    select * into r from public.call_results
     where name = r.name and project_type = case coalesce(v_appt.set_stage, l.stage) when 'dbdev' then 'DBDV' else 'APPT' end;
  elsif r.project_type <> v_type then
    raise exception '% is not a result for % projects', r.name,
      case v_type when 'DBDV' then 'database-development' else 'appointment' end using errcode = '22023';
  end if;

  if v_role <> 'admin'
     and l.assigned_user_id is distinct from v_me
     and not exists (select 1 from public.project_assignments pa where pa.project_id = l.project_id and pa.ae_user_id = v_me)
     and not (r.applies_to = 'appointment' and v_appt.user_id = v_me) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;

  -- The call itself.
  insert into public.call_records (lead_id, project_id, user_id, call_result, notes, result_id, stage, call_date)
  values (l.id, l.project_id, v_me, r.name, v_notes, r.id, l.stage, now())
  returning id into v_call;

  select id into v_status from public.lead_statuses where code = r.status_code;

  update public.leads set
    result_id        = r.id,
    call_result_dbdv = case when r.project_type = 'DBDV' then r.name else call_result_dbdv end,
    call_result_appt = case when r.project_type = 'APPT' then r.name
                            when r.effect = 'appointment_invalid' and stage = 'appt' then r.name
                            else call_result_appt end,
    call_weight      = call_weight + case when r.applies_to = 'name' then 1 else 0 end,
    date_last_worked = now(),
    status_id        = coalesce(v_status, status_id),
    resolved_at      = case when r.viable then null else coalesce(resolved_at, now()) end,
    assigned_user_id = case when r.effect = 'pending' then null else assigned_user_id end
  where id = l.id;

  -- What the result does.
  if r.effect in ('promote', 'appointment') then
    if r.effect = 'appointment' then
      v_date := nullif(p_appointment->>'date', '')::date;
      v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
      if v_date is null then
        raise exception 'Choose the appointment date' using errcode = '22023';
      end if;
      if v_date < current_date - 1 then
        raise exception 'The appointment date has passed' using errcode = '22023';
      end if;
      if v_time is not null and v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
        raise exception 'Give the time like 9:30 AM' using errcode = '22023';
      end if;
    end if;

    -- A name that already holds an appointment still to come, or still
    -- waiting for QA, has that one moved: one appointment, paid once.
    -- (Recording the result again is how a rep reschedules from the sheet.)
    -- One that failed QA does not count: the rep sets a real one instead.
    if r.effect = 'appointment' then
      select * into v_open from public.appointments
       where lead_id = l.id and invalid_at is null and qa_status is distinct from 'failed'
         and (qa_status = 'pending' or appt_date >= (now() at time zone public.business_tz())::date)
       order by appt_create_date desc, id desc
       limit 1
       for update;
    end if;

    if v_open.id is not null then
      update public.appointments set
        appt_date    = v_date,
        appt_time    = v_time,
        duration_min = coalesce(nullif(p_appointment->>'duration', '')::int, duration_min),
        rep_name     = coalesce(nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), rep_name),
        status_id    = case when status_id = (select id from public.appointment_statuses where name = 'Scheduled')
                             and (appt_date, coalesce(appt_time, '')) is distinct from (v_date, coalesce(v_time, ''))
                            then (select id from public.appointment_statuses where name = 'Rescheduled')
                            else status_id end,
        status_update_date = now()
      where id = v_open.id
      returning * into v_appt;
      update public.call_records set
        appointment_id = v_appt.id,
        notes = concat_ws(E'\n', notes, 'Appointment moved from ' || to_char(v_open.appt_date, 'Mon FMDD')
                  || coalesce(' ' || v_open.appt_time, '') || ' to ' || to_char(v_date, 'Mon FMDD') || coalesce(' ' || v_time, ''))
      where id = v_call;
    else

      -- From DBDev, the name moves to the linked appointment project.
      if v_type = 'DBDV' then
        if p.appt_project_id is null then
          raise exception 'Link % to an appointment project before promoting its names', p.name using errcode = '22023';
        end if;
        select * into a_r from public.call_results
         where project_type = 'APPT' and name = case r.effect when 'promote' then 'Lead-No Contact' else r.name end;
        -- A new lead goes to the appointment manager with the fewest names; an
        -- appointment stays with the rep who set it, who confirms it.
        v_rep := case r.effect when 'promote' then public.least_loaded_rep(p.appt_project_id) else v_me end;
        update public.leads set
          stage             = 'appt',
          project_id        = p.appt_project_id,
          source_project_id = coalesce(source_project_id, l.project_id),
          dbdv_user_id      = v_me,
          assigned_user_id  = v_rep,
          result_id         = a_r.id,
          call_result_appt  = a_r.name,
          call_weight       = 0,
          promoted_at       = now(),
          resolved_at       = case when a_r.viable then null else now() end
        where id = l.id;
      end if;

      if r.effect = 'appointment' then
        insert into public.appointments
          (lead_id, user_id, rep_name, appt_date, appt_time, duration_min, status_id, list_source,
           call_result_dbdv, project_id, set_project_id, set_stage, call_record_id, qa_status)
        values
          (l.id, v_me, nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), v_date, v_time,
           coalesce(nullif(p_appointment->>'duration', '')::int, 30),
           (select id from public.appointment_statuses where name = 'Scheduled'),
           l.list_source,
           case when v_type = 'DBDV' then r.name end,
           coalesce(p.appt_project_id, p.id), p.id, l.stage, v_call, 'pending')
        returning * into v_appt;
        update public.leads set appt_created_date = now() where id = l.id;
        update public.call_records set appointment_id = v_appt.id where id = v_call;
      end if;

      v_pay := v_pay || public.pay(v_me, p.id, r.pay_kind, l.id, v_appt.id, v_call);

    end if;

  elsif r.effect = 'confirm' then
    update public.appointments set
      status_id    = (select id from public.appointment_statuses where name = 'Confirmed'),
      confirmed_at = now(),
      confirmed_by = v_me,
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := v_pay || public.pay(v_me, coalesce(v_appt.set_project_id, p.id), 'confirmation', l.id, v_appt.id, v_call);
    -- The client hears now only if QA has already let them see it.
    if coalesce(v_appt.qa_status, 'passed') = 'passed' then
      perform public.notify_client_appointment(v_appt.id, true);
    end if;

  elsif r.effect = 'appointment_invalid' then
    update public.appointments set
      invalid_at = now(),
      status_id  = (select id from public.appointment_statuses where name = 'Invalid'),
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := public.charge_back(l.id, v_appt.id, array['appointment', 'confirmation'], v_call, 'Appointment invalid');

  elsif r.effect = 'lead_invalid' then
    update public.leads set call_result_dbdv = 'Lead-Invalid' where id = l.id and source_project_id is not null;
    v_pay := public.charge_back(l.id, null, array['lead'], v_call, 'Lead invalid');
    -- No record of the original payment (an older lead): charge the developer at today's rate.
    if jsonb_array_length(v_pay) = 0 and l.dbdv_user_id is not null and l.source_project_id is not null then
      insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
      select l.dbdv_user_id, l.source_project_id, l.id, v_call, 'lead', -sp.lead_rate, 'Lead invalid (no original payment on record)', v_me
        from public.projects sp where sp.id = l.source_project_id;
      v_pay := jsonb_build_array(jsonb_build_object('user_id', l.dbdv_user_id, 'kind', 'lead',
                 'amount', -(select lead_rate from public.projects where id = l.source_project_id)));
    end if;
    if l.dbdv_user_id is not null then
      perform public.notify_users(
        array[l.dbdv_user_id], 'lead', 'Lead marked invalid: ' || coalesce(l.company_name, 'a lead'),
        concat_ws(' · ', 'Charged back on your production report', 'marked by ' || public.actor_name()),
        '/leads/' || l.id, 'lead_invalid');
    end if;

  elsif r.effect = 'correct_xdate' then
    if p_corrected_xdate is null then
      raise exception 'Enter the corrected renewal date' using errcode = '22023';
    end if;
    v_old_xdate := public.lead_renewal_date(l.id);
    -- The corrected date becomes the lead's ultimate X-date, which is its
    -- renewal; the dates on the individual policy lines are left as recorded.
    update public.insurance_details set ultimate_xdate = p_corrected_xdate where lead_id = l.id;
    if not found then
      insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_corrected_xdate);
    end if;
    update public.leads set original_xdate = coalesce(original_xdate, v_old_xdate) where id = l.id;
    update public.call_records
       set notes = concat_ws(E'\n', notes, 'Renewal corrected from '
                   || coalesce(to_char(v_old_xdate, 'FMMonth YYYY'), 'none') || ' to ' || to_char(p_corrected_xdate, 'FMMonth YYYY'))
     where id = v_call;
  end if;

  select * into l from public.leads where id = l.id;
  return jsonb_build_object(
    'call_record_id', v_call,
    'lead_id',        l.id,
    'result',         r.name,
    'stage',          l.stage,
    'project_id',     l.project_id,
    'promoted',       l.project_id is distinct from p.id,
    'on_list',        (select viable and callable from public.call_results where id = l.result_id) and l.assigned_user_id is not null,
    'appointment_id', v_appt.id,
    'rescheduled',    v_open.id is not null,
    'pay',            v_pay);
end $$;

revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date) to authenticated;

create or replace function public.pay(p_user bigint, p_project bigint, p_kind text, p_lead bigint,
                                      p_appointment bigint, p_call bigint, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_id bigint;
begin
  -- A lead is developed once: no second payment for it unless the first was
  -- charged back (a lead moved back to its DBDev project and promoted again).
  if p_kind = 'lead' and exists (
       select 1 from public.pay_events pe
        where pe.lead_id = p_lead and pe.kind = 'lead' and not pe.is_chargeback
          and not exists (select 1 from public.pay_events r where r.reverses_id = pe.id)) then
    return '[]'::jsonb;
  end if;
  select case p_kind when 'lead' then lead_rate when 'appointment' then appointment_rate else confirmation_rate end
    into v_amount from public.projects where id = p_project;
  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, note, created_by)
  values (p_user, p_project, p_lead, p_appointment, p_call, p_kind, coalesce(v_amount, 0), p_note, public.app_user_id())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'user_id', p_user, 'kind', p_kind, 'amount', coalesce(v_amount, 0));
end $$;
revoke execute on function public.pay(bigint, bigint, text, bigint, bigint, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. QA, confirmation and invalid marks only through their own steps
--
-- review_appointment_qa() and record_call_result() run as their owner, so
-- `current_user` is 'authenticated' only for a direct write through the API
-- (or a form). Administrators keep the power to correct a record by hand.
-- ---------------------------------------------------------------------------

create or replace function public.tg_appointments_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      -- Saved from a form: it waits for QA, and nothing is confirmed or invalid yet.
      new.qa_status := 'pending';
      new.qa_by := null; new.qa_at := null; new.qa_note := null;
      new.confirmed_at := null; new.confirmed_by := null; new.invalid_at := null;
    elsif (new.qa_status, new.qa_by, new.qa_at, new.qa_note, new.confirmed_at, new.confirmed_by, new.invalid_at)
          is distinct from (old.qa_status, old.qa_by, old.qa_at, old.qa_note, old.confirmed_at, old.confirmed_by, old.invalid_at) then
      raise exception 'QA, confirmation and invalid marks are recorded through QA and call results'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard
  before insert or update on public.appointments
  for each row execute function public.tg_appointments_guard();

create or replace function public.review_appointment_qa(p_appointment_id bigint, p_passed boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_role text   := public.app_role();
  v_appt public.appointments;
  v_lead text;
begin
  if v_me is null or v_role not in ('admin', 'agent') then
    raise exception 'Only administrators and QA staff can review appointments' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'That appointment no longer exists' using errcode = 'P0002';
  end if;
  if v_appt.qa_status is distinct from 'pending' then
    raise exception 'This appointment has already been reviewed' using errcode = '22023';
  end if;
  if v_appt.user_id = v_me and v_role <> 'admin' then
    raise exception 'Someone else has to QA an appointment you set' using errcode = '42501';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Keep the QA note under 500 characters' using errcode = '22023';
  end if;

  update public.appointments set
    qa_status = case when p_passed then 'passed' else 'failed' end,
    qa_by = v_me, qa_at = now(), qa_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_appt.id;
  update public.call_records set
    qa_result = case when p_passed then 'Passed' else 'Failed' end,
    qa_date = now()
  where id = v_appt.call_record_id;

  select company_name into v_lead from public.leads where id = v_appt.lead_id;
  if p_passed then
    -- The client hears of it now for the first time.
    perform public.notify_client_appointment(v_appt.id, v_appt.confirmed_at is not null, true);
  elsif v_appt.user_id is not null then
    perform public.notify_users(
      array[v_appt.user_id], 'appointment', 'Appointment failed QA: ' || coalesce(v_lead, 'a lead'),
      coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'See the lead sheet for details'),
      '/leads/' || v_appt.lead_id, 'appt_qa');
  end if;
  return jsonb_build_object('appointment_id', v_appt.id, 'qa_status', case when p_passed then 'passed' else 'failed' end);
end $$;
revoke execute on function public.review_appointment_qa(bigint, boolean, text) from public, anon;
grant execute on function public.review_appointment_qa(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A client's feedback: about their own leads and appointments, filed now, as Open
-- ---------------------------------------------------------------------------

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    (select public.is_staff())
    or (user_id = (select public.app_user_id())
        and (lead_id is null
             or lead_id in (select l.id from public.leads l where l.project_id in (select public.client_project_ids())))
        -- Row Level Security on appointments leaves a client only their own (QA-passed) ones.
        and (appointment_id is null or appointment_id in (select a.id from public.appointments a)))
  );

create or replace function public.tg_feedback_client_fields()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_staff() then
    new.created_at   := now();
    new.fb_status_id := (select id from public.fb_statuses where name = 'Open');
  end if;
  return new;
end $$;

drop trigger if exists feedback_client_fields on public.feedback;
create trigger feedback_client_fields
  before insert on public.feedback
  for each row execute function public.tg_feedback_client_fields();

-- ---------------------------------------------------------------------------
-- 4. Internal functions closed to signed-out callers (both refused them in
--    their bodies already; now the grant says so too)
-- ---------------------------------------------------------------------------

revoke execute on function public.mfa_status() from public, anon;
grant execute on function public.mfa_status() to authenticated;
revoke execute on function public.send_notification(bigint[], text[], text, text, text) from public, anon;
grant execute on function public.send_notification(bigint[], text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Dashboard and report figures on the business's day
-- ---------------------------------------------------------------------------

/** Appointments booked per rep, busiest first; ones marked invalid do not count. */
create or replace function public.rep_workload()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'appts', c.n)
           order by c.n desc, u.id
         ), '[]'::jsonb)
    from (select user_id, count(*) as n from public.appointments
           where user_id is not null and invalid_at is null group by user_id) c
    join public.users u on u.id = c.user_id
   where u.role in ('manager', 'agent');
$$;

/** Leads assigned to and appointments (not marked invalid) owned by each user. */
create or replace view public.user_workload with (security_invoker = true) as
  select u.id as user_id,
         (select count(*) from public.leads l where l.assigned_user_id = u.id) as lead_count,
         (select count(*) from public.appointments a where a.user_id = u.id and a.invalid_at is null) as appt_count
    from public.users u;

/**
 * Everything the dashboard tiles and chart need. Days are the business's
 * (business_tz()), not the server's UTC ones: "today" is today there, and
 * "this week" is its last seven days up to and including today, so a
 * meeting booked for next month is not counted in this week's figure.
 * Appointments marked invalid do not count.
 */
create or replace function public.dashboard_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select (now() at time zone public.business_tz())::date as today
  ), l as (
    select coalesce(lead_date, created_at) as at from public.leads
  ), a as (
    select appt_date from public.appointments where invalid_at is null
  ), weeks as (
    -- Eight weeks, oldest first; the last ends today.
    select i,
           now() - ((8 - i) * interval '7 days') as start_at,
           now() - ((7 - i) * interval '7 days') as end_at,
           z.today - ((7 - i) * 7 + 6) as first_day,
           z.today - ((7 - i) * 7)     as last_day
      from generate_series(0, 7) as i, z
  )
  select jsonb_build_object(
    'leads_total',    (select count(*) from l),
    'leads_30d',      (select count(*) from l where at >= now() - interval '30 days'),
    'leads_30_60d',   (select count(*) from l where at >= now() - interval '60 days' and at < now() - interval '30 days'),
    'appts_total',    (select count(*) from a),
    'appts_today',    (select count(*) from a, z where a.appt_date = z.today),
    'appts_7d',       (select count(*) from a, z where a.appt_date between z.today - 6 and z.today),
    'appts_7_14d',    (select count(*) from a, z where a.appt_date between z.today - 13 and z.today - 7),
    'active_clients', (select count(*) from public.companies where status = 'active'),
    'weeks',          (select jsonb_agg(jsonb_build_object(
                          'leads', (select count(*) from l where l.at >= w.start_at and l.at < w.end_at),
                          'appts', (select count(*) from a where a.appt_date between w.first_day and w.last_day)
                        ) order by w.i) from weeks w),
    'project_leads',  (select coalesce(jsonb_agg(coalesce(c.n, 0) order by p.id), '[]'::jsonb)
                         from public.projects p
                         left join (select project_id, count(*) as n from public.leads group by project_id) c on c.project_id = p.id),
    'reps',           public.rep_workload()
  );
$$;

/**
 * Everything the reports page needs. Months are the business's (a lead
 * entered on the evening of the 30th belongs to that month, not the next),
 * each with its average client rating; appointments marked invalid do not
 * count.
 */
create or replace function public.report_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), l as (
    select state, status_id, to_char(coalesce(lead_date, created_at) at time zone z.tz, 'YYYY-MM') as ym from public.leads, z
  ), a as (
    select status_id, to_char(appt_date, 'YYYY-MM') as ym from public.appointments where invalid_at is null
  ), f as (
    select rating, to_char(created_at at time zone z.tz, 'YYYY-MM') as ym from public.feedback, z where rating is not null
  ), months as (
    select i, date_trunc('month', now() at time zone z.tz) - (i * interval '1 month') as m
      from generate_series(0, 5) as i, z
  )
  select jsonb_build_object(
    'leads',          (select count(*) from l),
    'appts',          (select count(*) from a),
    'projects',       (select count(*) from public.projects),
    'held',           (select count(*) from a join public.appointment_statuses s on s.id = a.status_id where s.name = 'Held'),
    'ratings',        (select jsonb_build_object('count', count(rating), 'avg', coalesce(avg(rating), 0)) from f),
    'by_status',      (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from l group by status_id) c
                         join public.lead_statuses s on s.id = c.status_id),
    'by_state',       (select coalesce(jsonb_agg(jsonb_build_array(t.state, t.n) order by t.n desc, t.state), '[]'::jsonb)
                         from (select state, count(*) as n from l where state is not null group by state order by n desc, state limit 8) t),
    'appt_by_status', (select coalesce(jsonb_object_agg(s.name, c.n), '{}'::jsonb)
                         from (select status_id, count(*) as n from a group by status_id) c
                         join public.appointment_statuses s on s.id = c.status_id),
    'months',         (select jsonb_agg(jsonb_build_object(
                          'key',    to_char(m.m, 'YYYY-MM'),
                          'label',  to_char(m.m, 'Mon'),
                          'leads',  (select count(*) from l where l.ym = to_char(m.m, 'YYYY-MM')),
                          'appts',  (select count(*) from a where a.ym = to_char(m.m, 'YYYY-MM')),
                          'rating', (select round(avg(f.rating), 1) from f where f.ym = to_char(m.m, 'YYYY-MM'))
                        ) order by m.i desc) from months m)
  );
$$;

/** New leads per day over the last year, by the business's calendar day (only days that have any). */
create or replace function public.lead_volume_daily(p_days int default 366)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'leads', t.n) order by t.day), '[]'::jsonb)
    from (
      select (coalesce(l.lead_date, l.created_at) at time zone public.business_tz())::date as day, count(*) as n
        from public.leads l
       where coalesce(l.lead_date, l.created_at) >= now() - make_interval(days => least(greatest(coalesce(p_days, 366), 1), 800))
       group by 1
    ) t;
$$;

-- ---------------------------------------------------------------------------
-- 6. A business time zone a browser understands
--
-- pg_timezone_names also holds posix/… and right/… variants and "Factory",
-- which JavaScript's Intl rejects: every page that asks for "today" would fail.
-- ---------------------------------------------------------------------------

create or replace function public.business_tz()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value->>'name' from public.app_settings s
      where s.key = 'business_timezone'
        and s.value->>'name' !~ '^(posix|right)/' and s.value->>'name' <> 'Factory'
        and exists (select 1 from pg_timezone_names z where z.name = s.value->>'name')),
    'America/Phoenix');
$$;

-- ---------------------------------------------------------------------------
-- 7. A client's appointment message: from the rep who set it, and never lost
-- ---------------------------------------------------------------------------

drop function if exists public.notify_users(bigint[], text, text, text, text, text, uuid);

/**
 * As before (skips a rule switched off, inactive accounts and whoever caused
 * the event; logs what it sent), with `p_sender`: who the message is from,
 * when that is not the person acting (a QA reviewer passing an appointment
 * the client should hear about from the rep who set it).
 */
create or replace function public.notify_users(
  p_recipients bigint[],
  p_kind       text,
  p_title      text,
  p_body       text,
  p_link       text,
  p_rule       text   default null,
  p_batch      uuid   default null,
  p_sender     bigint default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_rule_id bigint;
  v_enabled boolean;
  v_actor   bigint := public.app_user_id();
  v_count   int;
begin
  if p_rule is not null then
    select id, enabled into v_rule_id, v_enabled
      from public.alert_rules where trigger = p_rule order by id limit 1;
    if v_rule_id is not null and not v_enabled then
      return 0;
    end if;
  end if;

  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, link)
  select u.id, coalesce(p_sender, v_actor), p_batch, p_kind, left(p_title, 160), left(p_body, 1000), p_link
    from public.users u
   where u.id = any(p_recipients)
     and u.status = 'active'
     and u.id is distinct from v_actor;
  get diagnostics v_count = row_count;

  if v_count > 0 and v_rule_id is not null then
    insert into public.alert_log (rule_id, subject, detail, status)
    values (v_rule_id, left(p_title, 200),
            format('In-app to %s %s', v_count, case when v_count = 1 then 'person' else 'people' end),
            'sent');
  end if;
  return v_count;
end $$;
revoke execute on function public.notify_users(bigint[], text, text, text, text, text, uuid, bigint) from public, anon, authenticated;

drop function if exists public.notify_client_appointment(bigint, boolean);

/**
 * Tell the client about one appointment, from the rep who set it.
 * `p_first`: the client has not heard of it yet (QA has just passed it).
 * Then, if it is already confirmed but "Appointment confirmed" is switched
 * off, they are still told it is set, under "Appointment set".
 */
create or replace function public.notify_client_appointment(p_appointment bigint, p_confirmed boolean, p_first boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_confirmed boolean := p_confirmed;
begin
  select ap.appt_date, ap.appt_time, ap.user_id, l.company_name, co.id as company_id, co.name as company
    into a
    from public.appointments ap
    join public.leads l on l.id = ap.lead_id
    left join public.projects p on p.id = l.project_id
    left join public.companies co on co.id = p.company_id
   where ap.id = p_appointment;
  if a.company_id is null then return; end if;
  if p_confirmed and p_first
     and not exists (select 1 from public.alert_rules where trigger = 'appt_confirmed' and enabled) then
    v_confirmed := false;
  end if;
  perform public.notify_users(
    array(select u.id from public.users u where u.role = 'client' and u.company_id = a.company_id),
    'appointment',
    (case when v_confirmed then 'Appointment confirmed: ' else 'Appointment set: ' end) || coalesce(a.company_name, 'a lead'),
    concat_ws(' · ', to_char(a.appt_date, 'Dy Mon FMDD') || coalesce(' at ' || a.appt_time, ''), a.company),
    '/calendar?view=day&d=' || coalesce(a.appt_date, current_date)::text,
    case when v_confirmed then 'appt_confirmed' else 'appt_created' end,
    null,
    a.user_id);
end $$;
revoke execute on function public.notify_client_appointment(bigint, boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Alert rules that say what really happens
-- ---------------------------------------------------------------------------

-- One message per finished import, not a daily summary.
update public.alert_rules set name = 'Import finished' where trigger = 'import_done' and name = 'Daily import summary';

-- Nothing sends the X-date and appointment reminders yet (no scheduled job
-- exists), so any log rows under them are demo data, not real dispatches.
delete from public.alert_log
 where rule_id in (select id from public.alert_rules where trigger in ('xdate_30d', 'appt_reminder'));

-- ===== supabase/migrations/20261006100000_pay_and_time.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — pay rates, hybrid pay and time worked
--
--   pay_rules()          the rules an administrator sets in Settings: the
--                        range each project rate is picked from (lead $8–$12,
--                        appointment $30–$50, special pay $5–$20) and the
--                        hourly range ($15.15–$25); how time is counted (stop
--                        after 5 idle minutes, round each hour up to 15, a
--                        call counts up to 30 minutes) and the pay period
--   set_project_rates()  keeps a project's rates inside those ranges
--   pay_profiles         each account manager's pay: commission only, or
--                        hybrid (an hourly rate or the commission, whichever
--                        is higher for the pay period)
--   work_activity        what someone did in the app, minute by minute,
--                        written only by track_activity() at the server's time
--   work_minutes()       minutes worked per person, day and hour
--   work_days()          per day: minutes worked and minutes paid (rounded)
--   pay_report()         per person for a period: hours, hourly pay,
--                        commission and the pay due
--   production_report()  now names the client, and splits the pay by kind
--   call_records         a call's person, time and name are the server's
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The rules
-- ---------------------------------------------------------------------------

/**
 * The pay and time rules, with the defaults filled in for any an
 * administrator has not set (app_settings 'pay_rates' and 'time_tracking').
 * Amounts are dollars; `step` is how far apart the choices in a rate's list are.
 */
create or replace function public.pay_rules()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'rates', jsonb_build_object(
      'lead',        coalesce(r->'lead',        '{"min": 8, "max": 12, "step": 0.5}'::jsonb),
      'appointment', coalesce(r->'appointment', '{"min": 30, "max": 50, "step": 1}'::jsonb),
      'special',     coalesce(r->'special',     '{"min": 5, "max": 20, "step": 1}'::jsonb),
      'hourly',      coalesce(r->'hourly',      '{"min": 15.15, "max": 25}'::jsonb)),
    'time', jsonb_build_object(
      -- Minutes without any action after which the timer stops.
      'idle_minutes', coalesce((t->>'idle_minutes')::int, 5),
      -- hour_up: each hour's minutes round up to `round_to`; day_up / day_nearest:
      -- each day's total does; none: exact minutes.
      'rounding',     coalesce(t->>'rounding', 'hour_up'),
      'round_to',     coalesce((t->>'round_to')::int, 15),
      -- A call (Call now, then its result saved) counts as work up to this long; 0 turns it off.
      'call_minutes', coalesce((t->>'call_minutes')::int, 30),
      -- weekly / biweekly (counted from period_start) / semimonthly / monthly.
      'pay_period',   coalesce(t->>'pay_period', 'weekly'),
      'period_start', coalesce(t->>'period_start', '2026-10-05'))
  )
  from (select coalesce((select s.value from public.app_settings s where s.key = 'pay_rates'), '{}'::jsonb) as r,
               coalesce((select s.value from public.app_settings s where s.key = 'time_tracking'), '{}'::jsonb) as t) x;
$$;
revoke execute on function public.pay_rules() from public, anon;
grant execute on function public.pay_rules() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Project rates inside their ranges
-- ---------------------------------------------------------------------------

/**
 * A rate being set must be $0 (that event is not paid on this project) or
 * inside its range. A rate left as it was is kept, even if the range has
 * moved since it was set.
 */
create or replace function public.check_pay_rate(p_label text, p_new numeric, p_old numeric, p_range jsonb)
returns void
language plpgsql immutable set search_path = public as $$
declare
  v_min numeric := coalesce((p_range->>'min')::numeric, 0);
  v_max numeric := coalesce((p_range->>'max')::numeric, 10000);
begin
  if p_new is null or p_new < 0 then
    raise exception '% cannot be negative', p_label using errcode = '22023';
  end if;
  if round(p_new, 2) is distinct from p_old and p_new <> 0 and (p_new < v_min or p_new > v_max) then
    raise exception '% must be between % and %, or $0 for none', p_label,
      to_char(v_min, 'FM$999,990.00'), to_char(v_max, 'FM$999,990.00') using errcode = '22023';
  end if;
end $$;
revoke execute on function public.check_pay_rate(text, numeric, numeric, jsonb) from public, anon;
-- set_project_rates() runs as the administrator calling it, so they need to be able to call this too.
grant execute on function public.check_pay_rate(text, numeric, numeric, jsonb) to authenticated;

create or replace function public.set_project_rates(p_project_id bigint, p_lead numeric, p_appointment numeric, p_confirmation numeric)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_old   public.projects;
  v_row   public.projects;
  v_rates jsonb := public.pay_rules()->'rates';
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  select * into v_old from public.projects where id = p_project_id;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  perform public.check_pay_rate('Lead pay', coalesce(p_lead, 0), v_old.lead_rate, v_rates->'lead');
  perform public.check_pay_rate('Appointment pay', coalesce(p_appointment, 0), v_old.appointment_rate, v_rates->'appointment');
  perform public.check_pay_rate('Special pay', coalesce(p_confirmation, 0), v_old.confirmation_rate, v_rates->'special');

  update public.projects
     set lead_rate = round(coalesce(p_lead, 0), 2),
         appointment_rate = round(coalesce(p_appointment, 0), 2),
         confirmation_rate = round(coalesce(p_confirmation, 0), 2)
   where id = p_project_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'lead_rate', v_row.lead_rate,
                            'appointment_rate', v_row.appointment_rate, 'confirmation_rate', v_row.confirmation_rate);
end $$;
revoke execute on function public.set_project_rates(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function public.set_project_rates(bigint, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. How each account manager is paid
-- ---------------------------------------------------------------------------

create table if not exists public.pay_profiles (
  user_id     bigint primary key references public.users(id) on delete cascade,
  pay_model   text not null default 'commission' check (pay_model in ('commission', 'hybrid')),
  hourly_rate numeric(8,2) check (hourly_rate is null or hourly_rate between 0 and 1000),
  updated_at  timestamptz not null default now(),
  updated_by  bigint references public.users(id) on delete set null,
  constraint pay_profiles_hybrid_rate check (pay_model <> 'hybrid' or hourly_rate is not null)
);

alter table public.pay_profiles enable row level security;

-- An administrator sets them; each person can see their own.
drop policy if exists pay_profiles_read on public.pay_profiles;
create policy pay_profiles_read on public.pay_profiles
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists pay_profiles_write on public.pay_profiles;
create policy pay_profiles_write on public.pay_profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.pay_profiles;
create policy mfa_required on public.pay_profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.pay_profiles;
create policy active_account_required on public.pay_profiles as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

grant select, insert, update, delete on public.pay_profiles to authenticated;

/** An hourly rate being set must be inside the hourly range in Settings; who set it, and when, is stamped on. */
create or replace function public.tg_pay_profiles_check()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_range jsonb   := public.pay_rules()->'rates'->'hourly';
  v_min   numeric := coalesce((v_range->>'min')::numeric, 0);
  v_max   numeric := coalesce((v_range->>'max')::numeric, 1000);
begin
  new.updated_at := now();
  new.updated_by := coalesce(public.app_user_id(), new.updated_by);
  if new.hourly_rate is not null
     and (tg_op = 'INSERT' or new.hourly_rate is distinct from old.hourly_rate)
     and (new.hourly_rate < v_min or new.hourly_rate > v_max) then
    raise exception 'The hourly rate must be between % and %',
      to_char(v_min, 'FM$999,990.00'), to_char(v_max, 'FM$999,990.00') using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists pay_profiles_check on public.pay_profiles;
create trigger pay_profiles_check
  before insert or update on public.pay_profiles
  for each row execute function public.tg_pay_profiles_check();

-- ---------------------------------------------------------------------------
-- 4. What someone did in the app, minute by minute
--
-- The app reports clicks and key presses (never mouse movement, which a
-- program can fake while nobody works) at most twice a minute, and presses
-- of "Call now" with the name being called. Rows are written only by
-- track_activity(), at the server's time: nobody can backdate or add time.
-- ---------------------------------------------------------------------------

create table if not exists public.work_activity (
  id       bigint generated always as identity primary key,
  user_id  bigint not null references public.users(id) on delete cascade,
  minute   timestamptz not null,               -- the minute it happened in
  at       timestamptz not null default now(),
  kind     text not null default 'use' check (kind in ('use', 'call')),
  lead_id  bigint references public.leads(id) on delete set null
);

-- One 'use' row a minute, one 'call' row a minute and name.
create unique index if not exists work_activity_use_once on public.work_activity (user_id, minute) where kind = 'use';
create unique index if not exists work_activity_call_once on public.work_activity (user_id, minute, lead_id) where kind = 'call';
create index if not exists work_activity_user_minute on public.work_activity (user_id, minute);

alter table public.work_activity enable row level security;

drop policy if exists work_activity_read on public.work_activity;
create policy work_activity_read on public.work_activity
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists mfa_required on public.work_activity;
create policy mfa_required on public.work_activity as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.work_activity;
create policy active_account_required on public.work_activity as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

revoke insert, update, delete, truncate on public.work_activity from anon, authenticated;
grant select on public.work_activity to authenticated;

/**
 * Record that the signed-in person did something now: 'use' for a click or
 * key press, 'call' for "Call now" on a name (which counts as use too).
 * Staff only; anyone else is ignored.
 */
create or replace function public.track_activity(p_kind text default 'use', p_lead bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();   -- null for an inactive account or one short of two-factor
  v_lead bigint;
begin
  if v_me is null or public.app_role() not in ('admin', 'manager', 'agent') then
    return;
  end if;
  if p_kind = 'call' and p_lead is not null then
    select l.id into v_lead from public.leads l where l.id = p_lead;
  end if;
  if v_lead is not null then
    insert into public.work_activity (user_id, minute, kind, lead_id)
    values (v_me, date_trunc('minute', now()), 'call', v_lead)
    on conflict do nothing;
  end if;
  insert into public.work_activity (user_id, minute, kind)
  values (v_me, date_trunc('minute', now()), 'use')
  on conflict do nothing;
end $$;
revoke execute on function public.track_activity(text, bigint) from public, anon;
grant execute on function public.track_activity(text, bigint) to authenticated;

-- A call's person, time and name come from the server, as they now count
-- towards time worked: record_call_result() writes them; a direct write
-- through the API (staff may) gets the caller and the current time stamped
-- on, and cannot change them afterwards. Administrators can still correct one.
create or replace function public.tg_call_records_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.user_id   := public.app_user_id();
      new.call_date := now();
    elsif (new.user_id, new.call_date, new.lead_id) is distinct from (old.user_id, old.call_date, old.lead_id) then
      raise exception 'Who made a call, when, and to whom are recorded with it and cannot be changed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists call_records_guard on public.call_records;
create trigger call_records_guard
  before insert or update on public.call_records
  for each row execute function public.tg_call_records_guard();

create index if not exists call_records_user_date on public.call_records (user_id, call_date);
create index if not exists call_records_lead_user on public.call_records (lead_id, user_id, call_date);

-- ---------------------------------------------------------------------------
-- 5. Time worked
-- ---------------------------------------------------------------------------

/**
 * Minutes worked per person, day and hour (the business's days and hours),
 * from what they did in Lighthouse:
 *   - each minute with an action in the app (work_activity) or a saved call
 *     result (call_records);
 *   - the minutes between two such minutes at most `idle_minutes` apart
 *     (5): reading a name, dialling, typing notes. A longer gap counts
 *     nothing: the timer had stopped;
 *   - a call: from pressing Call now on a name to saving that name's result,
 *     up to `call_minutes` (30), since a phone conversation has no clicks.
 * Anyone but an administrator gets only their own minutes.
 */
create or replace function public.work_minutes(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, day date, hour int, minutes int)
language sql stable security invoker set search_path = public as $$
  with cfg as (
    select public.business_tz() as tz,
           greatest(coalesce((r->>'idle_minutes')::int, 5), 0) as idle,
           greatest(coalesce((r->>'call_minutes')::int, 30), 0) as call_cap
      from (select public.pay_rules()->'time' as r) x
  ), b as (
    select cfg.tz, cfg.idle, cfg.call_cap,
           (p_from::timestamp at time zone cfg.tz) as t0,
           ((p_to + 1)::timestamp at time zone cfg.tz) as t1,
           case when public.is_admin() then p_user else public.app_user_id() end as uid,
           public.is_admin() or public.app_user_id() is not null as allowed
      from cfg
  ), marks as (
    select a.user_id as uid, a.minute as m
      from public.work_activity a, b
     where b.allowed and a.minute >= b.t0 - make_interval(mins => b.idle) and a.minute < b.t1
       and (b.uid is null or a.user_id = b.uid)
    union
    select c.user_id, date_trunc('minute', c.call_date)
      from public.call_records c, b
     where b.allowed and c.call_date >= b.t0 - make_interval(mins => b.idle) and c.call_date < b.t1
       and c.user_id is not null and (b.uid is null or c.user_id = b.uid)
    union
    select a.user_id, gs.m
      from public.work_activity a
      cross join b
      cross join lateral (
        select min(c.call_date) as ended
          from public.call_records c
         where c.user_id = a.user_id and c.lead_id = a.lead_id
           and c.call_date >= a.at and c.call_date <= a.at + make_interval(mins => b.call_cap)
      ) e
      cross join lateral generate_series(a.minute, date_trunc('minute', e.ended), interval '1 minute') as gs(m)
     where b.allowed and a.kind = 'call' and b.call_cap > 0 and e.ended is not null
       and a.minute >= b.t0 - make_interval(mins => b.call_cap) and a.minute < b.t1
       and (b.uid is null or a.user_id = b.uid)
  ), ordered as (
    select d.uid, d.m, lag(d.m) over (partition by d.uid order by d.m) as prev
      from (select distinct mk.uid, mk.m from marks mk) d
  ), covered as (
    select o.uid, o.m from ordered o
    union
    select o.uid, gs.m
      from ordered o
      cross join b
      cross join lateral generate_series(o.prev + interval '1 minute', o.m - interval '1 minute', interval '1 minute') as gs(m)
     where o.prev is not null and o.m - o.prev <= make_interval(mins => b.idle)
  )
  select c.uid, (c.m at time zone b.tz)::date, extract(hour from c.m at time zone b.tz)::int, count(*)::int
    from covered c, b
   where c.m >= b.t0 and c.m < b.t1
   group by 1, 2, 3;
$$;
revoke execute on function public.work_minutes(date, date, bigint) from public, anon;
grant execute on function public.work_minutes(date, date, bigint) to authenticated;

/**
 * Per person and day: minutes worked, minutes paid after the rounding rule,
 * and each hour's minutes ({ hour, minutes, paid }) to show how it adds up.
 */
create or replace function public.work_days(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, day date, worked int, paid int, hours jsonb)
language sql stable security invoker set search_path = public as $$
  with cfg as (
    select coalesce(r->>'rounding', 'hour_up') as rounding, greatest(coalesce((r->>'round_to')::int, 15), 1) as step
      from (select public.pay_rules()->'time' as r) x
  ), h as (
    select w.user_id as uid, w.day as d, w.hour as hr, w.minutes as mins,
           least(60, (ceil(w.minutes::numeric / cfg.step) * cfg.step)::int) as hour_up
      from public.work_minutes(p_from, p_to, p_user) w, cfg
  )
  select h.uid, h.d, sum(h.mins)::int,
         (case cfg.rounding
            when 'hour_up'     then sum(h.hour_up)
            when 'day_up'      then ceil(sum(h.mins)::numeric / cfg.step) * cfg.step
            when 'day_nearest' then round(sum(h.mins)::numeric / cfg.step) * cfg.step
            else sum(h.mins) end)::int,
         jsonb_agg(jsonb_build_object('hour', h.hr, 'minutes', h.mins,
                                      'paid', case when cfg.rounding = 'hour_up' then h.hour_up else h.mins end)
                   order by h.hr)
    from h, cfg
   group by h.uid, h.d, cfg.rounding, cfg.step;
$$;
revoke execute on function public.work_days(date, date, bigint) from public, anon;
grant execute on function public.work_days(date, date, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Pay for a period
-- ---------------------------------------------------------------------------

/**
 * Per person for a period (the business's days): minutes worked and paid,
 * the hourly pay at their rate, their commission (every pay event in the
 * period, chargebacks taken off) and what they are due: the commission, or
 * for the hybrid model whichever of the two is higher. Account managers and
 * agents are listed even with nothing in the period. Anyone but an
 * administrator gets only their own row.
 */
create or replace function public.pay_report(p_from date, p_to date, p_user bigint default null)
returns table (
  user_id bigint, first_name text, last_name text, email text, role text,
  pay_model text, hourly_rate numeric,
  worked_minutes int, paid_minutes int,
  hourly_pay numeric, commission numeric, pay numeric,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a start date on or before the end date' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;
  if v_user is null and not public.is_admin() then
    return;
  end if;

  return query
  with t as (
    select wd.user_id as uid, sum(wd.worked)::int as worked, sum(wd.paid)::int as paid
      from public.work_days(p_from, p_to, v_user) wd
     group by 1
  ), m as (
    select pe.user_id as uid,
           sum(pe.amount) as commission,
           count(*) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as leads,
           count(*) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appts,
           count(*) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as confirms,
           count(*) filter (where pe.is_chargeback) as backs
      from public.pay_events pe
     where pe.created_at >= (p_from::timestamp at time zone v_tz)
       and pe.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
       and pe.user_id is not null
       and (v_user is null or pe.user_id = v_user)
     group by 1
  ), c as (
    select cr.user_id as uid, count(*) as n
      from public.call_records cr
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date <  ((p_to + 1)::timestamp at time zone v_tz)
       and cr.user_id is not null
       and (v_user is null or cr.user_id = v_user)
     group by 1
  ), people as (
    select u.id
      from public.users u
     where (v_user is null or u.id = v_user)
       and ((u.role in ('manager', 'agent') and u.status = 'active')
            or u.id in (select t.uid from t) or u.id in (select m.uid from m) or u.id in (select c.uid from c))
  ), figures as (
    select u.id, u.first_name, u.last_name, u.email, u.role,
           coalesce(pp.pay_model, 'commission') as model, pp.hourly_rate as rate,
           coalesce(t.worked, 0) as worked, coalesce(t.paid, 0) as paid,
           round(coalesce(t.paid, 0) / 60.0 * coalesce(pp.hourly_rate, 0), 2) as hourly,
           round(coalesce(m.commission, 0), 2) as commission,
           coalesce(c.n, 0) as calls, coalesce(m.leads, 0) as leads, coalesce(m.appts, 0) as appts,
           coalesce(m.confirms, 0) as confirms, coalesce(m.backs, 0) as backs
      from people pl
      join public.users u on u.id = pl.id
      left join public.pay_profiles pp on pp.user_id = u.id
      left join t on t.uid = u.id
      left join m on m.uid = u.id
      left join c on c.uid = u.id
  )
  select f.id, f.first_name, f.last_name, f.email, f.role, f.model, f.rate::numeric,
         f.worked, f.paid, f.hourly, f.commission,
         case when f.model = 'hybrid' then greatest(f.hourly, f.commission) else f.commission end,
         f.calls, f.leads, f.appts, f.confirms, f.backs
    from figures f
   order by f.first_name, f.last_name, f.id;
end $$;
revoke execute on function public.pay_report(date, date, bigint) from public, anon;
grant execute on function public.pay_report(date, date, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The production report names the client and splits the pay by kind
-- ---------------------------------------------------------------------------

drop function if exists public.production_report(date, date, bigint, bigint);

/**
 * Per day (in the business's time zone), rep and project: calls made, the
 * paid events, and what they came to by kind (lead pay, appointment pay,
 * special pay for a confirmation, chargebacks) and in total. Anyone but an
 * administrator sees only their own rows, whatever p_user_id says.
 */
create function public.production_report(p_from date, p_to date,
                                         p_project_id bigint default null, p_user_id bigint default null)
returns table (
  day date, user_id bigint, first_name text, last_name text, email text,
  project_id bigint, project text, client_id bigint, client text,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint,
  lead_pay numeric, appointment_pay numeric, special_pay numeric, chargeback_amount numeric,
  amount numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user_id else public.app_user_id() end;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a start date on or before the end date' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;

  return query
  with c as (
    select (cr.call_date at time zone v_tz)::date as d, cr.user_id as uid, cr.project_id as pid, count(*) as n
      from public.call_records cr
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date <  ((p_to + 1)::timestamp at time zone v_tz)
       and cr.user_id is not null
       and (v_user is null or cr.user_id = v_user)
       and (p_project_id is null or cr.project_id = p_project_id)
     group by 1, 2, 3
  ),
  e as (
    select (pe.created_at at time zone v_tz)::date as d, pe.user_id as uid, pe.project_id as pid,
           count(*) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as leads,
           count(*) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appts,
           count(*) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as confirms,
           count(*) filter (where pe.is_chargeback) as backs,
           sum(pe.amount) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as lead_amt,
           sum(pe.amount) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appt_amt,
           sum(pe.amount) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as special_amt,
           sum(pe.amount) filter (where pe.is_chargeback) as back_amt,
           sum(pe.amount) as amount
      from public.pay_events pe
     where pe.created_at >= (p_from::timestamp at time zone v_tz)
       and pe.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
       and pe.user_id is not null
       and (v_user is null or pe.user_id = v_user)
       and (p_project_id is null or pe.project_id = p_project_id)
     group by 1, 2, 3
  ),
  k as (select c.d, c.uid, c.pid from c union select e.d, e.uid, e.pid from e)
  select k.d, k.uid, u.first_name, u.last_name, u.email, k.pid, p.name, co.id, co.name,
         coalesce(c.n, 0), coalesce(e.leads, 0), coalesce(e.appts, 0), coalesce(e.confirms, 0), coalesce(e.backs, 0),
         coalesce(e.lead_amt, 0)::numeric, coalesce(e.appt_amt, 0)::numeric, coalesce(e.special_amt, 0)::numeric,
         coalesce(e.back_amt, 0)::numeric, coalesce(e.amount, 0)::numeric
    from k
    left join c on c.d = k.d and c.uid = k.uid and c.pid is not distinct from k.pid
    left join e on e.d = k.d and e.uid = k.uid and e.pid is not distinct from k.pid
    left join public.users u on u.id = k.uid
    left join public.projects p on p.id = k.pid
    left join public.companies co on co.id = p.company_id
   order by k.d desc, u.first_name, u.last_name, p.name;
end $$;
revoke execute on function public.production_report(date, date, bigint, bigint) from public, anon;
grant execute on function public.production_report(date, date, bigint, bigint) to authenticated;

-- ===== supabase/migrations/20261007100000_call_results.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the call result buttons, as the client asked (October)
--
--   - "Viable-No Contact" is now "Viable-CallBack" (it works the same way;
--     new names from an import start on it). The old name still finds it.
--   - "Lead-Hot Lead": a Lead (promoted to the appointment project, paid at
--     the Lead rate) marked as an X-date hot lead, so the appointment
--     manager is alerted to it. The old system's "X-Date Hot Lead" imports
--     as it.
--   - A name becomes a Lead or an Appointment only with its Ultimate
--     X-Date; record_call_result() takes it with the result
--     (p_ultimate_xdate), and an appointment needs its time as well as its
--     date.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Viable-CallBack
-- ---------------------------------------------------------------------------

update public.call_results
   set name = 'Viable-CallBack',
       action = 'Stays on active DBDev call lists to call back (tracked by # of calls made to each name/weighted). New names from a list import start here.',
       aliases = array(select distinct a from unnest(aliases || array['viable-no contact', 'viable no contact', 'viable-callback', 'callback', 'call back']) a)
 where project_type = 'DBDV' and name = 'Viable-No Contact';

-- What is already on record reads the same as the button.
update public.leads set call_result_dbdv = 'Viable-CallBack' where call_result_dbdv = 'Viable-No Contact';
update public.call_records set call_result = 'Viable-CallBack'
 where call_result = 'Viable-No Contact'
   and result_id in (select id from public.call_results where project_type = 'DBDV' and name = 'Viable-CallBack');

-- ---------------------------------------------------------------------------
-- 2. Lead-Hot Lead
-- ---------------------------------------------------------------------------

insert into public.call_results
  (project_type, name, sort_order, viable, callable, sort_last, effect, pay_kind, applies_to, status_code, action, aliases)
values
  ('DBDV', 'Lead-Hot Lead', 55, false, true, false, 'promote', 'lead', 'name', 'hot',
   'Same as Lead, marked as an X-date hot lead: removed from DBDev call lists and promoted to the Appt project for the Appt Mgr, who is alerted to a hot lead; flagged for Account Mgr pay at the pre-defined Lead rate at project level',
   array['x-date hot lead', 'xdate hot lead', 'hot lead', 'lead-hot lead', 'lead-hot'])
on conflict (project_type, name) do update set
  sort_order = excluded.sort_order, viable = excluded.viable, callable = excluded.callable,
  sort_last = excluded.sort_last, effect = excluded.effect, pay_kind = excluded.pay_kind,
  applies_to = excluded.applies_to, status_code = excluded.status_code,
  action = excluded.action, aliases = excluded.aliases;

-- The old system's hot leads now import as hot leads, not plain ones.
update public.call_results
   set aliases = array(select a from unnest(aliases) a where a not in ('x-date hot lead', 'xdate hot lead', 'hot lead'))
 where project_type = 'DBDV' and name = 'Lead';

-- ---------------------------------------------------------------------------
-- 3. A Lead or an Appointment needs its Ultimate X-Date; an appointment its time
-- ---------------------------------------------------------------------------

drop function if exists public.record_call_result(bigint, bigint, text, jsonb, date);

create function public.record_call_result(
  p_lead_id bigint,
  p_result_id bigint,
  p_notes text default null,
  p_appointment jsonb default null,
  p_corrected_xdate date default null,
  p_ultimate_xdate date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me       bigint := public.app_user_id();
  v_role     text   := public.app_role();
  v_notes    text   := nullif(btrim(coalesce(p_notes, '')), '');
  l          public.leads;
  r          public.call_results;
  a_r        public.call_results;      -- the appointment-stage twin of a DBDev result
  p          public.projects;          -- the project the call is made on
  v_type     text;
  v_appt     public.appointments;
  v_open     public.appointments;      -- an appointment the name already holds, which this one moves
  v_call     bigint;
  v_status   bigint;
  v_rep      bigint;
  v_old_xdate date;
  v_pay      jsonb := '[]'::jsonb;
  v_date     date;
  v_time     text;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff can record call results' using errcode = '42501';
  end if;
  if length(coalesce(v_notes, '')) > 1000 then
    raise exception 'Keep call notes under 1,000 characters' using errcode = '22023';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select * into r from public.call_results where id = p_result_id;
  if not found then
    raise exception 'Unknown call result' using errcode = '22023';
  end if;
  if r.applies_to = 'report' then
    raise exception '% is recorded automatically, not from a call', r.name using errcode = '22023';
  end if;

  select * into p from public.projects where id = l.project_id;
  if not found then
    raise exception 'This name is not in a project yet' using errcode = '22023';
  end if;
  v_type := public.project_type_code(p.id);

  -- An appointment follow-up acts on the name's open appointment, recorded
  -- against the stage that appointment was set at so each project counts it.
  if r.applies_to = 'appointment' then
    select * into v_appt from public.appointments
     where lead_id = l.id and invalid_at is null
     order by appt_create_date desc, id desc
     limit 1
     for update;
    if not found then
      raise exception 'This name has no appointment to %', case r.effect when 'confirm' then 'confirm' else 'mark invalid' end
        using errcode = '22023';
    end if;
    if r.effect = 'confirm' and v_appt.confirmed_at is not null then
      raise exception 'This appointment is already confirmed' using errcode = '22023';
    end if;
    select * into r from public.call_results
     where name = r.name and project_type = case coalesce(v_appt.set_stage, l.stage) when 'dbdev' then 'DBDV' else 'APPT' end;
  elsif r.project_type <> v_type then
    raise exception '% is not a result for % projects', r.name,
      case v_type when 'DBDV' then 'database-development' else 'appointment' end using errcode = '22023';
  end if;

  if v_role <> 'admin'
     and l.assigned_user_id is distinct from v_me
     and not exists (select 1 from public.project_assignments pa where pa.project_id = l.project_id and pa.ae_user_id = v_me)
     and not (r.applies_to = 'appointment' and v_appt.user_id = v_me) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;

  -- The call itself.
  insert into public.call_records (lead_id, project_id, user_id, call_result, notes, result_id, stage, call_date)
  values (l.id, l.project_id, v_me, r.name, v_notes, r.id, l.stage, now())
  returning id into v_call;

  select id into v_status from public.lead_statuses where code = r.status_code;

  update public.leads set
    result_id        = r.id,
    call_result_dbdv = case when r.project_type = 'DBDV' then r.name else call_result_dbdv end,
    call_result_appt = case when r.project_type = 'APPT' then r.name
                            when r.effect = 'appointment_invalid' and stage = 'appt' then r.name
                            else call_result_appt end,
    call_weight      = call_weight + case when r.applies_to = 'name' then 1 else 0 end,
    date_last_worked = now(),
    status_id        = coalesce(v_status, status_id),
    resolved_at      = case when r.viable then null else coalesce(resolved_at, now()) end,
    assigned_user_id = case when r.effect = 'pending' then null else assigned_user_id end
  where id = l.id;

  -- What the result does.
  if r.effect in ('promote', 'appointment') then
    -- A name becomes a Lead or an Appointment only with its renewal date
    -- confirmed: the Ultimate X-Date, entered (or corrected) with this result,
    -- or already on the record. A date on a policy line alone is a potential
    -- renewal the account manager has not confirmed yet.
    if p_ultimate_xdate is not null then
      update public.insurance_details set ultimate_xdate = p_ultimate_xdate where lead_id = l.id;
      if not found then
        insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_ultimate_xdate);
      end if;
    end if;
    if not exists (select 1 from public.insurance_details i where i.lead_id = l.id and i.ultimate_xdate is not null) then
      raise exception 'Enter the Ultimate X-Date: a name becomes a Lead or an Appointment only with its renewal date'
        using errcode = '22023';
    end if;

    if r.effect = 'appointment' then
      v_date := nullif(p_appointment->>'date', '')::date;
      v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
      if v_date is null then
        raise exception 'Choose the appointment date' using errcode = '22023';
      end if;
      if v_date < current_date - 1 then
        raise exception 'The appointment date has passed' using errcode = '22023';
      end if;
      if v_time is null then
        raise exception 'Choose the appointment time' using errcode = '22023';
      end if;
      if v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
        raise exception 'Give the time like 9:30 AM' using errcode = '22023';
      end if;
    end if;

    -- A name that already holds an appointment still to come, or still
    -- waiting for QA, has that one moved: one appointment, paid once.
    -- (Recording the result again is how a rep reschedules from the sheet.)
    -- One that failed QA does not count: the rep sets a real one instead.
    if r.effect = 'appointment' then
      select * into v_open from public.appointments
       where lead_id = l.id and invalid_at is null and qa_status is distinct from 'failed'
         and (qa_status = 'pending' or appt_date >= (now() at time zone public.business_tz())::date)
       order by appt_create_date desc, id desc
       limit 1
       for update;
    end if;

    if v_open.id is not null then
      update public.appointments set
        appt_date    = v_date,
        appt_time    = v_time,
        duration_min = coalesce(nullif(p_appointment->>'duration', '')::int, duration_min),
        rep_name     = coalesce(nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), rep_name),
        status_id    = case when status_id = (select id from public.appointment_statuses where name = 'Scheduled')
                             and (appt_date, coalesce(appt_time, '')) is distinct from (v_date, coalesce(v_time, ''))
                            then (select id from public.appointment_statuses where name = 'Rescheduled')
                            else status_id end,
        status_update_date = now()
      where id = v_open.id
      returning * into v_appt;
      update public.call_records set
        appointment_id = v_appt.id,
        notes = concat_ws(E'\n', notes, 'Appointment moved from ' || to_char(v_open.appt_date, 'Mon FMDD')
                  || coalesce(' ' || v_open.appt_time, '') || ' to ' || to_char(v_date, 'Mon FMDD') || coalesce(' ' || v_time, ''))
      where id = v_call;
    else

      -- From DBDev, the name moves to the linked appointment project.
      if v_type = 'DBDV' then
        if p.appt_project_id is null then
          raise exception 'Link % to an appointment project before promoting its names', p.name using errcode = '22023';
        end if;
        select * into a_r from public.call_results
         where project_type = 'APPT' and name = case r.effect when 'promote' then 'Lead-No Contact' else r.name end;
        -- A new lead goes to the appointment manager with the fewest names; an
        -- appointment stays with the rep who set it, who confirms it.
        v_rep := case r.effect when 'promote' then public.least_loaded_rep(p.appt_project_id) else v_me end;
        update public.leads set
          stage             = 'appt',
          project_id        = p.appt_project_id,
          source_project_id = coalesce(source_project_id, l.project_id),
          dbdv_user_id      = v_me,
          assigned_user_id  = v_rep,
          result_id         = a_r.id,
          call_result_appt  = a_r.name,
          call_weight       = 0,
          promoted_at       = now(),
          resolved_at       = case when a_r.viable then null else now() end
        where id = l.id;
      end if;

      if r.effect = 'appointment' then
        insert into public.appointments
          (lead_id, user_id, rep_name, appt_date, appt_time, duration_min, status_id, list_source,
           call_result_dbdv, project_id, set_project_id, set_stage, call_record_id, qa_status)
        values
          (l.id, v_me, nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), v_date, v_time,
           coalesce(nullif(p_appointment->>'duration', '')::int, 30),
           (select id from public.appointment_statuses where name = 'Scheduled'),
           l.list_source,
           case when v_type = 'DBDV' then r.name end,
           coalesce(p.appt_project_id, p.id), p.id, l.stage, v_call, 'pending')
        returning * into v_appt;
        update public.leads set appt_created_date = now() where id = l.id;
        update public.call_records set appointment_id = v_appt.id where id = v_call;
      end if;

      v_pay := v_pay || public.pay(v_me, p.id, r.pay_kind, l.id, v_appt.id, v_call);

    end if;

  elsif r.effect = 'confirm' then
    update public.appointments set
      status_id    = (select id from public.appointment_statuses where name = 'Confirmed'),
      confirmed_at = now(),
      confirmed_by = v_me,
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := v_pay || public.pay(v_me, coalesce(v_appt.set_project_id, p.id), 'confirmation', l.id, v_appt.id, v_call);
    -- The client hears now only if QA has already let them see it.
    if coalesce(v_appt.qa_status, 'passed') = 'passed' then
      perform public.notify_client_appointment(v_appt.id, true);
    end if;

  elsif r.effect = 'appointment_invalid' then
    update public.appointments set
      invalid_at = now(),
      status_id  = (select id from public.appointment_statuses where name = 'Invalid'),
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := public.charge_back(l.id, v_appt.id, array['appointment', 'confirmation'], v_call, 'Appointment invalid');

  elsif r.effect = 'lead_invalid' then
    update public.leads set call_result_dbdv = 'Lead-Invalid' where id = l.id and source_project_id is not null;
    v_pay := public.charge_back(l.id, null, array['lead'], v_call, 'Lead invalid');
    -- No record of the original payment (an older lead): charge the developer at today's rate.
    if jsonb_array_length(v_pay) = 0 and l.dbdv_user_id is not null and l.source_project_id is not null then
      insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
      select l.dbdv_user_id, l.source_project_id, l.id, v_call, 'lead', -sp.lead_rate, 'Lead invalid (no original payment on record)', v_me
        from public.projects sp where sp.id = l.source_project_id;
      v_pay := jsonb_build_array(jsonb_build_object('user_id', l.dbdv_user_id, 'kind', 'lead',
                 'amount', -(select lead_rate from public.projects where id = l.source_project_id)));
    end if;
    if l.dbdv_user_id is not null then
      perform public.notify_users(
        array[l.dbdv_user_id], 'lead', 'Lead marked invalid: ' || coalesce(l.company_name, 'a lead'),
        concat_ws(' · ', 'Charged back on your production report', 'marked by ' || public.actor_name()),
        '/leads/' || l.id, 'lead_invalid');
    end if;

  elsif r.effect = 'correct_xdate' then
    if p_corrected_xdate is null then
      raise exception 'Enter the corrected renewal date' using errcode = '22023';
    end if;
    v_old_xdate := public.lead_renewal_date(l.id);
    -- The corrected date becomes the lead's ultimate X-date, which is its
    -- renewal; the dates on the individual policy lines are left as recorded.
    update public.insurance_details set ultimate_xdate = p_corrected_xdate where lead_id = l.id;
    if not found then
      insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_corrected_xdate);
    end if;
    update public.leads set original_xdate = coalesce(original_xdate, v_old_xdate) where id = l.id;
    update public.call_records
       set notes = concat_ws(E'\n', notes, 'Renewal corrected from '
                   || coalesce(to_char(v_old_xdate, 'FMMonth YYYY'), 'none') || ' to ' || to_char(p_corrected_xdate, 'FMMonth YYYY'))
     where id = v_call;
  end if;

  select * into l from public.leads where id = l.id;
  return jsonb_build_object(
    'call_record_id', v_call,
    'lead_id',        l.id,
    'result',         r.name,
    'stage',          l.stage,
    'project_id',     l.project_id,
    'promoted',       l.project_id is distinct from p.id,
    'on_list',        (select viable and callable from public.call_results where id = l.result_id) and l.assigned_user_id is not null,
    'appointment_id', v_appt.id,
    'rescheduled',    v_open.id is not null,
    'pay',            v_pay);
end $$;

revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date) to authenticated;

-- ===== supabase/migrations/20261008100000_lead_emails.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — email a name's contact from its lead sheet
--
--   lead_emails      every email sent to a name's contact with the Email
--                    button beside Call now: who sent it, to which address,
--                    what it said, and whether the mail server took it.
--                    Written only by the server (the service role), after it
--                    has sent the email or failed to; staff see it on the
--                    lead sheet, as they see the calls.
--   can_work_lead()  whether the signed-in person may work a name (call it,
--                    record a result, email its contact): the same people
--                    record_call_result() lets record a result on it.
--
-- The mail server's address and login live in the server's environment
-- (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD), never in the database;
-- the From address is the 'mail' setting (Settings › Email).
-- ---------------------------------------------------------------------------

create table if not exists public.lead_emails (
  id          bigint generated always as identity primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  user_id     bigint references public.users(id) on delete set null,   -- who sent it
  to_address  text not null check (length(to_address) between 3 and 254),
  subject     text not null check (length(subject) between 1 and 200),
  body        text not null check (length(body) between 1 and 10000),
  status      text not null check (status in ('sent', 'failed')),
  error       text check (length(error) <= 500),                       -- why it was not sent
  message_id  text check (length(message_id) <= 300),                  -- the email's Message-ID, to trace it at the mail service
  created_at  timestamptz not null default now()
);

create index if not exists lead_emails_lead_idx on public.lead_emails (lead_id, created_at desc);
-- At most so many an hour per person: the server counts these before sending.
create index if not exists lead_emails_user_idx on public.lead_emails (user_id, created_at desc);

alter table public.lead_emails enable row level security;

drop policy if exists lead_emails_read on public.lead_emails;
create policy lead_emails_read on public.lead_emails
  for select to authenticated
  using ((select public.is_staff()));
drop policy if exists mfa_required on public.lead_emails;
create policy mfa_required on public.lead_emails as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.lead_emails;
create policy active_account_required on public.lead_emails as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

-- Nobody adds, changes or removes a sent email from the app: only the server
-- writes them. New tables here are granted to nobody by default, the server's
-- own role included, so it is given what it needs: to count and to add.
revoke all on public.lead_emails from anon;
revoke insert, update, delete, truncate on public.lead_emails from authenticated;
grant select on public.lead_emails to authenticated;
grant select, insert on public.lead_emails to service_role;

/**
 * Whether the signed-in person may work this name: an administrator, or
 * staff who hold it, are on its project, or set its open appointment (they
 * confirm it). The rule record_call_result() applies, so whoever can record
 * a result on a name can email its contact. False for anyone else, for an
 * inactive account or one short of two-factor, and for a name that is gone.
 */
create or replace function public.can_work_lead(p_lead_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when public.app_role() = 'admin' then true
             when public.app_role() in ('manager', 'agent') then
                  l.assigned_user_id = public.app_user_id()
               or exists (select 1 from public.project_assignments pa
                           where pa.project_id = l.project_id and pa.ae_user_id = public.app_user_id())
               or (select a.user_id from public.appointments a
                    where a.lead_id = l.id and a.invalid_at is null
                    order by a.appt_create_date desc, a.id desc
                    limit 1) = public.app_user_id()
           end
      from public.leads l
     where l.id = p_lead_id), false);
$$;
revoke execute on function public.can_work_lead(bigint) from public, anon;
grant execute on function public.can_work_lead(bigint) to authenticated;

-- ===== supabase/migrations/20261009100000_push_notifications.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — push notifications: on the desktop even with Lighthouse closed
--
--   push_subscriptions       each browser someone turned desktop notifications
--                            on in: where its push service takes messages for
--                            it, and the keys to encrypt them. Saved and
--                            removed only through the two functions below.
--   save_push_subscription() this browser, for the signed-in person (a browser
--                            someone else used moves to them)
--   remove_push_subscription()
--   notifications.pushed_at  when it was pushed, so each is pushed once
--   tg_notifications_push    after new notifications are added, asks the app
--                            (POST /api/push/deliver) to push them, in one
--                            call per batch, through pg_net. Does nothing
--                            until the app's address and secret are in Vault:
--
--     select vault.create_secret('https://<your app>/api/push/deliver', 'push_deliver_url');
--     select vault.create_secret('<PUSH_DELIVER_SECRET>', 'push_deliver_secret');
--
-- The app holds the push keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
-- VAPID_SUBJECT) and the same PUSH_DELIVER_SECRET.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references public.users(id) on delete cascade,
  endpoint      text not null unique check (length(endpoint) between 12 and 1000),
  p256dh        text not null check (length(p256dh) between 20 and 200),
  auth          text not null check (length(auth) between 8 and 100),
  user_agent    text check (length(user_agent) <= 300),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select public.app_user_id()));

-- Written only through the functions below (and read in full only by the server).
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete, truncate on public.push_subscriptions from authenticated;
grant select on public.push_subscriptions to authenticated;
grant select, update, delete on public.push_subscriptions to service_role;

/**
 * Save this browser's push subscription for the signed-in person. A browser
 * is one row: if someone else used it before, it is theirs no more. Only the
 * browsers' own push services are accepted, so nobody can have the server
 * post to an address of their choosing.
 */
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_host text := lower(substring(p_endpoint from '^https://([^/:?#]+)'));
begin
  if v_me is null then
    raise exception 'Sign in to turn on notifications' using errcode = '42501';
  end if;
  if v_host is null or not (
       v_host = 'fcm.googleapis.com' or v_host like '%.googleapis.com'          -- Chrome, Edge on Android
    or v_host like '%.push.services.mozilla.com'                                -- Firefox
    or v_host = 'web.push.apple.com' or v_host like '%.push.apple.com'          -- Safari
    or v_host like '%.notify.windows.com'                                       -- Edge on Windows
  ) then
    raise exception 'That is not a browser push service' using errcode = '22023';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_me;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

/** Forget this browser (turned off, or signing out). */
create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = public.app_user_id();
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pushing new notifications
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists pushed_at timestamptz;

-- The server reads new notifications and marks them pushed; nothing else.
grant select on public.notifications to service_role;
grant update (pushed_at) on public.notifications to service_role;

/**
 * After notifications are added (one, or a batch to a whole role), ask the
 * app to push them: one call with every id. Never holds up or fails the
 * insert: pg_net sends it after the transaction commits, and anything that
 * goes wrong here is only a warning.
 */
create or replace function public.tg_notifications_push()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_ids    bigint[];
begin
  select array_agg(id order by id) into v_ids from new_rows where read_at is null;
  if v_ids is null then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
  if v_url is null or v_secret is null then
    return null; -- push not set up yet
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  raise warning 'push: % (%)', sqlerrm, sqlstate;
  return null;
end $$;
revoke execute on function public.tg_notifications_push() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.tg_notifications_push();

-- ===== supabase/migrations/20261010100000_lead_contacts.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — more ways to reach a name: mobiles and the decision maker
--
-- A name had one phone and one email, and its decision maker only a name
-- and title. Now the contact has a mobile too, and the decision maker a
-- business phone, a mobile and an email; the lead sheet puts a Call button
-- beside every number and an Email button beside every address.
--
--   leads.contact_mobile, dm_phone, dm_mobile, dm_email
--   leads.search_text   now also the decision maker's name and the new
--                       numbers and addresses, so a call back from a mobile
--                       finds its name
--   lead_explore()      its rows carry them too, for the Lead Explorer's CSV
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists contact_mobile text check (length(contact_mobile) <= 40),
  add column if not exists dm_phone       text check (length(dm_phone) <= 40),
  add column if not exists dm_mobile      text check (length(dm_mobile) <= 40),
  add column if not exists dm_email       text check (length(dm_email) <= 120);

-- The search column, rebuilt with the new fields (search_doc() reads each
-- number also as bare digits, however it is written).
drop index if exists public.leads_search_text_trgm;
alter table public.leads drop column if exists search_text;
alter table public.leads
  add column search_text text
    -- || rather than concat_ws(), which is not immutable and so cannot feed a generated column.
    generated always as (public.search_doc(
      coalesce(company_name, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' || coalesce(zip, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' ||
      coalesce(contact_mobile, '') || ' ' || coalesce(decision_maker, '') || ' ' || coalesce(dm_phone, '') || ' ' ||
      coalesce(dm_mobile, '') || ' ' || coalesce(dm_email, ''))) stored;
create index if not exists leads_search_text_trgm on public.leads using gin (search_text extensions.gin_trgm_ops);

-- The Lead Explorer: the same as before, its rows carrying the new fields (for the CSV).
create or replace function public.lead_explore(criteria jsonb default '{}'::jsonb, page int default 1, per_page int default 10)
returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'statuses',  '[]'::jsonb)))          as statuses,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select jsonb_array_elements_text(coalesce(criteria->'carriers',  '[]'::jsonb)))          as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      public.search_patterns(public.search_words(criteria->>'q'))    as pats,
      public.search_lead_pattern(public.search_words(criteria->>'q')) as first_pat
  ),
  carrier_keys as (
    select coalesce(array_agg(distinct k) filter (where k is not null), '{}') as keys
      from (
        select public.carrier_key(v) as k from c, unnest(c.carriers) v where v !~ '^[0-9]+$'
        union all
        select public.carrier_key(a.name) from public.agencies a, c
         where a.id::text = any(array(select v from unnest(c.carriers) v where v ~ '^[0-9]{1,18}$'))
      ) t
  ),
  m as (
    select l.id, l.company_name, l.contact_name, l.contact_title, l.phone, l.contact_mobile, l.email,
           l.decision_maker, l.dm_title, l.dm_phone, l.dm_mobile, l.dm_email,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name,
           coalesce(ag.name, nullif(btrim(ins.agency_name), '')) as carrier_name,
           st.code as status_code, st.name as status_name,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
      cross join carrier_keys ck
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.lead_statuses st on st.id = l.status_id
      left join public.users u      on u.id  = l.assigned_user_id
     where (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.statuses) = 0 or st.code            = any(c.statuses))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
       and (cardinality(c.carriers) = 0 or public.carrier_key(coalesce(ag.name, ins.agency_name)) = any(ck.keys))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       and (cardinality(c.months)   = 0 or extract(month from coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate,
              ins.health_xdate, ins.dental_xdate, ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)))::int = any(c.months))
       -- The longest word first, which the trigram index can answer; then every word.
       and (cardinality(c.pats)     = 0 or (l.search_text like c.first_pat and l.search_text like all (c.pats)))
  ),
  win as (
    select * from m
     order by lead_date desc nulls last, id desc
     limit greatest(least(coalesce(per_page, 10), 10000), 1)
    offset least(greatest(coalesce(page, 1) - 1, 0)::bigint * greatest(least(coalesce(per_page, 10), 10000), 1), 1000000000)
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win)), '[]'::jsonb) from win),
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from renewal_date)::int as mon, count(*) as n
                            from m where renewal_date is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('code', t.status_code, 'label', coalesce(t.status_name, '—'), 'count', t.n)
                                            order by t.n desc), '[]'::jsonb)
                    from (select status_code, status_name, count(*) as n from m group by status_code, status_name) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where renewal_date is not null)
  );
$$;

-- ===== supabase/migrations/20261011100000_secondary_contact.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a secondary contact on a name
--
-- As the client asked: under the decision maker, a secondary contact with
-- a name, title, business phone, mobile and email, each with its Call or
-- Email button on the lead sheet.
--
--   leads.contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email
--   leads.search_text   also the secondary contact's name, numbers and address
--   lead_explore()      its rows carry them, and the producer's name, for the CSV
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists contact2_name   text check (length(contact2_name) <= 80),
  add column if not exists contact2_title  text check (length(contact2_title) <= 60),
  add column if not exists contact2_phone  text check (length(contact2_phone) <= 40),
  add column if not exists contact2_mobile text check (length(contact2_mobile) <= 40),
  add column if not exists contact2_email  text check (length(contact2_email) <= 120);

-- The search column, rebuilt with them.
drop index if exists public.leads_search_text_trgm;
alter table public.leads drop column if exists search_text;
alter table public.leads
  add column search_text text
    -- || rather than concat_ws(), which is not immutable and so cannot feed a generated column.
    generated always as (public.search_doc(
      coalesce(company_name, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' || coalesce(zip, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' ||
      coalesce(contact_mobile, '') || ' ' || coalesce(decision_maker, '') || ' ' || coalesce(dm_phone, '') || ' ' ||
      coalesce(dm_mobile, '') || ' ' || coalesce(dm_email, '') || ' ' || coalesce(contact2_name, '') || ' ' ||
      coalesce(contact2_phone, '') || ' ' || coalesce(contact2_mobile, '') || ' ' || coalesce(contact2_email, ''))) stored;
create index if not exists leads_search_text_trgm on public.leads using gin (search_text extensions.gin_trgm_ops);

-- The Lead Explorer: the same as before, its rows carrying the new fields (for the CSV).
create or replace function public.lead_explore(criteria jsonb default '{}'::jsonb, page int default 1, per_page int default 10)
returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'statuses',  '[]'::jsonb)))          as statuses,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select jsonb_array_elements_text(coalesce(criteria->'carriers',  '[]'::jsonb)))          as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      public.search_patterns(public.search_words(criteria->>'q'))    as pats,
      public.search_lead_pattern(public.search_words(criteria->>'q')) as first_pat
  ),
  carrier_keys as (
    select coalesce(array_agg(distinct k) filter (where k is not null), '{}') as keys
      from (
        select public.carrier_key(v) as k from c, unnest(c.carriers) v where v !~ '^[0-9]+$'
        union all
        select public.carrier_key(a.name) from public.agencies a, c
         where a.id::text = any(array(select v from unnest(c.carriers) v where v ~ '^[0-9]{1,18}$'))
      ) t
  ),
  m as (
    select l.id, l.company_name, l.contact_name, l.contact_title, l.phone, l.contact_mobile, l.email,
           l.decision_maker, l.dm_title, l.dm_phone, l.dm_mobile, l.dm_email,
           l.contact2_name, l.contact2_title, l.contact2_phone, l.contact2_mobile, l.contact2_email, l.producer_name,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name,
           coalesce(ag.name, nullif(btrim(ins.agency_name), '')) as carrier_name,
           st.code as status_code, st.name as status_name,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
      cross join carrier_keys ck
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.lead_statuses st on st.id = l.status_id
      left join public.users u      on u.id  = l.assigned_user_id
     where (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.statuses) = 0 or st.code            = any(c.statuses))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
       and (cardinality(c.carriers) = 0 or public.carrier_key(coalesce(ag.name, ins.agency_name)) = any(ck.keys))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       and (cardinality(c.months)   = 0 or extract(month from coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate,
              ins.health_xdate, ins.dental_xdate, ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)))::int = any(c.months))
       -- The longest word first, which the trigram index can answer; then every word.
       and (cardinality(c.pats)     = 0 or (l.search_text like c.first_pat and l.search_text like all (c.pats)))
  ),
  win as (
    select * from m
     order by lead_date desc nulls last, id desc
     limit greatest(least(coalesce(per_page, 10), 10000), 1)
    offset least(greatest(coalesce(page, 1) - 1, 0)::bigint * greatest(least(coalesce(per_page, 10), 10000), 1), 1000000000)
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win)), '[]'::jsonb) from win),
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from renewal_date)::int as mon, count(*) as n
                            from m where renewal_date is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('code', t.status_code, 'label', coalesce(t.status_name, '—'), 'count', t.n)
                                            order by t.n desc), '[]'::jsonb)
                    from (select status_code, status_name, count(*) as n from m group by status_code, status_name) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where renewal_date is not null)
  );
$$;

-- ===== supabase/migrations/20261012100000_coverage_lines.sql =====
-- ---------------------------------------------------------------------------
-- Lighthouse CRM — Personal Lines on a name's coverage
--
-- As the client asked: the Coverage tab lists Package, Workers Comp, Auto,
-- Group Health and Personal Lines, each with its X-date and carrier, and
-- account managers fill them in on the lead sheet. Personal Lines is new.
--
--   insurance_details.personal_lines_xdate, personal_lines_carrier
-- ---------------------------------------------------------------------------

alter table public.insurance_details
  add column if not exists personal_lines_xdate   date,
  add column if not exists personal_lines_carrier text check (length(personal_lines_carrier) <= 120);

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
  ('new',     'New'),
  ('not_interested',  'Not interested'),
  ('disconnected',    'Disconnected number'),
  ('out_of_business', 'Out of business'),
  ('not_qualified',   'Not qualified'),
  ('do_not_call',     'Do not call'),
  ('removed',         'Removed'),
  ('invalid',         'Invalid lead')
-- Later migrations add statuses too; on a fresh install they run first.
on conflict (code) do nothing;

insert into public.appointment_statuses (name) values
  ('Scheduled'), ('Confirmed'), ('Held'), ('Rescheduled'), ('Cancelled'), ('No Show'), ('Invalid')
on conflict (name) do nothing;

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
  ('7349', 'Building Cleaning & Maintenance Services')
-- The Lead Explorer migration adds codes too; on a fresh install it runs first.
on conflict (code) do nothing;

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
  (auth_id, company_id, user_type_id, role, first_name, last_name, email, username, phone, city, state, status, last_login)
values
  ((select id from auth.users where email='admin@beacon.test'),  null,
   (select id from public.user_types where code='ADMIN'),  'admin',   'Darcy',  'Johnston',  'admin@beacon.test',  'darcy',  '(480) 555-0111', 'Scottsdale', 'AZ', 'active', now() - interval '2 hours'),

  ((select id from auth.users where email='sean@beacon.test'),   null,
   (select id from public.user_types where code='AE'),     'manager', 'Sean',   'Fitzgerald','sean@beacon.test',   'seanf',  '(480) 555-0122', 'Phoenix',    'AZ', 'active', now() - interval '1 day'),

  ((select id from auth.users where email='mike@beacon.test'),   null,
   (select id from public.user_types where code='AE'),     'manager', 'Mike',   'Preston',   'mike@beacon.test',   'mikep',  '(319) 555-0133', 'Cedar Rapids','IA','active', now() - interval '3 hours'),

  ((select id from auth.users where email='rachel@beacon.test'), null,
   (select id from public.user_types where code='AE'),     'manager', 'Rachel', 'Colestock', 'rachel@beacon.test', 'rcole',  '(520) 555-0144', 'Tucson',     'AZ', 'active', now() - interval '5 days'),

  ((select id from auth.users where email='agent@beacon.test'),  null,
   (select id from public.user_types where code='AGENT'),  'agent',   'Tyler',  'Nguyen',    'agent@beacon.test',  'tylern', '(602) 555-0155', 'Phoenix',    'AZ', 'active', now() - interval '20 minutes'),

  ((select id from auth.users where email='client@beacon.test'),
   (select id from public.companies where name='Garry Insurance'),
   (select id from public.user_types where code='CLIENT'), 'client',  'Jeff',   'Garry',     'client@beacon.test', 'jgarry', '(602) 555-0148', 'Phoenix',    'AZ', 'active', now() - interval '4 days');

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
  ('Import finished',         'import_done',   'email', 'admin@beacon.test',           true),
  ('Client feedback received','feedback_new',  'email', 'admin@beacon.test',           false);

insert into public.alert_log (rule_id, subject, detail, status, created_at)
select r.id, v.subject, v.detail, v.status, now() - (v.age || ' hours')::interval
-- Only rules that really send: the X-date and appointment reminders have no job behind them yet.
from (values
  ('New appointment set',      'Appointment set: Garry Insurance',      'In-app to 3 people',                                     'sent',   7),
  ('Hot lead assigned',        'Hot lead: Zimmermann Agency',           'In-app to 1 person',                                     'sent',  26),
  ('Import finished',          'Import finished: az-commercial-q3.csv', 'In-app to 1 person',                                     'sent',  50),
  ('New appointment set',      'Appointment set: Bender Group',         'In-app to 2 people',                                     'sent',  98)
) as v(rule, subject, detail, status, age)
join public.alert_rules r on r.name = v.rule;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('organization', '{"name":"Signature Marketing","email":"info@signaturemktg.net","phone":"(480) 555-0100","timezone":"MST"}'::jsonb),
  ('security',     '{"session_timeout_min":60,"password_min_length":10}'::jsonb),
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

-- The seed's projects and names join the lead lifecycle: DBDev projects are
-- paired with their client's Appt project, and each name gets its call result
-- (see supabase/migrations/20260930120000_lead_lifecycle.sql).
select public.lifecycle_backfill();

