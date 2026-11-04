-- The Insurance Companies list and a report a carrier (Sean, Nov 2026):
--
--   carrier_leads(agency)   each lead's carriers: those its policy lines name
--                     (matched by carrier_key()), and its agency_id; one carrier's alone when given
--   carrier_top_clients()   the clients each carrier is a Top Carrier of, on
--                     their projects' Project Info, and the projects that say so
--   carrier_footprint(states)   now: a carrier's states with its leads in each,
--                     its leads, and its clients counted from Top Carriers;
--                     a row for every carrier with leads or listed by a client
--   carrier_clients(agency, states)   a carrier's clients (Top Carriers), each
--                     with its leads (X-dates) naming the carrier and their states
--   carrier_client_leads(agency, client, states)   those leads: the business,
--                     where it is, its project, renewals and carriers, when created
--
-- Administrators only. Safe to run more than once.

create or replace function public.carrier_leads(p_agency bigint default null)
returns table (lead_id bigint, agency_id bigint)
language sql stable security definer set search_path = public set work_mem = '64MB' as $$
  with names as materialized (
    select a.id, public.carrier_key(a.name) as k from public.agencies a
     where a.deleted_at is null and (p_agency is null or a.id = p_agency)
  ), written as (
    select d.lead_id, v.name
      from public.insurance_details d
     cross join lateral (values (d.pkg_carrier), (d.wc_carrier), (d.auto_carrier), (d.health_carrier), (d.dental_provider), (d.vision_provider),
                                (d.prof_liab_carrier), (d.do_carrier), (d.eo_carrier), (d.homeowner_carrier), (d.personal_auto_carrier),
                                (d.personal_lines_carrier)) v(name)
     where v.name is not null
  ), keyed as materialized (
    -- Each name written on the leads matched to its carrier once (a few hundred names, not a key a lead).
    select w.name, n.id from (select name, public.carrier_key(name) as k from (select distinct name from written) x) w join names n on n.k = w.k
  )
  select w.lead_id, k.id from written w join keyed k on k.name = w.name
  union
  select l.id, l.agency_id from public.leads l
   where l.agency_id is not null and l.deleted_at is null and (p_agency is null or l.agency_id = p_agency);
$$;
revoke execute on function public.carrier_leads(bigint) from public, anon, authenticated;

create or replace function public.carrier_top_clients()
returns table (agency_id bigint, company_id bigint, projects text[])
language sql stable security definer set search_path = public as $$
  select a.id, p.company_id, array_agg(distinct p.name order by p.name)
    from public.project_profiles pp
    join public.projects p on p.id = pp.project_id and p.deleted_at is null
    join public.companies co on co.id = p.company_id and co.deleted_at is null
   cross join lateral unnest(pp.top_carriers) t(name)
    join public.agencies a on a.deleted_at is null and public.carrier_key(a.name) = public.carrier_key(t.name)
   group by 1, 2;
$$;
revoke execute on function public.carrier_top_clients() from public, anon, authenticated;

drop function if exists public.carrier_footprint(text[]);
create function public.carrier_footprint(p_states text[] default null)
returns table (agency_id bigint, states text[], by_state jsonb, leads bigint, clients bigint)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
begin
  if not public.is_admin() then
    raise exception 'The carriers'' figures are for administrators' using errcode = '42501';
  end if;
  return query
  with per as (
    select lc.agency_id, nullif(upper(btrim(l.state)), '') as state, count(*) as n
      from public.carrier_leads() lc
      join public.leads l on l.id = lc.lead_id and l.deleted_at is null
     where p_states is null or cardinality(p_states) = 0 or upper(btrim(l.state)) = any(p_states)
     group by 1, 2
  ), f as (
    select per.agency_id,
           coalesce(array_agg(per.state order by per.state) filter (where per.state is not null), '{}') as states,
           coalesce(jsonb_object_agg(per.state, per.n) filter (where per.state is not null), '{}') as by_state,
           sum(per.n)::bigint as leads
      from per group by 1
  ), c as (
    select tc.agency_id, count(*) as clients from public.carrier_top_clients() tc group by 1
  )
  select coalesce(f.agency_id, c.agency_id), coalesce(f.states, '{}'), coalesce(f.by_state, '{}'), coalesce(f.leads, 0), coalesce(c.clients, 0)
    from f full join c on c.agency_id = f.agency_id;
