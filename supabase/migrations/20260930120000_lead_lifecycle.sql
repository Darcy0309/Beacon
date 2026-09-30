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
