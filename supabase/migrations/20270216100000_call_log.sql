-- Call Log (Sean, Nov 2026): "drill down by manager to show all of their outbound & inbound calls for the
-- selected date/range … a full listing of all the calls", and "look up a phone # that called in or was
-- dialed out … a prospect can call in from their cell and it's not noted in the database on a lead".
--
--   phone_call_log()   the calls Call Activity counts (phone_call_report()), one row each, newest first:
--                      by person, by kind, by number (any part of it, three digits or more), over days or
--                      all time; with the lead it is on (or, where it is on none, a lead with that number),
--                      and its recording for whoever may play it. Each kind's count over the filters.
--
-- Administrators see everyone's; an account manager their own. Safe to run more than once.

create index if not exists phone_recordings_call_idx on public.phone_recordings (call_sid);
create index if not exists phone_calls_number_trgm on public.phone_calls using gin (number extensions.gin_trgm_ops);

drop function if exists public.phone_call_log(date, date, bigint, text, text, integer, integer);

/**
 * p_from, p_to  the business's days (either null: no bound)
 * p_user        whose calls: null everyone's; 0 the calls in that rang no one (a manager: always their own)
 * p_kind        null all; 'out' or 'in'; or one of Call Activity's: out_handled, out_cancelled, in_handled, missed
 * p_number      digits of the number called or calling, in any form (fewer than three: not a filter)
 * Each row carries the counts of every kind over the same filters (n_*), and n_all; `total` the rows p_kind leaves.
 */
create function public.phone_call_log(
  p_from date default null, p_to date default null, p_user bigint default null, p_kind text default null,
  p_number text default null, p_limit integer default 100, p_offset integer default 0
)
returns table (
  call_sid text, user_id bigint, first_name text, last_name text, direction text, kind text, number text,
  started_at timestamptz, answered_at timestamptz, ended_at timestamptz, talk_seconds integer,
  lead_id bigint, lead_company text, lead_by_number boolean, recording_sid text, recording_seconds integer,
  total bigint, n_all bigint, n_out_handled bigint, n_out_cancelled bigint, n_in_handled bigint, n_missed bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tz     text    := public.business_tz();
  v_admin  boolean := public.is_admin();
  v_me     bigint  := public.app_user_id();
  v_user   bigint  := p_user;
  v_t0     timestamptz := case when p_from is not null then p_from::timestamp at time zone public.business_tz() end;
  v_t1     timestamptz := case when p_to is not null then (p_to + 1)::timestamp at time zone public.business_tz() end;
  v_digits text    := regexp_replace(coalesce(p_number, ''), '\D', '', 'g');
  v_kind   text    := nullif(p_kind, '');
begin
  if not (public.is_manager() and public.mfa_satisfied()) then
    raise exception 'Only administrators and account managers see the call log' using errcode = '42501';
  end if;
  if not v_admin then v_user := v_me; end if;
  if length(v_digits) = 11 and v_digits like '1%' then v_digits := substr(v_digits, 2); end if;
  if length(v_digits) < 3 then v_digits := null; end if;
  if v_kind is not null and v_kind not in ('out', 'in', 'out_handled', 'out_cancelled', 'in_handled', 'missed') then v_kind := null; end if;

  return query
  with c as (
    select pc.*,
           case
             when pc.direction = 'out' then
               case when pc.answered_at is not null then 'out_handled' when pc.ended_at is not null then 'out_cancelled' end
             when pc.user_id is null then
               case when pc.call_sid = pc.parent_sid and pc.ended_at is not null
                     and not exists (select 1 from public.phone_calls s where s.parent_sid = pc.call_sid and s.call_sid <> pc.call_sid and s.rang_at is not null)
                 then 'missed' end
             when pc.answered_at is not null then 'in_handled'
             when pc.ended_at is not null and pc.rang_at is not null
                  and not exists (select 1 from public.phone_calls s where s.parent_sid = pc.parent_sid and s.answered_at is not null)
               then 'missed'
           end as k
      from public.phone_calls pc
     where (v_t0 is null or pc.started_at >= v_t0)
       and (v_t1 is null or pc.started_at < v_t1)
       and (v_digits is null or pc.number like '%' || v_digits || '%')
       and case when v_user is null then true when v_user = 0 then pc.user_id is null and pc.call_sid = pc.parent_sid else pc.user_id = v_user end
  ), counted as (
    select c.*,
           count(*) over () as n_all,
           count(*) filter (where c.k = 'out_handled') over () as n_oh,
           count(*) filter (where c.k = 'out_cancelled') over () as n_oc,
           count(*) filter (where c.k = 'in_handled') over () as n_ih,
           count(*) filter (where c.k = 'missed') over () as n_m
      from c
     where c.k is not null
  ), picked as (
    select x.*, count(*) over () as total
      from counted x
     where v_kind is null or x.k = v_kind or (v_kind = 'out' and x.direction = 'out') or (v_kind = 'in' and x.direction = 'in')
     order by x.started_at desc, x.id desc
     limit greatest(least(coalesce(p_limit, 100), 500), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select p.call_sid, p.user_id, u.first_name, u.last_name, p.direction, p.k, p.number,
         p.started_at, p.answered_at, p.ended_at, p.talk_seconds,
         coalesce(p.lead_id, m.id), coalesce(l.company_name, m.company_name), p.lead_id is null and m.id is not null,
         case when v_admin or r.user_id = v_me then r.recording_sid end, r.seconds,
         p.total, p.n_all, p.n_oh, p.n_oc, p.n_ih, p.n_m
    from picked p
    left join public.users u on u.id = p.user_id
    left join public.leads l on l.id = p.lead_id
    -- On no lead: one with that number, so a call from a number not yet tied to it can be traced.
    left join lateral (
      select ld.id, ld.company_name from public.leads ld
       where p.lead_id is null and ld.deleted_at is null
         and length(regexp_replace(coalesce(p.number, ''), '\D', '', 'g')) >= 10
         and ld.search_text ilike '%' || right(regexp_replace(p.number, '\D', '', 'g'), 10) || '%'
       order by ld.updated_at desc nulls last
       limit 1
    ) m on true
    -- A call out's recording is on the phone's own leg (its parent); a call taken, on the leg that took it.
    left join lateral (
      select rr.recording_sid, rr.seconds, rr.user_id from public.phone_recordings rr
       where rr.call_sid = case when p.direction = 'out' then p.parent_sid else p.call_sid end
       order by rr.created_at
       limit 1
    ) r on true
   order by p.started_at desc, p.id desc;
end $$;

revoke execute on function public.phone_call_log(date, date, bigint, text, text, integer, integer) from public, anon;
grant execute on function public.phone_call_log(date, date, bigint, text, text, integer, integer) to authenticated;
