-- ---------------------------------------------------------------------------
-- Lighthouse CRM — filtering a call list (Sean, Oct 2026)
--
-- An account manager working a project narrows their call list to the names
-- most worth calling now: those renewing in a window of the year (Nov 1 –
-- Jan 31, any year, or one month at a time), in given cities, ZIP codes or
-- counties, in given industries (SIC), with given carriers, developed in a
-- given year or by given managers, or with given call results — each one
-- included or excluded. Only names still to call come up, as before.
--
-- The filter is the manager's own, kept per project, so everything that
-- walks their list follows it: the list itself, Start calling, Skip, and the
-- next name after a result is saved.
--
--   call_list_filters        the filter each person keeps for each project
--   call_list_criterion()    one criterion against one value (include/exclude)
--   call_list_renews_in()    a renewal date against a window of the year
--   lead_carrier_keys()      every carrier a name has (agency, each line)
--   call_list_options()      what the filter offers: the values found among
--                            the names on the list, with how many of each
--   call_list()              as before, through the caller's filter for the
--                            project (p_filtered => false to ignore it)
--
-- Criteria (jsonb), each optional:
--   renewal    { from: "MM-DD", to: "MM-DD", exclude }   (to before from wraps the year)
--   city, zip, county, sic, carrier, year, developer, result
--              { values: [text], exclude }
-- ---------------------------------------------------------------------------

create table if not exists public.call_list_filters (
  user_id     bigint not null references public.users(id) on delete cascade,
  project_id  bigint not null references public.projects(id) on delete cascade,
  criteria    jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object' and length(criteria::text) <= 20000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.call_list_filters enable row level security;
drop policy if exists call_list_filters_own on public.call_list_filters;
create policy call_list_filters_own on public.call_list_filters
  for all to authenticated
  using (user_id = (select public.app_user_id()) and (select public.is_staff()))
  with check (user_id = (select public.app_user_id()) and (select public.is_staff()));
drop policy if exists mfa_required on public.call_list_filters;
create policy mfa_required on public.call_list_filters as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.call_list_filters;
create policy active_account_required on public.call_list_filters as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.call_list_filters from anon;
grant select, insert, update, delete on public.call_list_filters to authenticated;
grant all on public.call_list_filters to service_role;

/**
 * One criterion ({ values, exclude }) against a name's values: with no
 * values chosen, anything; included, one of its values is chosen;
 * excluded, none is (a name with no value at all stays).
 */
create or replace function public.call_list_criterion(c jsonb, v text[])
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select c is null or jsonb_typeof(c -> 'values') is distinct from 'array' or jsonb_array_length(c -> 'values') = 0
      or (coalesce(v && array(select jsonb_array_elements_text(c -> 'values')), false)
          <> coalesce((c ->> 'exclude')::boolean, false));
$$;

/**
 * A renewal date against a window of the year ({ from: "MM-DD", to:
 * "MM-DD", exclude }), whatever the year: Nov 1 – Jan 31 runs over the new
 * year. A name with no renewal date is not in any window.
 */
create or replace function public.call_list_renews_in(c jsonb, d date)
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select c is null or coalesce(c ->> 'from', '') !~ '^\d\d-\d\d$' or coalesce(c ->> 'to', '') !~ '^\d\d-\d\d$'
      or (coalesce(
            case when c ->> 'from' <= c ->> 'to'
                 then to_char(d, 'MM-DD') between c ->> 'from' and c ->> 'to'
                 else to_char(d, 'MM-DD') >= c ->> 'from' or to_char(d, 'MM-DD') <= c ->> 'to' end,
            false)
          <> coalesce((c ->> 'exclude')::boolean, false));
$$;

/** Every carrier a name has, as carrier_key()s: its agency's, and each policy line's. */
create or replace function public.lead_carrier_keys(p_lead bigint)
returns text[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct k) filter (where k is not null), '{}')
    from (
      select public.carrier_key(a.name) as k
        from public.leads l join public.agencies a on a.id = l.agency_id where l.id = p_lead
      union all
      select public.carrier_key(x)
        from public.insurance_details i,
             unnest(array[i.agency_name, i.pkg_carrier, i.wc_carrier, i.auto_carrier, i.health_carrier, i.dental_provider,
                          i.vision_provider, i.prof_liab_carrier, i.do_carrier, i.eo_carrier, i.homeowner_carrier,
                          i.personal_auto_carrier, i.personal_lines_carrier]) as x
       where i.lead_id = p_lead
    ) s;
