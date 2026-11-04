-- Call Activity (Nov 2026): the calls made and taken on the phone's Twilio line, by person, as the
-- Streams call report had them, on the administrators' and account managers' dashboards as the day goes.
--
--   phone_calls            one row per person per call: Twilio says how each leg went
--                          (app/api/twilio/voice?step=status) as it rings, is answered and ends
--   phone_call_event()     what the server writes them with (the server's own key)
--   phone_call_report()    each person's calls over some days, for the dashboard's card
--
-- A call out is the leg to the number dialed; a call in, one leg for each browser it rang (the first to
-- answer takes it), and one row for the call in itself, with no one's name, its call_sid its parent_sid:
-- counted missed by no one in particular when it rang nobody (no one had the phone open).
--
-- Safe to run more than once.

create table if not exists public.phone_calls (
  id            bigint generated always as identity primary key,
  call_sid      text not null unique,
  parent_sid    text,
  user_id       bigint references public.users(id) on delete set null,
  direction     text not null check (direction in ('out', 'in')),
  number        text,
  status        text not null,
  started_at    timestamptz not null default now(),
  rang_at       timestamptz,
  answered_at   timestamptz,
  ended_at      timestamptz,
  talk_seconds  integer not null default 0 check (talk_seconds >= 0)
);

create index if not exists phone_calls_started_idx on public.phone_calls (started_at);
create index if not exists phone_calls_user_idx on public.phone_calls (user_id, started_at);
create index if not exists phone_calls_parent_idx on public.phone_calls (parent_sid);

alter table public.phone_calls enable row level security;
revoke all on public.phone_calls from anon, authenticated;
grant select on public.phone_calls to service_role;

/**
 * A leg's news from Twilio: its status (initiated, ringing, in-progress, then completed, busy,
 * no-answer, failed or canceled) and, once completed, how long it was answered for. The news can
 * come in any order, more than once: a leg that has ended stays as it ended.
 */
create or replace function public.phone_call_event(
  p_sid text, p_parent text, p_user bigint, p_direction text, p_number text, p_status text, p_duration integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ended  boolean := p_status in ('completed', 'busy', 'no-answer', 'failed', 'canceled');
  v_talk   integer := case when p_status = 'completed' then greatest(coalesce(p_duration, 0), 0) else 0 end;
begin
  insert into public.phone_calls as c (call_sid, parent_sid, user_id, direction, number, status, rang_at, answered_at, ended_at, talk_seconds)
  values (
    p_sid, p_parent, p_user, p_direction, p_number, p_status,
    case when p_status in ('ringing', 'in-progress', 'completed') then now() end,
    case when p_status = 'in-progress' then now() when p_status = 'completed' then now() - make_interval(secs => v_talk) end,
    case when v_ended then now() end,
    v_talk
  )
  on conflict (call_sid) do update set
    parent_sid   = coalesce(c.parent_sid, excluded.parent_sid),
    user_id      = coalesce(c.user_id, excluded.user_id),
    number       = coalesce(c.number, excluded.number),
    status       = case when c.ended_at is null then excluded.status else c.status end,
    rang_at      = coalesce(c.rang_at, excluded.rang_at),
    answered_at  = coalesce(c.answered_at, excluded.answered_at),
    ended_at     = coalesce(c.ended_at, excluded.ended_at),
    talk_seconds = case when c.ended_at is null then excluded.talk_seconds else c.talk_seconds end;
end $$;

revoke execute on function public.phone_call_event(text, text, bigint, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.phone_call_event(text, text, bigint, text, text, text, integer) to service_role;

/**
 * Each person's calls over the business's days p_from..p_to, as the Streams report counts them:
 *   out_handled    calls out answered            out_cancelled  calls out not answered (busy, no answer, hung up first)
 *   in_handled     calls in they answered        missed         calls in that rang them and nobody answered
 *   talk_seconds   time on calls answered        on_call        on an answered call now
 * total is the four together. Every active account manager, with calls or not, and anyone else with
 * calls; then, with no one's name, the calls in that rang nobody at all. Administrators and managers.
 */
create or replace function public.phone_call_report(p_from date, p_to date)
returns table (
  user_id bigint, first_name text, last_name text, role text,
  total bigint, out_handled bigint, out_cancelled bigint, in_handled bigint, missed bigint,
  talk_seconds bigint, on_call boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.business_tz();
begin
  if not (public.is_manager() and public.mfa_satisfied()) then
    raise exception 'Only administrators and account managers see call activity' using errcode = '42501';
  end if;
  return query
  with c as (
    select pc.user_id, pc.call_sid, pc.parent_sid, pc.talk_seconds, pc.answered_at, pc.ended_at, pc.started_at,
           case
             when pc.direction = 'out' then
               case when pc.answered_at is not null then 'out_handled' when pc.ended_at is not null then 'out_cancelled' end
             -- The call in itself (no one's): missed by no one in particular when it ended having rung nobody.
             when pc.user_id is null then
               case when pc.call_sid = pc.parent_sid and pc.ended_at is not null
                     and not exists (select 1 from public.phone_calls s where s.parent_sid = pc.call_sid and s.call_sid <> pc.call_sid and s.rang_at is not null)
                 then 'missed' end
             when pc.answered_at is not null then 'in_handled'
             -- A person's leg: missed when it rang them and nobody took the call.
             when pc.ended_at is not null and pc.rang_at is not null
                  and not exists (select 1 from public.phone_calls s where s.parent_sid = pc.parent_sid and s.answered_at is not null)
               then 'missed'
           end as kind
      from public.phone_calls pc
     where pc.started_at >= (p_from::timestamp at time zone v_tz)
       and pc.started_at <  ((p_to + 1)::timestamp at time zone v_tz)
  ),
  people as (
    select u.id, u.first_name, u.last_name, u.role
      from public.users u
     where (u.role = 'manager' and u.status = 'active')
        or u.id in (select c.user_id from c where c.kind is not null)
  )
  select p.id, p.first_name, p.last_name, p.role,
         count(c.kind),
         count(*) filter (where c.kind = 'out_handled'),
         count(*) filter (where c.kind = 'out_cancelled'),
         count(*) filter (where c.kind = 'in_handled'),
         count(*) filter (where c.kind = 'missed'),
         coalesce(sum(c.talk_seconds) filter (where c.kind in ('out_handled', 'in_handled')), 0)::bigint,
         coalesce(bool_or(c.answered_at is not null and c.ended_at is null and c.started_at > now() - interval '4 hours'), false)
    from people p
    left join c on c.user_id = p.id
   group by p.id, p.first_name, p.last_name, p.role
  union all
  select null, null, null, null, count(*), 0, 0, 0, count(*), 0, false
    from c
   where c.user_id is null and c.call_sid = c.parent_sid and c.kind = 'missed'
  having count(*) > 0;
end $$;

revoke execute on function public.phone_call_report(date, date) from public, anon;
grant execute on function public.phone_call_report(date, date) to authenticated;
