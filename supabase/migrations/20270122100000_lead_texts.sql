-- Texts (Nov 2026): texting a lead's contact from its lead sheet's Conversation, through the phone's
-- Twilio number, and their replies coming back to it.
--
--   lead_texts    one row per text, sent or received: the lead (when the number is one's), who sent it,
--                 the numbers, what it said, and how it went (Twilio says: app/api/twilio/sms)
--
-- Read by the staff, as the lead's emails are; written only by the server (its own key): a text sent
-- (features/texts/actions.js), a reply received and each status Twilio sends.
--
-- Safe to run more than once.

create table if not exists public.lead_texts (
  id          bigint generated always as identity primary key,
  lead_id     bigint references public.leads(id) on delete set null,
  user_id     bigint references public.users(id) on delete set null,
  direction   text not null check (direction in ('out', 'in')),
  from_number text not null,
  to_number   text not null,
  body        text not null default '' check (char_length(body) <= 1600),
  media       integer not null default 0 check (media >= 0),
  status      text not null default 'queued',
  error       text,
  twilio_sid  text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists lead_texts_lead_idx on public.lead_texts (lead_id, created_at);
create index if not exists lead_texts_user_idx on public.lead_texts (user_id, created_at);
-- A reply finds the conversation it belongs to by the number it came from.
create index if not exists lead_texts_to_idx on public.lead_texts (to_number, created_at);

alter table public.lead_texts enable row level security;
revoke all on public.lead_texts from anon, authenticated;
grant select on public.lead_texts to authenticated;
grant all on public.lead_texts to service_role;

drop policy if exists lead_texts_read on public.lead_texts;
create policy lead_texts_read on public.lead_texts
  for select to authenticated
  using ((select public.is_staff()));
drop policy if exists mfa_required on public.lead_texts;
create policy mfa_required on public.lead_texts as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.lead_texts;
create policy active_account_required on public.lead_texts as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

/**
 * A reply received: a notification to each of p_users (pushed to their desktop too), as the server
 * words it (app/api/twilio/sms). Only active accounts. Returns how many were told.
 */
create or replace function public.lead_text_notice(p_users bigint[], p_title text, p_body text, p_link text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select u.id, 'lead', left(p_title, 200), left(p_body, 2000), p_link
    from public.users u
   where u.id = any (p_users) and u.status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.lead_text_notice(bigint[], text, text, text) from public, anon, authenticated;
grant execute on function public.lead_text_notice(bigint[], text, text, text) to service_role;

notify pgrst, 'reload schema';
