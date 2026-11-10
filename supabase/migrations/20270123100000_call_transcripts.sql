-- A recorded call's transcript (client, Nov 2026), on the lead's Conversation: when a recording is
-- done, Twilio's Conversational Intelligence transcribes it, each side on its own channel. The
-- server writes it with its own key (lib/server/call-transcripts.js); it is read with the
-- recording, by whoever may play it.
--
--   transcript_status       null (not transcribed: not set up when it was recorded), 'transcribing',
--                           'done', or 'failed' (transcript_error says why)
--   transcript_sid          Twilio's transcript (GT…)
--   transcript              [{ "side": 1 | 2, "at": seconds, "text": "…" }]: side 1 is ours, side 2 theirs
--   transcript_updated_at   when it last changed (one left waiting is looked at again)
--
-- Safe to run more than once.

alter table public.phone_recordings
  add column if not exists transcript_status     text check (transcript_status in ('transcribing', 'done', 'failed')),
  add column if not exists transcript_error      text,
  add column if not exists transcript_updated_at timestamptz,
  add column if not exists transcript_sid        text,
  add column if not exists transcript            jsonb;

create unique index if not exists phone_recordings_transcript_idx on public.phone_recordings (transcript_sid) where transcript_sid is not null;

grant update (transcript_status, transcript_error, transcript_updated_at, transcript_sid, transcript) on public.phone_recordings to service_role;

notify pgrst, 'reload schema';
