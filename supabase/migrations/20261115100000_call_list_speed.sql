-- The call list, fast on a list of thousands (Oct 2026). A manager holding
-- ~3,400 names timed out opening a project (statement timeout): the list's
-- filter choices read each name's carriers one name at a time
-- (lead_carrier_keys()), and with a filter saved for the day the list read
-- each name's X-dates and carriers the same way, every lookup checking again
-- who may see the name. Seconds each, past the limit under load.
--
--   call_list_options   carriers read in one pass over the names' agencies
--                       and policies
--   call_list           renewal dates, X-dates and carriers read in one pass;
--                       the X-date that matched a renewal filter only for the
--                       names on the page. Same names, order, counts and
--                       filters as before.
--
-- Both are as the local database had them (20261028100000), with only these
-- changes.

CREATE OR REPLACE FUNCTION public.call_list(p_project_id bigint, p_rep bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_filtered boolean DEFAULT true)
 RETURNS TABLE(id bigint, company_name text, contact_name text, phone text, city text, state text, result text, call_weight integer, sort_last boolean, date_last_worked timestamp with time zone, renewal_date date, total bigint, renewal_match jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_rep     bigint := coalesce(p_rep, public.app_user_id());
  v_words   text[] := public.search_words(p_search);
  v_pats    text[] := public.search_patterns(v_words);
  v_first   text   := public.search_lead_pattern(v_words);
  v_c       jsonb;
  v_renew   boolean;
  v_carrier boolean;
  v_line    text;
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  if coalesce(p_filtered, true) then
    -- Today's only: each morning the list starts again in full.
    select f.criteria into v_c from public.call_list_filters f
     where f.user_id = public.app_user_id() and f.project_id = p_project_id
       and (f.updated_at at time zone public.business_tz())::date = (now() at time zone public.business_tz())::date;
  end if;
  v_renew   := coalesce(v_c ? 'renewal', false);
  v_carrier := coalesce(v_c ? 'carrier', false);
  v_line    := nullif(v_c -> 'renewal' ->> 'line', '');
  -- Each name's renewal date, X-dates and carriers read in one pass over the policies (a lookup a name,
  -- each checking who may see it again, took seconds on a list of thousands); the matching X-date only
  -- for the names on the page.
  return query
    with mine as (
      select l as lr, r.name as r_name, r.sort_last as r_sort_last
        from public.leads l
        join public.call_results r on r.id = l.result_id
       where l.project_id = p_project_id
         and l.assigned_user_id = v_rep
         and r.viable and r.callable
         and (v_first is null or (l.search_text like v_first and l.search_text like all (v_pats)))
    ), ins as (
      select i.lead_id,
             min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                  i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
        from public.insurance_details i
       where i.lead_id in (select (m.lr).id from mine m)
       group by i.lead_id
    ), xd as (
      select i.lead_id, array_agg(v.d) as xdates
        from public.insurance_details i,
             lateral (values ('ultimate', i.ultimate_xdate), ('pkg', i.pkg_xdate), ('wc', i.wc_xdate), ('auto', i.auto_xdate),
                             ('health', i.health_xdate), ('personal', i.personal_lines_xdate), ('dental', i.dental_xdate),
                             ('vision', i.vision_xdate), ('prof', i.prof_liab_xdate), ('do', i.do_xdate), ('eo', i.eo_xdate)) as v(line, d)
       where v_renew and i.lead_id in (select (m.lr).id from mine m)
         and v.d is not null and (v_line is null or v.line = v_line)
       group by i.lead_id
    ), ck as (
      select s.lead_id, array_agg(distinct s.k) as keys
        from (select (m.lr).id as lead_id, public.carrier_key(a.name) as k
                from mine m join public.agencies a on a.id = (m.lr).agency_id
               where v_carrier
              union all
              select i.lead_id, public.carrier_key(x)
                from public.insurance_details i,
                     unnest(array[i.agency_name, i.pkg_carrier, i.wc_carrier, i.auto_carrier, i.health_carrier, i.dental_provider,
                                  i.vision_provider, i.prof_liab_carrier, i.do_carrier, i.eo_carrier, i.homeowner_carrier,
                                  i.personal_auto_carrier, i.personal_lines_carrier]) as x
               where v_carrier and i.lead_id in (select (m.lr).id from mine m)) s
       where s.k is not null
       group by s.lead_id
    ), q as (
      select (m.lr).id as q_id, (m.lr).company_name as q_company, (m.lr).contact_name as q_contact, (m.lr).phone as q_phone,
             (m.lr).city as q_city, (m.lr).state as q_state, m.r_name as q_result, (m.lr).call_weight as q_weight,
             m.r_sort_last as q_sort_last, (m.lr).date_last_worked as q_worked, ins.renewal as q_renewal,
             count(*) over () as q_total
        from mine m
        left join ins on ins.lead_id = (m.lr).id
        left join xd  on xd.lead_id  = (m.lr).id
        left join ck  on ck.lead_id  = (m.lr).id
       where (v_c is null or v_c = '{}'::jsonb
              or public.call_list_matches(m.lr, coalesce(xd.xdates, '{}'::date[]), coalesce(ck.keys, '{}'::text[]), v_c))
       order by m.r_sort_last, (m.lr).call_weight, (m.lr).date_last_worked nulls first, (m.lr).id
       limit greatest(least(coalesce(p_limit, 50), 500), 1)
      offset greatest(coalesce(p_offset, 0), 0)
    )
    select q.q_id, q.q_company, q.q_contact, q.q_phone, q.q_city, q.q_state, q.q_result, q.q_weight, q.q_sort_last, q.q_worked,
           q.q_renewal, q.q_total,
           -- With a renewal window (not excluded): the X-date that put the name in it.
           case when v_renew and not coalesce((v_c -> 'renewal' ->> 'exclude')::boolean, false)
                then public.lead_xdate_in(q.q_id, v_c -> 'renewal') end
      from q
     order by q.q_sort_last, q.q_weight, q.q_worked nulls first, q.q_id;
end $function$;

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
  )
  select coalesce(jsonb_object_agg(k, items), '{}'::jsonb) into v
    from (select k, jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by label) as items
            from opts group by k) g;
  return v;
end $function$;
