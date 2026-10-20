-- Drivers and XMOD on the Business tab, and filtering by employees and XMOD
-- (Sean, Oct 2026):
--
--   drivers             how many drivers run the autos, a whole number (the
--                       Autos section, before Travel radius)
--   xmod                the business's experience MOD on work comp, as
--                       written: .85, 1.50. Over 1 it pays more for work comp.
--
--   employee_count()    a lead's employees (text, as lists write it: "1,200")
--                       as a number, or null for none
--   employees_in()      employees against a range ({ min, max, exclude })
--   call_list_xmod()    XMOD over or under 1 ({ side: "over" | "under" })
--   call_list_matches() as before, with criteria "employees" and "xmod"
--   call_list_options() as before, with how many names have an XMOD over 1
--                       and under it, and the fewest and most employees
--   lead_explore()      as before, with criteria emp_min, emp_max and
--                       emp_not ("1": not in the range)
--
-- call_list_options() and lead_explore() are as the local database had them
-- (20261115100000, 20261113100000), with only these changes.

alter table public.leads
  add column if not exists drivers integer check (drivers between 0 and 100000),
  add column if not exists xmod numeric(4, 2) check (xmod > 0 and xmod < 10);

comment on column public.leads.drivers is 'How many drivers run the business''s autos.';
comment on column public.leads.xmod is 'The experience MOD on work comp (.85, 1.50): over 1 pays more than the rate.';

/** A lead's employees as a number ("1,200" is 1200); null for none or anything that is not a count. */
create or replace function public.employee_count(v text)
returns int
language sql immutable parallel safe set search_path = public as $$
  select case when regexp_replace(coalesce(v, ''), '[\s,]', '', 'g') ~ '^\d{1,7}$'
              then regexp_replace(v, '[\s,]', '', 'g')::int end;
$$;

/**
 * Employees against a range ({ min, max, exclude }, either end left open):
 * with neither end, anything; included, a count in the range; excluded,
 * not in it (a name with no count stays, as with the other criteria).
 */
create or replace function public.employees_in(c jsonb, v text)
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select c is null
      or (coalesce(c ->> 'min', '') !~ '^\d{1,7}$' and coalesce(c ->> 'max', '') !~ '^\d{1,7}$')
      or (coalesce(public.employee_count(v)
                     between case when c ->> 'min' ~ '^\d{1,7}$' then (c ->> 'min')::int else 0 end
                         and case when c ->> 'max' ~ '^\d{1,7}$' then (c ->> 'max')::int else 2147483647 end,
                   false)
          <> coalesce((c ->> 'exclude')::boolean, false));
$$;

/** XMOD over 1 or under it ({ side }); a name with no XMOD is neither. */
create or replace function public.call_list_xmod(c jsonb, v numeric)
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select c is null or coalesce(c ->> 'side', '') not in ('over', 'under')
      or coalesce(case c ->> 'side' when 'over' then v > 1 else v < 1 end, false);
$$;

/** A name's values for each criterion, as call_list_criterion() compares them. */
create or replace function public.call_list_matches(l public.leads, p_xdates date[], p_carriers text[], c jsonb)
returns boolean
language sql stable set search_path = public as $$
  select c is null or c = '{}'::jsonb or (
        public.call_list_renews_in(c -> 'renewal', p_xdates)
    and public.call_list_criterion(c -> 'city', array[lower(btrim(l.city))])
    and public.call_list_criterion(c -> 'zip', array[left(btrim(l.zip), 5)])
    and public.call_list_criterion(c -> 'county', array[lower(btrim(l.county))])
    and public.call_list_criterion(c -> 'sic', array[btrim(l.sic_code)])
    and public.call_list_criterion(c -> 'carrier', p_carriers)
    and public.call_list_criterion(c -> 'year', array[extract(year from l.promoted_at at time zone public.business_tz())::int::text])
    and public.call_list_criterion(c -> 'developer', array[l.dbdv_user_id::text])
    and public.call_list_criterion(c -> 'result', array[l.result_id::text])
    and public.call_list_criterion(c -> 'source', array[lower(btrim(l.list_source))])
    and public.employees_in(c -> 'employees', l.employees)
    and public.call_list_xmod(c -> 'xmod', l.xmod));
