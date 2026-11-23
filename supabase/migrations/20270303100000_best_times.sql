-- Best Times to Call (Sean and Darcy, Nov 2026): when calls turn into leads and appointments, by day of the week and
-- hour of the day in the business's own local time (9 AM is 9 AM where the business is), from the calls already
-- recorded. Filtered by days, client, project, manager, industry (SIC, a code or its first digits) and state; and
-- broken down by industry, state, project type or manager.
--
--   us_state_tz(state)   a US state's time zone (the one most of it keeps)
--   best_times(...)      calls, leads and appointments by (breakdown,) day (1 Monday … 7 Sunday) and hour.
--
-- A call counts as a lead when its result makes the name one (effect 'promote'), an appointment when it sets one
-- (effect 'appointment'). Where the business is: its lead's state, else its project's time zone, else the
-- business's own. Administrators only. Safe to run more than once.

create or replace function public.us_state_tz(p_state text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select case upper(btrim(coalesce(p_state, '')))
    when 'AZ' then 'America/Phoenix'
    when 'HI' then 'Pacific/Honolulu'
    when 'AK' then 'America/Anchorage'
    when 'PR' then 'America/Puerto_Rico'
    else case
      when upper(btrim(coalesce(p_state, ''))) in ('CA', 'NV', 'OR', 'WA') then 'America/Los_Angeles'
      when upper(btrim(coalesce(p_state, ''))) in ('CO', 'ID', 'MT', 'NM', 'UT', 'WY') then 'America/Denver'
      when upper(btrim(coalesce(p_state, ''))) in ('AL', 'AR', 'IL', 'IA', 'KS', 'LA', 'MN', 'MS', 'MO', 'NE', 'ND', 'OK', 'SD', 'TN', 'TX', 'WI') then 'America/Chicago'
      when upper(btrim(coalesce(p_state, ''))) in ('CT', 'DE', 'DC', 'FL', 'GA', 'IN', 'KY', 'ME', 'MD', 'MA', 'MI', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'VT', 'VA', 'WV') then 'America/New_York'
    end
  end;
$$;
grant execute on function public.us_state_tz(text) to authenticated;

create or replace function public.best_times(
  p_from date, p_to date,
  p_company bigint default null, p_project bigint default null, p_user bigint default null,
  p_sic text default null, p_state text default null, p_by text default null
)
returns table(dim text, dim_label text, dow integer, hour integer, calls bigint, leads bigint, appts bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_tz text := public.business_tz();
begin
  if not public.is_admin() then
    raise exception 'Best Times to Call is for administrators' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose the days' using errcode = '22023';
  end if;
  return query
  with c as (
    select cr.call_date, cr.user_id, l.state, l.sic_code, t.code as type_code, cres.effect,
           coalesce(public.us_state_tz(l.state), z.iana, v_tz) as tz
      from public.call_records cr
      join public.leads l on l.id = cr.lead_id
      join public.projects p on p.id = coalesce(cr.project_id, l.project_id)
      left join public.project_types t on t.id = p.project_type_id
      left join public.timezones z on z.id = p.timezone_id
      left join public.call_results cres on cres.id = cr.result_id
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
       and (p_company is null or p.company_id = p_company)
       and (p_project is null or p.id = p_project)
       and (p_user is null or cr.user_id = p_user)
       and (p_sic is null or replace(coalesce(l.sic_code, ''), '-', '') like replace(p_sic, '-', '') || '%')
       and (p_state is null or upper(l.state) = upper(p_state))
  ), local as (
    select case p_by
             when 'sic' then coalesce(nullif(left(replace(c.sic_code, '-', ''), 4), ''), '—')
             when 'state' then coalesce(nullif(upper(c.state), ''), '—')
             when 'type' then coalesce(c.type_code, '—')
             when 'manager' then coalesce(c.user_id::text, '—')
             else null end as dim,
           extract(isodow from c.call_date at time zone c.tz)::integer as dow,
           extract(hour from c.call_date at time zone c.tz)::integer as hour,
           c.effect
      from c
  )
  select x.dim,
         case p_by
           when 'sic' then (select s.description from public.sic_codes s where s.code = x.dim limit 1)
           when 'manager' then (select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') from public.users u where u.id::text = x.dim)
           when 'type' then case x.dim when 'APPT' then 'Appointment projects' when 'DBDV' then 'DB Dev projects' else x.dim end
           else x.dim end,
         x.dow, x.hour, count(*)::bigint,
         count(*) filter (where x.effect = 'promote')::bigint,
         count(*) filter (where x.effect = 'appointment')::bigint
    from local x
   group by x.dim, x.dow, x.hour
   order by x.dim nulls first, x.dow, x.hour;
end $$;
revoke execute on function public.best_times(date, date, bigint, bigint, bigint, text, text, text) from public, anon;
grant execute on function public.best_times(date, date, bigint, bigint, bigint, text, text, text) to authenticated;

notify pgrst, 'reload schema';
