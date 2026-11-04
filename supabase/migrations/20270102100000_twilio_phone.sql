-- The phone's Twilio line (Nov 2026): who has Lighthouse open with the phone ready to take a call, so a
-- call coming in to the Twilio number rings them. The server stamps a person's row each time their
-- browser fetches its calling token (app/api/phone/token, every few minutes while a tab is open), and
-- reads the fresh ones when a call comes in (app/api/twilio/voice). Only the server's own key reads or
-- writes it; nobody's browser sees who else is online.
--
-- Safe to run more than once.

create table if not exists public.phone_presence (
  user_id  bigint primary key references public.users(id) on delete cascade,
  seen_at  timestamptz not null default now()
);

create index if not exists phone_presence_seen_idx on public.phone_presence (seen_at desc);

alter table public.phone_presence enable row level security;

revoke all on public.phone_presence from anon, authenticated;
grant select, insert, update, delete on public.phone_presence to service_role;

-- A voicemail left on the Twilio number: a notice to each active administrator (pushed to their desktop
-- like any other), from app/api/twilio/voice once Twilio says a message was recorded. The server's own
-- key only. Returns how many were told.
create or replace function public.phone_voicemail_notice(p_title text, p_body text, p_link text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select u.id, 'system', left(p_title, 200), left(p_body, 2000), p_link
  from public.users u
  where u.role = 'admin' and u.status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.phone_voicemail_notice(text, text, text) from public, anon, authenticated;
grant execute on function public.phone_voicemail_notice(text, text, text) to service_role;
