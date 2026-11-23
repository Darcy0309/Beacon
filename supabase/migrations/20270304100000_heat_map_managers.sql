-- Best Times to Call is now the Production Heat Map (Sean, Nov 2026: "Can we name it Production Heat Map? … great for
-- Managers to have too (for the projects they are assigned to)"). best_times() as before for an administrator; a
-- manager gets the calls on the projects they're assigned to, every manager's calls on them. Safe to run more than once.

create or replace function public.best_times(
  p_from date, p_to date,
  p_company bigint default null, p_project bigint default null, p_user bigint default null,
  p_sic text default null, p_state text default null, p_by text default null
)
returns table(dim text, dim_label text, dow integer, hour integer, calls bigint, leads bigint, appts bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_tz text := public.business_tz();
  -- A manager: the projects they're assigned to (an administrator: every project).
  v_mine bigint := case when public.is_admin() then null else public.app_user_id() end;
begin
  if not public.is_admin() and coalesce(public.app_role(), '') <> 'manager' then
    raise exception 'The Production Heat Map is for administrators and managers' using errcode = '42501';
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
       and (v_mine is null or p.id in (select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_mine))
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

notify pgrst, 'reload schema';
