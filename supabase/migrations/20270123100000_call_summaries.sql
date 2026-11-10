-- A recorded call's transcript and summary (client, Nov 2026), on the lead's Conversation: when a
-- recording is done, Twilio's Conversational Intelligence transcribes it (each side on its own
-- channel), and Claude writes a short summary of it. The server writes these with its own key
-- (lib/server/call-ai.js); they are read with the recording, by whoever may play it.
--
--   ai_status       null (not transcribed: not set up when it was recorded), 'transcribing',
--                   'summarizing', 'done', or 'failed' (ai_error says why)
--   transcript_sid  Twilio's transcript (GT…)
--   transcript      [{ "side": 1 | 2, "at": seconds, "text": "…" }]: side 1 is ours, side 2 theirs
--   summary         a few sentences: who, what, how it ended, what's next
--
-- Safe to run more than once.

alter table public.phone_recordings
  add column if not exists ai_status     text check (ai_status in ('transcribing', 'summarizing', 'done', 'failed')),
  add column if not exists ai_error      text,
  add column if not exists ai_updated_at timestamptz,
  add column if not exists transcript_sid text,
  add column if not exists transcript    jsonb,
  add column if not exists summary       text;

create unique index if not exists phone_recordings_transcript_idx on public.phone_recordings (transcript_sid) where transcript_sid is not null;

grant update (ai_status, ai_error, ai_updated_at, transcript_sid, transcript, summary) on public.phone_recordings to service_role;

notify pgrst, 'reload schema';