$$;

/** A name's values for each criterion, as call_list_criterion() compares them. */
create or replace function public.call_list_matches(l public.leads, p_renewal date, p_carriers text[], c jsonb)
returns boolean
language sql stable set search_path = public as $$
  select c is null or c = '{}'::jsonb or (
        public.call_list_renews_in(c -> 'renewal', p_renewal)
    and public.call_list_criterion(c -> 'city', array[lower(btrim(l.city))])
    and public.call_list_criterion(c -> 'zip', array[left(btrim(l.zip), 5)])
    and public.call_list_criterion(c -> 'county', array[lower(btrim(l.county))])
    and public.call_list_criterion(c -> 'sic', array[btrim(l.sic_code)])
    and public.call_list_criterion(c -> 'carrier', p_carriers)
    and public.call_list_criterion(c -> 'year', array[extract(year from l.promoted_at at time zone public.business_tz())::int::text])
    and public.call_list_criterion(c -> 'developer', array[l.dbdv_user_id::text])
    and public.call_list_criterion(c -> 'result', array[l.result_id::text]));
$$;

drop function if exists public.call_list(bigint, bigint, int, int, text);

/**
 * A rep's call list, as before (names still to call, least-called first,
 * searched word by word), through the caller's filter for the project
 * unless `p_filtered` is false. `total` counts the names that pass it.
 */
create or replace function public.call_list(p_project_id bigint, p_rep bigint default null,
                                            p_limit int default 50, p_offset int default 0,
                                            p_search text default null, p_filtered boolean default true)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  result text, call_weight int, sort_last boolean, date_last_worked timestamptz,
  renewal_date date, total bigint
)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_rep   bigint := coalesce(p_rep, public.app_user_id());
  v_words text[] := public.search_words(p_search);
  v_pats  text[] := public.search_patterns(v_words);
  v_first text   := public.search_lead_pattern(v_words);
  v_c     jsonb;
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  if coalesce(p_filtered, true) then
    select f.criteria into v_c from public.call_list_filters f
     where f.user_id = public.app_user_id() and f.project_id = p_project_id;
  end if;
  return query
    select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
           r.name, l.call_weight, r.sort_last, l.date_last_worked,
           x.renewal, count(*) over ()
      from public.leads l
      join public.call_results r on r.id = l.result_id
      cross join lateral (select public.lead_renewal_date(l.id) as renewal) x
     where l.project_id = p_project_id
       and l.assigned_user_id = v_rep
       and r.viable and r.callable
       and (v_first is null or (l.search_text like v_first and l.search_text like all (v_pats)))
       and (v_c is null or v_c = '{}'::jsonb
            or public.call_list_matches(l, x.renewal,
                 case when v_c ? 'carrier' then public.lead_carrier_keys(l.id) else '{}'::text[] end, v_c))
     order by r.sort_last, l.call_weight, l.date_last_worked nulls first, l.id
     limit greatest(least(coalesce(p_limit, 50), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke execute on function public.call_list(bigint, bigint, int, int, text, boolean) from public, anon;
grant execute on function public.call_list(bigint, bigint, int, int, text, boolean) to authenticated;

/**
 * What a call list's filter can offer: among the rep's names still to call
 * on the project, each city, ZIP, county, industry, carrier, year
 * developed, developer and call result, with how many names have it.
 * Values are as call_list_matches() compares them; labels as people read them.
 */
create or replace function public.call_list_options(p_project_id bigint, p_rep bigint default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
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
    select 'carrier', k, min(initcap(k)), count(distinct b.id) from base b, unnest(public.lead_carrier_keys(b.id)) k group by 2
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
  )
  select coalesce(jsonb_object_agg(k, items), '{}'::jsonb) into v
    from (select k, jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by label) as items
            from opts group by k) g;
  return v;
end $$;
revoke execute on function public.call_list_options(bigint, bigint) from public, anon;
grant execute on function public.call_list_options(bigint, bigint) to authenticated;
