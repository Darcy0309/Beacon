-- Call Activity on each manager's own clock (Sean, Nov 2026): the time zone on a user's account is now
-- a real clock. Each person's first call, and their line on the chart, read in their time zone; the
-- whole team's chart stays on the business's clock. Mountain is split in two: Arizona keeps standard
-- time all year, Utah and Montana move their clocks.
--
-- Safe to run more than once.

alter table public.timezones add column if not exists iana text;
comment on column public.timezones.iana is 'The clock (IANA name, e.g. America/Chicago); null: the business''s.';

update public.timezones set iana = case
    when upper(btrim(name)) in ('EST', 'EDT', 'ET', 'EASTERN')  then 'America/New_York'
    when upper(btrim(name)) in ('CST', 'CDT', 'CT', 'CENTRAL')  then 'America/Chicago'
    when upper(btrim(name)) in ('MST', 'MOUNTAIN')              then 'America/Phoenix'
    when upper(btrim(name)) in ('MDT', 'MT')                    then 'America/Denver'
    when upper(btrim(name)) in ('PST', 'PDT', 'PT', 'PACIFIC')  then 'America/Los_Angeles'
    when upper(btrim(name)) in ('AKST', 'AKDT', 'ALASKA')       then 'America/Anchorage'
    when upper(btrim(name)) in ('HST', 'HAWAII')                then 'Pacific/Honolulu'
  end
 where iana is null;

-- MST is Arizona's (no daylight saving); Mountain with daylight saving is its own.
update public.timezones set name = 'MST (Arizona)'
 where upper(btrim(name)) = 'MST' and not exists (select 1 from public.timezones where name = 'MST (Arizona)');
insert into public.timezones (name, iana)
select 'MT (Utah, Montana)', 'America/Denver'
 where not exists (select 1 from public.timezones where name = 'MT (Utah, Montana)');

/** The person's clock: their account's time zone, else the business's. */
create or replace function public.user_tz(p_user bigint)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select public.known_tz(z.iana) from public.users u join public.timezones z on z.id = u.timezone_id where u.id = p_user),
                  public.business_tz())
$$;
revoke execute on function public.user_tz(bigint) from public, anon;
grant execute on function public.user_tz(bigint) to authenticated;

drop function if exists public.phone_call_report(date, date);
drop function if exists public.phone_call_report(date, date, text, bigint);

