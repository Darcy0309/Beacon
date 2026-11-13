-- Call Activity's chart (Sean, Nov 2026): a day's calls on the Lighthouse phone by the half hour, for
-- everyone on the card or one manager, to see where a day's calls stopped and started again. The calls
-- and the people are counted as phone_call_report() counts them (its 'all', 'team' and 'me').
--
-- Safe to run more than once.

drop function if exists public.phone_call_times(date, text, bigint);

/** p_day's calls by person and half hour: slot (minutes past midnight, business time, 0, 30, 60…) and how many. */
create function public.phone_call_times(p_day date, p_scope text default 'all', p_user bigint default null)
returns table (user_id bigint, slot int, calls bigint)
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
         count(*)
    from c
    join people p on p.id = c.user_id
   where c.kind is not null
   group by 1, 2
   order by 2, 1;
end $$;

revoke execute on function public.phone_call_times(date, text, bigint) from public, anon;
grant execute on function public.phone_call_times(date, text, bigint) to authenticated;
