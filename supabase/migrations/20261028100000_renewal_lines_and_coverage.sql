-- ---------------------------------------------------------------------------
-- Lighthouse CRM — renewals on any policy line; coverage as the 9/24 sheet
-- has it (Sean, Oct 2026)
--
-- A call list's renewal window now looks at every X-date a name has — the
-- Ultimate X-Date and each policy line's (liability/package, workers comp,
-- auto, health, personal lines, dental, vision, professional liability, D&O,
-- E&O) — or at one line chosen. Lead managers filter their DB dev (cold)
-- lists the same way, and by the list a name came from.
--
--   insurance_details.agency_years   years with the agency named
--   lead_xdates(lead, line)          a name's X-dates: all, or one line's
--   call_list_renews_in(c, dates)    any of them in the window of the year
--   call_list_matches()              as before, with every X-date, and the
--                                    list source (criterion "source")
--   lead_xdate_in(lead, c)           which X-date put a name in the window
--   call_list(), call_list_options() as before, with the above; call_list()
--                                    also says which date matched
--
-- Criterion renewal: { from: "MM-DD", to: "MM-DD", line?, exclude }, where
-- line is "ultimate" or a policy line's key (pkg, wc, auto, health,
-- personal, dental, vision, prof, do, eo); none means any of them.
-- ---------------------------------------------------------------------------

alter table public.insurance_details add column if not exists agency_years int
  check (agency_years between 0 and 150);

/** A name's X-dates: the Ultimate X-Date and every policy line's, or only `p_line`'s. */
create or replace function public.lead_xdates(p_lead bigint, p_line text default null)
returns date[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(v.d) filter (where v.d is not null), '{}')
    from public.insurance_details i,
         lateral (values ('ultimate', i.ultimate_xdate), ('pkg', i.pkg_xdate), ('wc', i.wc_xdate), ('auto', i.auto_xdate),
                         ('health', i.health_xdate), ('personal', i.personal_lines_xdate), ('dental', i.dental_xdate),
                         ('vision', i.vision_xdate), ('prof', i.prof_liab_xdate), ('do', i.do_xdate), ('eo', i.eo_xdate)) as v(line, d)
   where i.lead_id = p_lead and (nullif(p_line, '') is null or v.line = p_line);
$$;

/**
 * Any of a name's X-dates against a window of the year ({ from: "MM-DD",
 * to: "MM-DD", exclude }), whatever the year (Nov 1 – Jan 31 runs over the
 * new year). Excluded, none of them is in it; a name with no X-date is in
 * no window.
 */
create or replace function public.call_list_renews_in(c jsonb, ds date[])
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select c is null or coalesce(c ->> 'from', '') !~ '^\d\d-\d\d$' or coalesce(c ->> 'to', '') !~ '^\d\d-\d\d$'
      or (coalesce((select bool_or(
            case when c ->> 'from' <= c ->> 'to'
                 then to_char(d, 'MM-DD') between c ->> 'from' and c ->> 'to'
                 else to_char(d, 'MM-DD') >= c ->> 'from' or to_char(d, 'MM-DD') <= c ->> 'to' end)
             from unnest(ds) as d), false)
          <> coalesce((c ->> 'exclude')::boolean, false));
$$;

/**
 * The X-date that puts a name in a renewal window ({ from, to, line? }):
 * { line, date } of the first in the sheet's order (the Ultimate, then each
 * line), or null.
 */
create or replace function public.lead_xdate_in(p_lead bigint, c jsonb)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('line', v.line, 'date', v.d)
    from public.insurance_details i,
         lateral (values (1, 'ultimate', i.ultimate_xdate), (2, 'pkg', i.pkg_xdate), (3, 'wc', i.wc_xdate), (4, 'auto', i.auto_xdate),
                         (5, 'health', i.health_xdate), (6, 'personal', i.personal_lines_xdate), (7, 'dental', i.dental_xdate),
                         (8, 'vision', i.vision_xdate), (9, 'prof', i.prof_liab_xdate), (10, 'do', i.do_xdate), (11, 'eo', i.eo_xdate)) as v(n, line, d)
   where i.lead_id = p_lead and v.d is not null
     and (nullif(c ->> 'line', '') is null or v.line = c ->> 'line')
     and public.call_list_renews_in(c - 'exclude', array[v.d])
   order by v.n
   limit 1;
$$;

drop function if exists public.call_list_matches(public.leads, date, text[], jsonb);
drop function if exists public.call_list_renews_in(jsonb, date);

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
    and public.call_list_criterion(c -> 'source', array[lower(btrim(l.list_source))]));
$$;

drop function if exists public.call_list(bigint, bigint, int, int, text, boolean);

/**
 * A rep's call list, as before (names still to call, least-called first,
 * searched word by word), through the caller's filter for the project,
 * if they set it today (the business's day), unless `p_filtered` is false.
 * `total` counts the names that pass it.
 */
create or replace function public.call_list(p_project_id bigint, p_rep bigint default null,
                                            p_limit int default 50, p_offset int default 0,
                                            p_search text default null, p_filtered boolean default true)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  result text, call_weight int, sort_last boolean, date_last_worked timestamptz,
  renewal_date date, total bigint, renewal_match jsonb
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
    -- Today's only: each morning the list starts again in full.
    select f.criteria into v_c from public.call_list_filters f
     where f.user_id = public.app_user_id() and f.project_id = p_project_id
       and (f.updated_at at time zone public.business_tz())::date = (now() at time zone public.business_tz())::date;
  end if;
  return query
    select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
           r.name, l.call_weight, r.sort_last, l.date_last_worked,
           x.renewal, count(*) over (),
           -- With a renewal window (not excluded): the X-date that put the name in it.
           case when v_c ? 'renewal' and not coalesce((v_c -> 'renewal' ->> 'exclude')::boolean, false)
                then public.lead_xdate_in(l.id, v_c -> 'renewal') end
      from public.leads l
      join public.call_results r on r.id = l.result_id
      cross join lateral (select public.lead_renewal_date(l.id) as renewal) x
     where l.project_id = p_project_id
       and l.assigned_user_id = v_rep
       and r.viable and r.callable
       and (v_first is null or (l.search_text like v_first and l.search_text like all (v_pats)))
       and (v_c is null or v_c = '{}'::jsonb
            or public.call_list_matches(l,
                 case when v_c ? 'renewal' then public.lead_xdates(l.id, v_c -> 'renewal' ->> 'line') else '{}'::date[] end,
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
 * developed, developer, call result and list source, with how many names
 * have it.
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
    union all
    select 'source', lower(btrim(b.list_source)), min(btrim(b.list_source)), count(*)
      from base b where nullif(btrim(b.list_source), '') is not null group by 2
  )
  select coalesce(jsonb_object_agg(k, items), '{}'::jsonb) into v
    from (select k, jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by label) as items
            from opts group by k) g;
  return v;
end $$;
revoke execute on function public.call_list_options(bigint, bigint) from public, anon;
grant execute on function public.call_list_options(bigint, bigint) to authenticated;
