-- ---------------------------------------------------------------------------
-- Lighthouse CRM — Project Info: the client profile sheet (Sean, Oct 2026)
--
-- What a client tells Signature Marketing when they come on board (the
-- Client Profile Questionnaire, typed into the old system's project profile
-- by hand): the agent and their office, the states they are licensed in, up
-- to five producers taking appointments (and which of them get each lead and
-- appointment by email), the carriers they place with and those they can't
-- compete with, the weekdays to keep appointments off, and what an
-- appointment needs to qualify. Managers read it on every lead sheet (the
-- Project Info tab); administrators and the client's own people change it,
-- the client from their own sign-in or from a private link sent when they
-- come on board.
--
-- The agent's name, phone and address are the project's office (projects:
-- contact_name, phone, address, city, state, zip), as the project form has
-- them; the rest is here, one row a project. A DB dev project shares the
-- Project Info of the appointment project it promotes to, as it shares that
-- project's calendar.
--
-- Staff read it, and a client's people read their own projects'. Only the
-- server writes it, once it has checked who is asking: an administrator,
-- the client's own person, or a private link whose key is still the row's.
--
--   project_profiles      one row a project
--     producers           [{ first, last, email, leads }], at most five;
--                         `leads`: emailed each lead and appointment
--     avoid_days          weekdays (0 Sunday … 6 Saturday) blocked out on
--                         the project's calendar, every week
--     link_key            the private link's key: a new one ends the links
--                         sent before it
-- ---------------------------------------------------------------------------

create table if not exists public.project_profiles (
  project_id         bigint primary key references public.projects(id) on delete cascade,
  agent_mobile       text check (length(agent_mobile) <= 40),
  agent_email        text check (length(agent_email) <= 254),
  states_licensed    text[] not null default '{}' check (cardinality(states_licensed) <= 60),
  producers          jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(producers) = 'array' and jsonb_array_length(producers) <= 5),
  top_carriers       text[] not null default '{}' check (cardinality(top_carriers) <= 200),
  avoid_carriers     text[] not null default '{}' check (cardinality(avoid_carriers) <= 200),
  avoid_days         smallint[] not null default '{}' check (avoid_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  special_programs   text check (length(special_programs) <= 4000),
  personal_lines     boolean,
  min_employees      smallint check (min_employees between 0 and 250),
  quote_time         text check (length(quote_time) <= 40),
  quote_min_time     text check (length(quote_min_time) <= 40),
  wc_mono            boolean,
  wc_min_employees   integer check (wc_min_employees between 0 and 1000000),
  auto_mono          boolean,
  auto_min_autos     integer check (auto_min_autos between 0 and 1000000),
  health_only        boolean,
  health_min_lives   integer check (health_min_lives between 0 and 1000000),
  value_added        text check (length(value_added) <= 4000),
  exclusive_program  text check (length(exclusive_program) <= 4000),
  industry_notes     text check (length(industry_notes) <= 4000),
  link_key           text check (length(link_key) <= 64),
  updated_at         timestamptz not null default now(),
  updated_by         bigint references public.users(id) on delete set null,
  updated_via        text check (updated_via in ('app', 'link'))
);

alter table public.project_profiles enable row level security;
drop policy if exists project_profiles_read on public.project_profiles;
create policy project_profiles_read on public.project_profiles
  for select to authenticated
  using ((select public.is_staff()) or project_id in (select public.client_project_ids()));
drop policy if exists mfa_required on public.project_profiles;
create policy mfa_required on public.project_profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.project_profiles;
create policy active_account_required on public.project_profiles as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.project_profiles from anon;
revoke insert, update, delete, truncate on public.project_profiles from authenticated;
grant select on public.project_profiles to authenticated;
grant all on public.project_profiles to service_role;

notify pgrst, 'reload schema';