create function public.phone_call_report(p_from date, p_to date, p_scope text default 'all', p_user bigint default null)
returns table (
  user_id bigint, first_name text, last_name text, role text,
  total bigint, out_handled bigint, out_cancelled bigint, in_handled bigint, missed bigint,
  talk_seconds bigint, on_call boolean, first_call timestamptz, time_zone text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz    text    := public.business_tz();
  v_admin boolean := public.is_admin();
  v_scope text    := coalesce(nullif(p_scope, ''), 'all');
  v_user  bigint  := p_user;
begin
  if not (public.is_manager() and public.mfa_satisfied()) then
    raise exception 'Only administrators and account managers see call activity' using errcode = '42501';
  end if;
  if v_scope not in ('all', 'team', 'me') then v_scope := 'all'; end if;
  if not v_admin then
    if v_scope = 'all' then v_scope := 'team'; end if;
    v_user := public.app_user_id();
  end if;
  if v_scope = 'me' and v_user is null then v_user := public.app_user_id(); end if;

  return query
  with c as (
    select pc.user_id, pc.call_sid, pc.parent_sid, pc.direction, pc.talk_seconds, pc.answered_at, pc.ended_at, pc.started_at,
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
  reps as (
    select distinct co.sales_rep_id as id from public.companies co
     where co.sales_rep_id is not null and co.deleted_at is null
  ),
  people as (
    select u.id, u.first_name, u.last_name, u.role
      from public.users u
     where case v_scope
             when 'me' then u.id = v_user
             when 'team' then u.role = 'manager' and u.status = 'active' and u.deleted_at is null
                              and u.id not in (select r.id from reps r)
             else (u.role = 'manager' and u.status = 'active') or u.id in (select c.user_id from c where c.kind is not null)
           end
  )
  select p.id, p.first_name, p.last_name, p.role,
         count(c.kind),
         count(*) filter (where c.kind = 'out_handled'),
         count(*) filter (where c.kind = 'out_cancelled'),
         count(*) filter (where c.kind = 'in_handled'),
         count(*) filter (where c.kind = 'missed'),
         coalesce(sum(c.talk_seconds) filter (where c.kind in ('out_handled', 'in_handled')), 0)::bigint,
         coalesce(bool_or(c.answered_at is not null and c.ended_at is null and c.started_at > now() - interval '4 hours'), false),
         min(c.started_at) filter (where c.direction = 'out'),
         (select public.known_tz(z.iana) from public.users u join public.timezones z on z.id = u.timezone_id where u.id = p.id)
    from people p
    left join c on c.user_id = p.id
   group by p.id, p.first_name, p.last_name, p.role
  union all
  -- Calls in that rang no one: on everyone's view only.
  select null, null, null, null, count(*), 0, 0, 0, count(*), 0, false, null, null
    from c
   where v_scope = 'all' and c.user_id is null and c.call_sid = c.parent_sid and c.kind = 'missed'
  having count(*) > 0;
end $$;

revoke execute on function public.phone_call_report(date, date, text, bigint) from public, anon;
grant execute on function public.phone_call_report(date, date, text, bigint) to authenticated;

-- phone_call_times: each half hour on the business's clock (slot) and on the person's own (local_slot).
drop function if exists public.phone_call_times(date, text, bigint);

create function public.phone_call_times(p_day date, p_scope text default 'all', p_user bigint default null)
returns table (user_id bigint, slot int, local_slot int, calls bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz    text    := public.business_tz();
  v_admin boolean := public.is_admin();
  v_scope text    := coalesce(nullif(p_scope, ''), 'all');
  v_user  bigint  := p_user;
begin
  if not (public.is_manager() and public.mfa_satisfied()) then
    raise exception 'Only administrators and account managers see call activity' using errcode = '42501';
  end if;
  if v_scope not in ('all', 'team', 'me') then v_scope := 'all'; end if;
  if not v_admin then
    if v_scope = 'all' then v_scope := 'team'; end if;
    v_user := public.app_user_id();
  end if;
  if v_scope = 'me' and v_user is null then v_user := public.app_user_id(); end if;

  return query
  with c as (
    select pc.user_id, pc.started_at,
           case
             when pc.direction = 'out' then
               case when pc.answered_at is not null then 'out_handled' when pc.ended_at is not null then 'out_cancelled' end
             when pc.user_id is null then null
             when pc.answered_at is not null then 'in_handled'
             when pc.ended_at is not null and pc.rang_at is not null
                  and not exists (select 1 from public.phone_calls s where s.parent_sid = pc.parent_sid and s.answered_at is not null)
               then 'missed'
           end as kind
      from public.phone_calls pc
     where pc.user_id is not null
       and pc.started_at >= (p_day::timestamp at time zone v_tz)
       and pc.started_at <  ((p_day + 1)::timestamp at time zone v_tz)
  ),
  reps as (
    select distinct co.sales_rep_id as id from public.companies co
     where co.sales_rep_id is not null and co.deleted_at is null
  ),
  people as (
    select u.id from public.users u
     where case v_scope
             when 'me' then u.id = v_user
             when 'team' then u.role = 'manager' and u.status = 'active' and u.deleted_at is null
                              and u.id not in (select r.id from reps r)
             else true
           end
  )
  select c.user_id,
         (floor(extract(epoch from ((c.started_at at time zone v_tz) - p_day::timestamp)) / 1800) * 30)::int,
         (floor(extract(epoch from ((c.started_at at time zone public.user_tz(c.user_id))::time)) / 1800) * 30)::int,
         count(*)
    from c
    join people p on p.id = c.user_id
   where c.kind is not null
   group by 1, 2, 3
   order by 2, 1;
end $$;

revoke execute on function public.phone_call_times(date, text, bigint) from public, anon;
grant execute on function public.phone_call_times(date, text, bigint) to authenticated;