$$;

CREATE OR REPLACE FUNCTION public.call_list_options(p_project_id bigint, p_rep bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_rep bigint := coalesce(p_rep, public.app_user_id());
  v     jsonb;
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  with base as (
    select l.* from public.leads l join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id and l.assigned_user_id = v_rep and r.viable and r.callable
  ), opts as (
    -- Labels as written, a capitalised spelling first ("Phoenix" over "phoenix").
    select 'city' as k, lower(btrim(city)) as value,
           coalesce(min(btrim(city)) filter (where btrim(city) ~ '^[A-Z]'), min(btrim(city))) as label, count(*) as n
      from base where nullif(btrim(city), '') is not null group by 2
    union all
    select 'zip', left(btrim(zip), 5), left(btrim(zip), 5), count(*) from base where nullif(btrim(zip), '') is not null group by 2
    union all
    select 'county', lower(btrim(county)),
           coalesce(min(btrim(county)) filter (where btrim(county) ~ '^[A-Z]'), min(btrim(county))), count(*)
      from base where nullif(btrim(county), '') is not null group by 2
    union all
    select 'sic', btrim(b.sic_code), btrim(b.sic_code) || coalesce(' – ' || min(s.description), ''), count(*)
      from base b left join public.sic_codes s on s.code = btrim(b.sic_code)
     where nullif(btrim(b.sic_code), '') is not null group by 2
    union all
    -- Read in one pass over the names' agencies and policies: one lookup a name (lead_carrier_keys()),
    -- each checking who may see it again, took seconds on a call list of thousands.
    select 'carrier', s.k, min(initcap(s.k)), count(distinct s.id)
      from (select b.id, public.carrier_key(a.name) as k from base b join public.agencies a on a.id = b.agency_id
            union all
            select b.id, public.carrier_key(x)
              from base b join public.insurance_details i on i.lead_id = b.id,
                   unnest(array[i.agency_name, i.pkg_carrier, i.wc_carrier, i.auto_carrier, i.health_carrier, i.dental_provider,
                                i.vision_provider, i.prof_liab_carrier, i.do_carrier, i.eo_carrier, i.homeowner_carrier,
                                i.personal_auto_carrier, i.personal_lines_carrier]) as x) s
     where s.k is not null group by 2
    union all
    select 'year', extract(year from promoted_at at time zone public.business_tz())::int::text,
           extract(year from promoted_at at time zone public.business_tz())::int::text, count(*)
      from base where promoted_at is not null group by 2
    union all
    select 'developer', b.dbdv_user_id::text,
           min(coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email)), count(*)
      from base b join public.users u on u.id = b.dbdv_user_id group by 2
    union all
    select 'result', b.result_id::text, min(r.name), count(*)
      from base b join public.call_results r on r.id = b.result_id group by 2
    union all
    select 'source', lower(btrim(b.list_source)), min(btrim(b.list_source)), count(*)
      from base b where nullif(btrim(b.list_source), '') is not null group by 2
    union all
    -- How many names have an XMOD over 1, and under it.
    select 'xmod', s.side, case s.side when 'over' then 'Over 1.00' else 'Under 1.00' end, count(*)
      from (select case when b.xmod > 1 then 'over' when b.xmod < 1 then 'under' end as side from base b) s
     where s.side is not null group by s.side
    union all
    -- The fewest and most employees on the list, as one item: "3–250".
    select 'employees', min(e.n)::text || '-' || max(e.n)::text, min(e.n)::text || '–' || max(e.n)::text, count(*)
      from (select public.employee_count(b.employees) as n from base b) e
     where e.n is not null having count(*) > 0
  )
  select coalesce(jsonb_object_agg(k, items), '{}'::jsonb) into v
    from (select k, jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by label) as items
            from opts group by k) g;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.lead_explore(criteria jsonb DEFAULT '{}'::jsonb, page integer DEFAULT 1, per_page integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'results',   '[]'::jsonb)))          as results,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select (jsonb_array_elements_text(coalesce(criteria->'projects', '[]'::jsonb)))::bigint) as projects,
      array(select (jsonb_array_elements_text(coalesce(criteria->'groups',   '[]'::jsonb)))::bigint) as groups,
      array(select jsonb_array_elements_text(coalesce(criteria->'carriers',  '[]'::jsonb)))          as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      case when criteria->>'emp_min' ~ '^\d{1,7}$' then (criteria->>'emp_min')::int end           as emp_min,
      case when criteria->>'emp_max' ~ '^\d{1,7}$' then (criteria->>'emp_max')::int end           as emp_max,
      coalesce(criteria->>'emp_not', '') = '1'                                                  as emp_not,
      public.search_patterns(public.search_words(criteria->>'q'))    as pats,
      public.search_lead_pattern(public.search_words(criteria->>'q')) as first_pat
  ),
  carrier_keys as (
    select coalesce(array_agg(distinct k) filter (where k is not null), '{}') as keys
      from (
        select public.carrier_key(v) as k from c, unnest(c.carriers) v where v !~ '^[0-9]+$'
        union all
        select public.carrier_key(a.name) from public.agencies a, c
         where a.id::text = any(array(select v from unnest(c.carriers) v where v ~ '^[0-9]{1,18}$'))
      ) t
  ),
  m as (
    select l.id, l.company_name, l.contact_name, l.contact_title, l.phone, l.contact_mobile, l.email,
           l.decision_maker, l.dm_title, l.dm_phone, l.dm_mobile, l.dm_email,
           l.contact2_name, l.contact2_title, l.contact2_phone, l.contact2_mobile, l.contact2_email, l.producer_name,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name, grp.name as agency_group,
           coalesce(ag.name, nullif(btrim(ins.agency_name), '')) as carrier_name,
           r.id as result_id, r.name as result_name, r.viable as result_viable,
           l.project_id, p.name as project_name,
           -- When it was last called or changed.
           greatest(l.date_last_worked, l.updated_at) as last_worked,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
      cross join carrier_keys ck
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies grp on grp.id = co.agency_group_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.call_results r on r.id = l.result_id
      left join public.users u      on u.id  = l.assigned_user_id
     -- Leads that have been promoted to an appointment project: a name still being developed is not one yet,
     -- whatever renewal dates it carries.
     where l.stage = 'appt'
       and (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.results)  = 0 or coalesce(r.name, 'Not called yet') = any(c.results))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
       and (cardinality(c.projects) = 0 or l.project_id       = any(c.projects))
       and (cardinality(c.groups)   = 0 or co.agency_group_id = any(c.groups))
       and (cardinality(c.carriers) = 0 or public.carrier_key(coalesce(ag.name, ins.agency_name)) = any(ck.keys))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       -- Employees (the total) in a range, or not in it; a lead with no count is in no range.
       and public.employees_in(jsonb_build_object('min', c.emp_min, 'max', c.emp_max, 'exclude', c.emp_not), l.employees)
       and (cardinality(c.months)   = 0 or extract(month from coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate,
              ins.health_xdate, ins.dental_xdate, ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)))::int = any(c.months))
       -- The longest word first, which the trigram index can answer; then every word.
       and (cardinality(c.pats)     = 0 or (l.search_text like c.first_pat and l.search_text like all (c.pats)))
  ),
  win as (
    select * from m
     order by lead_date desc nulls last, id desc
     limit greatest(least(coalesce(per_page, 10), 10000), 1)
    offset least(greatest(coalesce(page, 1) - 1, 0)::bigint * greatest(least(coalesce(per_page, 10), 10000), 1), 1000000000)
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win)), '[]'::jsonb) from win),
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from renewal_date)::int as mon, count(*) as n
                            from m where renewal_date is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_result', (select coalesce(jsonb_agg(jsonb_build_object('label', t.label, 'count', t.n)
                                            order by t.n desc, t.label), '[]'::jsonb)
                    from (select coalesce(result_name, 'Not called yet') as label, count(*) as n from m group by 1) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where renewal_date is not null),
    -- Still to call for an appointment: a call result that leaves the lead viable (none yet counts).
    'viable',          (select count(*) from m where coalesce(result_viable, true))
  );
$function$;

notify pgrst, 'reload schema';
