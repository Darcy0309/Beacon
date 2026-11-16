-- The phone lines (Sean, Nov 2026), as the office has them on PanTerra, moved to Twilio:
--
--   "One of the toll-free #s is for Signature Marketing (rings to Mike or I) and the other toll-free # is for
--   managers… that auto-attendant says You've reached the insurance office with prompts to transfer to a direct
--   extension." "If a caller doesn't dial an extension: straight to a general voicemail, and 1-2 managers get those
--   messages." Managers call all over the country from a local caller ID, "changing it 2-3x per hour".
--
--   phone_lines        the account's Twilio numbers and what each is for:
--                        main       rings the people chosen (ring_user_ids), then their voicemail
--                        attendant  the "insurance office" greeting: an extension rings that manager, then their
--                                   voicemail; none dialed, the general voicemail
--                        local      a local caller ID for calls out (by area code); a call back to it rings the
--                                   manager who last called that number, else the attendant
--                      A number not listed (the one in TWILIO_CALLER_ID before this) rings as before.
--   users.phone_ext    a manager's extension (already on the user form)
--   users.voicemail_*  their voicemail greeting: an AI voice reading their words (or the usual ones), or a
--                      recording of their own (voicemail-greetings bucket, played to callers through a link
--                      that lasts minutes)
--   app_settings phone: attendant_greeting, general_voicemail_users (the people the general voicemail goes to)
--   phone_voicemail_notice_to(users, …)   a voicemail's notice to the people its box is for (none: the admins)
--   phone_voicemail_access                who may play a voicemail (its box's people); admins may play any
--
-- Safe to run more than once.

create table if not exists public.phone_lines (
  id            bigserial primary key,
  number        text not null unique check (number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  kind          text not null check (kind in ('main', 'attendant', 'local')),
  label         text check (length(label) <= 80),
  ring_user_ids bigint[] not null default '{}',
  area_code     text generated always as (substr(number, 3, 3)) stored,
  created_at    timestamptz not null default now(),
  created_by    bigint references public.users(id) on delete set null
);
create index if not exists phone_lines_area on public.phone_lines (area_code) where kind = 'local';

alter table public.phone_lines enable row level security;
-- The staff who call read them (to pick a caller ID); administrators set them.
drop policy if exists phone_lines_read on public.phone_lines;
create policy phone_lines_read on public.phone_lines for select to authenticated using ((select public.is_staff()));
drop policy if exists phone_lines_write on public.phone_lines;
create policy phone_lines_write on public.phone_lines for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.phone_lines;
create policy mfa_required on public.phone_lines as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.phone_lines;
create policy active_account_required on public.phone_lines as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.phone_lines from anon;
grant select, insert, update, delete on public.phone_lines to authenticated, service_role;
grant usage on sequence public.phone_lines_id_seq to authenticated, service_role;

alter table public.users add column if not exists voicemail_greeting text check (length(voicemail_greeting) <= 500);
alter table public.users add column if not exists voicemail_audio_path text;
alter table public.users add column if not exists voicemail_use_recording boolean not null default false;

-- A manager's own greeting, recorded in the browser (a WAV) or uploaded: read by the server alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voicemail-greetings', 'voicemail-greetings', false, 5242880, array['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.phone_voicemail_access (
  recording_sid text not null,
  user_id       bigint not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (recording_sid, user_id)
);
alter table public.phone_voicemail_access enable row level security;
revoke all on public.phone_voicemail_access from anon, authenticated;
grant select, insert, delete on public.phone_voicemail_access to service_role;

/**
 * A voicemail left in a box: a notice to its people (active ones), who may then play it; with nobody to tell
 * (none chosen, or none active), the administrators, as every voicemail went before.
 */
create or replace function public.phone_voicemail_notice_to(p_users bigint[], p_sid text, p_title text, p_body text, p_link text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_to bigint[];
begin
  select array_agg(u.id) into v_to from public.users u
   where u.status = 'active' and u.deleted_at is null and u.id = any(coalesce(p_users, '{}'));
  if v_to is null then
    select array_agg(u.id) into v_to from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null;
  end if;
  if v_to is null then return 0; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select x, 'system', left(p_title, 200), left(p_body, 2000), p_link from unnest(v_to) x;
  if p_sid is not null then
    insert into public.phone_voicemail_access (recording_sid, user_id) select p_sid, x from unnest(v_to) x on conflict do nothing;
  end if;
  return cardinality(v_to);
end $$;
revoke execute on function public.phone_voicemail_notice_to(bigint[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.phone_voicemail_notice_to(bigint[], text, text, text, text) to service_role;
