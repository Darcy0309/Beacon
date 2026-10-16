-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the Account Managers page over days of the administrator's
-- choosing (Sean, Oct 2026)
--
-- What production_report() does not count, by manager and the business's day,
-- from p_from to p_to (both days kept):
--   leads_called    leads at the appointment-setting stage the manager called,
--                   each once
--   appts_invalid   appointments the manager set that were marked invalid
--   leads_invalid   leads the manager developed (DB dev) that were marked
--                   invalid (a Lead-Invalid result, charged back to them)
-- and a row per manager with day null for all the days together, where a lead
-- called on several of them counts once.
--
-- For administrators: it reads with the server's own rights (security
-- definer) after checking, as the per-row access checks would make it slow
-- over thousands of calls.
-- ---------------------------------------------------------------------------

create or replace function public.manager_period_stats(p_from date, p_to date)
returns table (day date, user_id bigint, leads_called bigint, appts_invalid bigint, leads_invalid bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tz    text := public.business_tz();
  v_start timestamptz := (p_from::timestamp at time zone v_tz);
  v_end   timestamptz := ((p_to + 1)::timestamp at time zone v_tz);
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can see the team''s figures' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose up to a year of days' using errcode = '22023';
  end if;
  return query
  with called as (
    select (c.call_date at time zone v_tz)::date as d, c.user_id as u, c.lead_id as lead
      from public.call_records c
     where c.call_date >= v_start and c.call_date < v_end and c.stage = 'appt' and c.user_id is not null
  ),
  bad_appts as (
    select (a.invalid_at at time zone v_tz)::date as d, a.user_id as u
      from public.appointments a
     where a.invalid_at >= v_start and a.invalid_at < v_end and a.user_id is not null and a.deleted_at is null
  ),
  bad_leads as (
    select (c.call_date at time zone v_tz)::date as d, l.dbdv_user_id as u
      from public.call_records c
      join public.call_results r on r.id = c.result_id and r.effect = 'lead_invalid'
      join public.leads l on l.id = c.lead_id
     where c.call_date >= v_start and c.call_date < v_end and l.dbdv_user_id is not null
  )
  select t.d, t.u, sum(t.n_called)::bigint, sum(t.n_appts)::bigint, sum(t.n_leads)::bigint
    from (
      select d, u, count(distinct lead) as n_called, 0::bigint as n_appts, 0::bigint as n_leads from called group by d, u
      union all select d, u, 0, count(*), 0 from bad_appts group by d, u
      union all select d, u, 0, 0, count(*) from bad_leads group by d, u
    ) t
   group by t.d, t.u
  union all
  select null::date, t.u, sum(t.n_called)::bigint, sum(t.n_appts)::bigint, sum(t.n_leads)::bigint
    from (
      select u, count(distinct lead) as n_called, 0::bigint as n_appts, 0::bigint as n_leads from called group by u
      union all select u, 0, count(*), 0 from bad_appts group by u
      union all select u, 0, 0, count(*) from bad_leads group by u
    ) t
   group by t.u;
end $$;

revoke execute on function public.manager_period_stats(date, date) from public, anon;
grant execute on function public.manager_period_stats(date, date) to authenticated;

notify pgrst, 'reload schema';
