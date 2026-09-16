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