end $$;
revoke execute on function public.carrier_footprint(text[]) from public, anon;
grant execute on function public.carrier_footprint(text[]) to authenticated;

create or replace function public.carrier_clients(p_agency bigint, p_states text[] default null)
returns table (company_id bigint, client text, projects text[], xdates bigint, states text[])
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
begin
  if not public.is_admin() then
    raise exception 'The carriers'' figures are for administrators' using errcode = '42501';
  end if;
  return query
  with mine as (
    select l.id, nullif(upper(btrim(l.state)), '') as state, p.company_id
      from public.carrier_leads(p_agency) lc
      join public.leads l on l.id = lc.lead_id and l.deleted_at is null
      join public.projects p on p.id = l.project_id
     where p_states is null or cardinality(p_states) = 0 or upper(btrim(l.state)) = any(p_states)
  )
  select tc.company_id, co.name, tc.projects, count(distinct m.id),
         coalesce(array_agg(distinct m.state) filter (where m.state is not null), '{}')
    from public.carrier_top_clients() tc
    join public.companies co on co.id = tc.company_id
    left join mine m on m.company_id = tc.company_id
   where tc.agency_id = p_agency
   group by 1, 2, 3
   order by co.name;
end $$;
revoke execute on function public.carrier_clients(bigint, text[]) from public, anon;
grant execute on function public.carrier_clients(bigint, text[]) to authenticated;

create or replace function public.carrier_client_leads(p_agency bigint, p_company bigint, p_states text[] default null)
returns table (lead_id bigint, company text, city text, state text, zip text, phone text, project text,
               ultimate_xdate date, lines jsonb, created date)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_key text := (select public.carrier_key(a.name) from public.agencies a where a.id = p_agency);
begin
  if not public.is_admin() then
    raise exception 'The carriers'' figures are for administrators' using errcode = '42501';
  end if;
  return query
  select l.id, l.company_name, l.city, l.state, l.zip, l.phone, p.name, d.ultimate_xdate,
         -- Each policy line with something on it: its X-date, its carrier, and whether that is this one.
         coalesce((select jsonb_agg(jsonb_build_object('key', v.k, 'xdate', v.x, 'carrier', v.c, 'mine', public.carrier_key(v.c) = v_key) order by v.o)
                     from (values (1, 'pkg', d.pkg_xdate, d.pkg_carrier), (2, 'wc', d.wc_xdate, d.wc_carrier), (3, 'auto', d.auto_xdate, d.auto_carrier),
                                  (4, 'health', d.health_xdate, d.health_carrier), (5, 'personal', d.personal_lines_xdate, d.personal_lines_carrier),
                                  (6, 'prof', d.prof_liab_xdate, d.prof_liab_carrier), (7, 'do', d.do_xdate, d.do_carrier), (8, 'eo', d.eo_xdate, d.eo_carrier),
                                  (9, 'dental', d.dental_xdate, d.dental_provider), (10, 'vision', d.vision_xdate, d.vision_provider),
                                  (11, 'homeowner', d.homeowner_xdate, d.homeowner_carrier), (12, 'personal_auto', d.personal_auto_xdate, d.personal_auto_carrier)) v(o, k, x, c)
                    where v.x is not null or nullif(btrim(v.c), '') is not null), '[]'),
         (coalesce(l.lead_date, l.created_at) at time zone public.business_tz())::date
    from (select distinct lc.lead_id from public.carrier_leads(p_agency) lc) lc
    join public.leads l on l.id = lc.lead_id and l.deleted_at is null
    join public.projects p on p.id = l.project_id and p.company_id = p_company
    left join public.insurance_details d on d.lead_id = l.id
   where p_states is null or cardinality(p_states) = 0 or upper(btrim(l.state)) = any(p_states)
   order by coalesce(d.ultimate_xdate, '9999-12-31'), l.company_name, l.id;
end $$;
revoke execute on function public.carrier_client_leads(bigint, bigint, text[]) from public, anon;
grant execute on function public.carrier_client_leads(bigint, bigint, text[]) to authenticated;
