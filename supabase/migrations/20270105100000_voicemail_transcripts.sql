-- A voicemail's transcript (Nov 2026): Twilio writes out what was said in a voicemail on the phone's
-- number (app/api/twilio/voice?step=transcribed), a minute or so after it was left, and it is added to
-- the voicemail's notifications ("Transcript: …", a line of its own at the end), where the notification
-- page shows it under the recording. Once only; the server's own key only.
--
-- Safe to run more than once.

create or replace function public.phone_voicemail_transcript(p_recording text, p_text text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_recording !~ '^RE[0-9a-fA-F]{32}$' or nullif(btrim(p_text), '') is null then
    return 0;
  end if;
  update public.notifications
     set body = left(body || E'\nTranscript: ' || btrim(p_text), 6000)
   where kind = 'system'
     and title like 'Voicemail from %'
     and strpos(body, '/api/phone/recordings/' || p_recording) > 0
     and strpos(body, E'\nTranscript: ') = 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.phone_voicemail_transcript(text, text) from public, anon, authenticated;
grant execute on function public.phone_voicemail_transcript(text, text) to service_role;
