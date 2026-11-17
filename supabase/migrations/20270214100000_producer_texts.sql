-- Texts to a client's producers (Sean, Nov 2026: "the option to receive text messages in addition to emails for new
-- appointments, appointment confirmations, & reschedules … a huge selling point for clients"). Project Info's
-- producers each have a mobile and a Texts tick now (in its producers jsonb: mobile, texts); as an appointment's
-- email goes to the client (held in QA with it), each producer ticked gets a short text from Lighthouse's number.
-- Each text is kept here, with how Twilio says it went (app/api/twilio/sms?step=status).
--
-- Safe to run more than once.

create table if not exists public.producer_texts (
  id             bigint generated always as identity primary key,
  lead_id        bigint references public.leads(id) on delete cascade,
  call_record_id bigint references public.call_records(id) on delete set null,
  project_id     bigint references public.projects(id) on delete set null,
  kind           text not null check (kind in ('new', 'confirmed', 'rescheduled')),
  to_number      text not null check (length(to_number) <= 20),
  to_name        text check (length(to_name) <= 90),
  body           text not null check (length(body) <= 1600),
  twilio_sid     text unique,
  status         text not null default 'queued' check (length(status) <= 20),
  error          text check (length(error) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index if not exists producer_texts_lead on public.producer_texts (lead_id, created_at desc);
-- One text per producer per call, however many times its delivery runs.
create unique index if not exists producer_texts_once on public.producer_texts (call_record_id, to_number) where call_record_id is not null;

alter table public.producer_texts enable row level security;
-- Administrators read them; the server writes them.
drop policy if exists producer_texts_read on public.producer_texts;
create policy producer_texts_read on public.producer_texts for select to authenticated using ((select public.is_admin()));
drop policy if exists mfa_required on public.producer_texts;
create policy mfa_required on public.producer_texts as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on public.producer_texts from anon, authenticated;
grant select on public.producer_texts to authenticated;
grant select, insert, update, delete on public.producer_texts to service_role;
