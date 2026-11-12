-- A call, and its recording, on the lead it was made from (Sean, Nov 2026: "recordings crossing over to
-- different leads/projects"). A lead's Conversation found its calls by number, so a number on several
-- leads (the same business called for two clients, or a test number) showed every one of them on each.
-- Now each call keeps the lead it was dialed from (phone_calls.lead_id, sent by the phone with the call),
-- and the Conversation shows a lead only its own.
--
--   a call out      the lead it was dialed from
--   a call in       the lead last called on that number (calling back); its legs, as the call
--   calls before    from work_activity: the lead the same person started a call on that minute, with that
--                   number; a call in, as above. Any left without one show only where the number is on
--                   one lead alone (src/features/texts/conversation.js).
--
-- Safe to run more than once.

alter table public.phone_calls add column if not exists lead_id bigint references public.leads(id) on delete set null;
create index if not exists phone_calls_lead_idx on public.phone_calls (lead_id, started_at);
create index if not exists phone_calls_number_idx on public.phone_calls (number, started_at);

drop function if exists public.phone_call_event(text, text, bigint, text, text, text, integer);

/**
 * A leg's news from Twilio (as before), and the lead it is on: a call out's, as the phone sent it; a call
 * in's, its call's, or the lead last called on that number.
 */
create or replace function public.phone_call_event(
  p_sid text, p_parent text, p_user bigint, p_direction text, p_number text, p_status text, p_duration integer,
  p_lead bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ended  boolean := p_status in ('completed', 'busy', 'no-answer', 'failed', 'canceled');
  v_talk   integer := case when p_status = 'completed' then greatest(coalesce(p_duration, 0), 0) else 0 end;
  v_lead   bigint := (select id from public.leads where id = p_lead);
begin
  if v_lead is null and p_direction = 'in' then
    v_lead := coalesce(
      (select lead_id from public.phone_calls where call_sid = p_parent and lead_id is not null),
      (select lead_id from public.phone_calls
        where direction = 'out' and number = p_number and lead_id is not null
        order by started_at desc limit 1));
  end if;

  insert into public.phone_calls as c (call_sid, parent_sid, user_id, direction, number, status, rang_at, answered_at, ended_at, talk_seconds, lead_id)
  values (
    p_sid, p_parent, p_user, p_direction, p_number, p_status,
    case when p_status in ('ringing', 'in-progress', 'completed') then now() end,
    case when p_status = 'in-progress' then now() when p_status = 'completed' then now() - make_interval(secs => v_talk) end,
    case when v_ended then now() end,
    v_talk,
    v_lead
  )
  on conflict (call_sid) do update set
    parent_sid   = coalesce(c.parent_sid, excluded.parent_sid),
    user_id      = coalesce(c.user_id, excluded.user_id),
    number       = coalesce(c.number, excluded.number),
    status       = case when c.ended_at is null then excluded.status else c.status end,
    rang_at      = coalesce(c.rang_at, excluded.rang_at),
    answered_at  = coalesce(c.answered_at, excluded.answered_at),
    ended_at     = coalesce(c.ended_at, excluded.ended_at),
    talk_seconds = case when c.ended_at is null then excluded.talk_seconds else c.talk_seconds end,
    lead_id      = coalesce(c.lead_id, excluded.lead_id);
end $$;

revoke execute on function public.phone_call_event(text, text, bigint, text, text, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.phone_call_event(text, text, bigint, text, text, text, integer, bigint) to service_role;

-- Calls before: a call out on the lead its caller started a call on, that minute or the one either side,
-- whose numbers have the one dialed (the nearest, when there are more).
update public.phone_calls c set lead_id = (
    select a.lead_id
      from public.work_activity a
      join public.leads l on l.id = a.lead_id
     where a.kind = 'call' and a.user_id = c.user_id
       and a.minute between date_trunc('minute', c.started_at) - interval '2 minutes' and date_trunc('minute', c.started_at) + interval '1 minute'
       and l.search_text ilike '%' || right(regexp_replace(c.number, '\D', '', 'g'), 10) || '%'
     order by abs(extract(epoch from (a.minute - date_trunc('minute', c.started_at)))), a.lead_id desc
     limit 1)
 where c.lead_id is null and c.direction = 'out' and c.user_id is not null
   and length(regexp_replace(coalesce(c.number, ''), '\D', '', 'g')) >= 10;

-- …a call in, on the lead last called on its number before it; its legs, as the call.
update public.phone_calls c set lead_id = (
    select o.lead_id from public.phone_calls o
     where o.direction = 'out' and o.number = c.number and o.lead_id is not null and o.started_at < c.started_at
     order by o.started_at desc limit 1)
 where c.lead_id is null and c.direction = 'in' and c.call_sid = c.parent_sid;
update public.phone_calls c set lead_id = p.lead_id
  from public.phone_calls p
 where c.lead_id is null and c.direction = 'in' and c.call_sid <> c.parent_sid
   and p.call_sid = c.parent_sid and p.lead_id is not null;

-- A recording on the lead its call is on (it was the first lead with the number).
update public.phone_recordings r set lead_id = c.lead_id
  from public.phone_calls c
 where (c.call_sid = r.call_sid or c.parent_sid = r.call_sid) and c.lead_id is not null
   and c.direction = 'out' and r.lead_id is distinct from c.lead_id;
update public.phone_recordings r set lead_id = c.lead_id
  from public.phone_calls c
 where c.call_sid = r.call_sid and c.direction = 'in' and c.lead_id is not null and r.lead_id is distinct from c.lead_id;

notify pgrst, 'reload schema';
