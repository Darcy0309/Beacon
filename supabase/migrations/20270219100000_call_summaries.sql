-- A recorded call's AI summary (client, Nov 2026): on "AI summary" under a transcribed call, Claude
-- reads its transcript and writes a short summary, kept with the recording so it's written once.
-- The server writes it with its own key (lib/server/call-summaries.js); it is read with the
-- recording, by whoever may play it.
--
--   summary          { "overview": "…", "points": ["…"], "next_step": "…" | null }
--   summary_at       when it was written
--   summary_model    the Claude model that wrote it
--
-- Safe to run more than once.

alter table public.phone_recordings
  add column if not exists summary       jsonb,
  add column if not exists summary_at    timestamptz,
  add column if not exists summary_model text;

grant update (summary, summary_at, summary_model) on public.phone_recordings to service_role;

notify pgrst, 'reload schema';
