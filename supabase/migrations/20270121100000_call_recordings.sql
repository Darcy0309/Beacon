-- Call recordings (Nov 2026): Record on the phone during a call made Twilio record it, kept only in
-- the Twilio account, and Lighthouse never heard of it again. Now Twilio says when a recording is
-- done (app/api/twilio/voice?step=recorded); it is kept here, and the person who recorded it is told,
-- with a player, as a voicemail is (notifications/[id]).
--
--   phone_recordings          one row per recording: whose call, with which number, how long, the lead
--   phone_recording_saved()   what the server writes it with, telling the person (the server's own key)
--
-- Who may play one (app/api/phone/recordings/[sid]): an administrator, or the person who recorded it.
--
-- Safe to run more than once.

create table if not exists public.phone_recordings (
  recording_sid text primary key check (recording_sid ~* '^RE[0-9a-f]{32}$'),
  call_sid      text not null,
  user_id       bigint references public.users(id) on delete set null,
  number        text,
  seconds       integer not null default 0 check (seconds >= 0),
  lead_id       bigint references public.leads(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists phone_recordings_user_idx on public.phone_recordings (user_id, created_at);
create index if not exists phone_recordings_lead_idx on public.phone_recordings (lead_id);

alter table public.phone_recordings enable row level security;
revoke all on public.phone_recordings from anon, authenticated;
grant select on public.phone_recordings to service_role;

/**
 * A recording done: kept, and its person told (once: Twilio may say so more than once). The
 * notification's title and body are the server's (lib voicemail.js reads them back). Returns
 * whether it was new.
 */
create or replace function public.phone_recording_saved(
  p_sid text, p_call text, p_user bigint, p_number text, p_seconds integer, p_lead bigint,
  p_title text, p_body text, p_link text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_new boolean;
begin
  insert into public.phone_recordings (recording_sid, call_sid, user_id, number, seconds, lead_id)
  values (p_sid, p_call, p_user, p_number, greatest(coalesce(p_seconds, 0), 0), p_lead)
  on conflict (recording_sid) do nothing;
  v_new := found;
  if v_new and p_user is not null then
    insert into public.notifications (user_id, kind, title, body, link)
    select u.id, 'system', left(p_title, 200), left(p_body, 2000), p_link
      from public.users u
     where u.id = p_user and u.status = 'active';
  end if;
  return v_new;
end $$;

revoke execute on function public.phone_recording_saved(text, text, bigint, text, integer, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.phone_recording_saved(text, text, bigint, text, integer, bigint, text, text, text) to service_role;

notify pgrst, 'reload schema';
