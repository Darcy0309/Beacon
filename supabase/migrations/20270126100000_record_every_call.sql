-- Record every call (Sean, Nov 2026): with the setting on (app_settings 'phone', { record_all, record_notice },
-- Settings → Call Recording), each call on the Lighthouse phone is recorded from the moment it is answered.
-- Those recordings are kept as the Record button's are, on the lead's Conversation, but without a
-- "Recorded call with…" notification for every call: phone_recording_saved() tells the person only when
-- given a title. The Record button's own recordings still come with one.
--
-- Safe to run more than once.

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
  -- No title: recorded by "Record every call", kept without telling anyone.
  if v_new and p_user is not null and p_title is not null then
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
