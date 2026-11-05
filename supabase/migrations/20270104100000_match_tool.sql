-- The Match Tool (Sean, Nov 2026). A match is a name on a project's list (the
-- client's import) that we already have elsewhere in the system, with a renewal
-- date: on another client's project, an old or completed one, any list. The
-- same business by its phone, or by its name in the same place (its ZIP, or
-- its city and state); not by SIC code or size, which two records of one
-- business often disagree on. Bringing a match in copies its renewal dates:
--
--   to DB Dev    onto the name's Liability / Work comp / Auto (and any other)
--                lines, its Ultimate X-date left blank, at Viable-Staged, for
--                the lead managers to call in renewal order
--   to Appts     a lead on the linked appointment project with all of it,
--                Ultimate X-date too, at Lead-No Contact, to the appointment
--                manager with the fewest names
--
-- Either way the lead is marked matched (leads.matched_at, matched_from_lead_id,
-- matched_by): it counts toward the project's lead goal, as a client sees it,
-- but no report counts it as developed (no manager on it: report_events counts
-- a lead to the staff member who developed it) and nobody is paid for it.
--
--   business_key(name)   a business name as the import compares them (dedupe.js nameKey)
--   project_matches(project)   a project's matches: each name, the record matched and how, its renewal
--   match_summary()   each active project's figures for the Match report
--   add_matches(project, leads, to)   bring the matches picked in
--
-- Administrators only. Safe to run more than once.

alter table public.leads add column if not exists matched_at timestamptz;
alter table public.leads add column if not exists matched_from_lead_id bigint references public.leads(id) on delete set null;
alter table public.leads add column if not exists matched_by bigint references public.users(id) on delete set null;
create index if not exists leads_matched on public.leads (coalesce(source_project_id, project_id), matched_at) where matched_at is not null;

-- "Acme Plumbing, Inc." is "acmeplumbing", "The Acme Co" is "acme": as the import's duplicate check reads a name.
create or replace function public.business_key(p_name text)
returns text language plpgsql immutable parallel safe set search_path = '' as $$
declare
  w text[] := array_remove(regexp_split_to_array(replace(lower(coalesce(p_name, '')), '&', ' and '), '[^a-z0-9]+'), '');
begin
  while cardinality(w) > 1 and w[cardinality(w)] = any (array['inc', 'incorporated', 'llc', 'ltd', 'limited', 'co', 'corp', 'corporation', 'company', 'pllc', 'llp', 'lp', 'pc', 'the']) loop
    w := w[1:cardinality(w) - 1];
  end loop;
  if cardinality(w) > 1 and w[1] = 'the' then
    w := w[2:cardinality(w)];
  end if;
  return nullif(array_to_string(w, ''), '');
end $$;
create index if not exists leads_business_key on public.leads (public.business_key(company_name)) where deleted_at is null;

-- A renewal day's next time round, on or after `p_today`: 2025-03-01 is 2027-03-01 on 2026-11-05 (Feb 29 as Feb 28).
create or replace function public.next_renewal(p_day date, p_today date)
returns date language plpgsql immutable parallel safe set search_path = '' as $$
declare
  d date;
begin
  if p_day is null then return null; end if;
  d := (p_day + make_interval(years => extract(year from p_today)::int - extract(year from p_day)::int))::date;
  return case when d >= p_today then d else (p_day + make_interval(years => extract(year from p_today)::int + 1 - extract(year from p_day)::int))::date end;
end $$;

-- A project's matches. Its names: on the project, not deleted, still viable,
-- never matched, with no renewal date of their own. Their match: the record
-- elsewhere (not on the project or its linked one) with a renewal date, found
-- by phone first, else by name in the same ZIP or city and state; the one with
-- an Ultimate X-date, then the latest worked, when there are several.
create or replace function public.project_matches_raw(p_project bigint, p_today date)
returns table (lead_id bigint, company text, city text, state text, zip text, phone text,
               source_lead_id bigint, source_project text, source_client text, matched_by text,
               renewal date, lines jsonb)
language sql stable security definer set search_path = public set work_mem = '64MB' as $$
  with p as (
    select pr.id, pr.appt_project_id from public.projects pr where pr.id = p_project
  ), family as (
    select p.id from p
    union select p.appt_project_id from p where p.appt_project_id is not null
    union select pr.id from public.projects pr, p where pr.appt_project_id = p.id
  ), targets as (
    select l.id, l.company_name, l.city, l.state, l.zip, l.phone,
           public.phone_key(l.phone) as pk, public.business_key(l.company_name) as nk,
           left(btrim(l.zip), 5) as z5, lower(btrim(l.city)) as ck, upper(btrim(l.state)) as sk
      from public.leads l
      join public.call_results r on r.id = l.result_id and r.viable
     where l.project_id = p_project and l.deleted_at is null and l.matched_at is null
       and not exists (select 1 from public.insurance_details i where i.lead_id = l.id
                        and coalesce(i.ultimate_xdate, i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate, i.vision_xdate,
                                     i.prof_liab_xdate, i.do_xdate, i.eo_xdate, i.homeowner_xdate, i.personal_auto_xdate, i.personal_lines_xdate) is not null)
  )
  select t.id, t.company_name, t.city, t.state, t.zip, t.phone,
         m.id, m.project, m.client, m.how,
         public.next_renewal(m.renewal, p_today),
         m.lines
    from targets t
    cross join lateral (
      select s.id, sp.name as project, co.name as client, c.how, c.renewal, c.lines
        from (
          select s.id, 'phone' as how from public.leads s
           where t.pk is not null and public.phone_key(s.phone) = t.pk and s.deleted_at is null
          union
          select s.id, 'name' from public.leads s
           where t.nk is not null and public.business_key(s.company_name) = t.nk and s.deleted_at is null
             and ((t.z5 <> '' and left(btrim(s.zip), 5) = t.z5)
                  or (t.ck <> '' and lower(btrim(s.city)) = t.ck and upper(btrim(s.state)) = t.sk))
        ) hit
        join public.leads s on s.id = hit.id
        join public.projects sp on sp.id = s.project_id
        left join public.companies co on co.id = sp.company_id
        join public.insurance_details i on i.lead_id = s.id
        cross join lateral (
          select hit.how,
                 coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate, i.vision_xdate,
                                                  i.prof_liab_xdate, i.do_xdate, i.eo_xdate, i.homeowner_xdate, i.personal_auto_xdate, i.personal_lines_xdate)) as renewal,
                 jsonb_strip_nulls(jsonb_build_object(
                   'ultimate_xdate', i.ultimate_xdate,
                   'pkg_xdate', i.pkg_xdate, 'pkg_carrier', i.pkg_carrier, 'wc_xdate', i.wc_xdate, 'wc_carrier', i.wc_carrier,
                   'auto_xdate', i.auto_xdate, 'auto_carrier', i.auto_carrier, 'health_xdate', i.health_xdate, 'health_carrier', i.health_carrier,
                   'dental_xdate', i.dental_xdate, 'dental_provider', i.dental_provider, 'vision_xdate', i.vision_xdate, 'vision_provider', i.vision_provider,
                   'prof_liab_xdate', i.prof_liab_xdate, 'prof_liab_carrier', i.prof_liab_carrier, 'do_xdate', i.do_xdate, 'do_carrier', i.do_carrier,
                   'eo_xdate', i.eo_xdate, 'eo_carrier', i.eo_carrier, 'homeowner_xdate', i.homeowner_xdate, 'homeowner_carrier', i.homeowner_carrier,
                   'personal_auto_xdate', i.personal_auto_xdate, 'personal_auto_carrier', i.personal_auto_carrier,
                   'personal_lines_xdate', i.personal_lines_xdate, 'personal_lines_carrier', i.personal_lines_carrier,
                   'agency_name', i.agency_name)) as lines
        ) c
       where s.project_id not in (select id from family) and c.renewal is not null
       order by (hit.how = 'phone') desc, (i.ultimate_xdate is not null) desc, s.updated_at desc, s.id desc
       limit 1
    ) m;
$$;
revoke execute on function public.project_matches_raw(bigint, date) from public, anon, authenticated;

create or replace function public.project_matches(p_project bigint)
returns table (lead_id bigint, company text, city text, state text, zip text, phone text,
               source_lead_id bigint, source_project text, source_client text, matched_by text,
               renewal date, lines jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'The Match Tool is for administrators' using errcode = '42501';
  end if;
  return query select * from public.project_matches_raw(p_project, (now() at time zone public.business_tz())::date) m
   order by m.renewal, m.company, m.lead_id;
end $$;
revoke execute on function public.project_matches(bigint) from public, anon;
grant execute on function public.project_matches(bigint) to authenticated;

-- Each active project's figures: its lead goal, leads in (every lead it sent
-- on or brought in), those our managers developed and the matches added since
-- its start date, and its matches waiting, by renewal month.
create or replace function public.match_summary()
returns table (project_id bigint, project text, type text, client text, status text, start_date date, due_date date,
               lead_goal int, leads bigint, developed bigint, matched bigint, matches bigint, by_month jsonb)
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  v_today date := (now() at time zone public.business_tz())::date;
begin
  if not public.is_admin() then
    raise exception 'The Match Tool is for administrators' using errcode = '42501';
  end if;
  return query
  with pr as (
    select p.id, p.name, t.code, co.name as client, ps.name as status, p.start_date, p.end_date, p.lead_goal
      from public.projects p
      join public.project_statuses ps on ps.id = p.status_id and ps.name = 'Active'
      left join public.project_types t on t.id = p.project_type_id
      left join public.companies co on co.id = p.company_id
     where p.deleted_at is null and (co.id is null or co.deleted_at is null)
  ), counts as (
    -- A lead counts to the project it was developed on (its DB Dev project once sent on).
    select coalesce(l.source_project_id, l.project_id) as pid,
           count(*) filter (where l.promoted_at is not null or (l.matched_at is not null and l.stage = 'appt')) as leads
      from public.leads l
     where l.deleted_at is null and coalesce(l.source_project_id, l.project_id) in (select id from pr)
     group by 1
  ), since as (
    select pr.id,
           (select count(*) from public.leads l
             where l.deleted_at is null and coalesce(l.source_project_id, l.project_id) = pr.id
               and l.promoted_at is not null and l.matched_at is null and l.dbdv_user_id is not null
               and (pr.start_date is null or l.promoted_at >= (pr.start_date::timestamp at time zone public.business_tz()))) as developed,
           (select count(*) from public.leads l
             where l.deleted_at is null and coalesce(l.source_project_id, l.project_id) = pr.id and l.matched_at is not null
               and (pr.start_date is null or l.matched_at >= (pr.start_date::timestamp at time zone public.business_tz()))) as matched
      from pr
  ), m as (
    select pr.id, count(x.*) as n,
           coalesce(jsonb_object_agg(x.mon, x.k) filter (where x.mon is not null), '{}') as by_month
      from pr
      left join lateral (
        select extract(month from mm.renewal)::int as mon, count(*) as k
          from public.project_matches_raw(pr.id, v_today) mm group by 1
      ) x on true
     group by pr.id
  )
  select pr.id, pr.name, pr.code, pr.client, pr.status, pr.start_date, pr.end_date, pr.lead_goal,
         coalesce(c.leads, 0), s.developed, s.matched,
         coalesce((select sum(v::bigint) from jsonb_each_text(m.by_month) e(k, v)), 0)::bigint, m.by_month
    from pr
    join since s on s.id = pr.id
    join m on m.id = pr.id
    left join counts c on c.pid = pr.id
   order by pr.client, pr.name;
end $$;
revoke execute on function public.match_summary() from public, anon;
grant execute on function public.match_summary() to authenticated;

-- Bring matches in: `p_leads` (names on the project its matches named) to 'dbdev' or 'appt'. Each found again
-- now, so a name matched since, or no longer a match, is skipped. The count brought in.
create or replace function public.add_matches(p_project bigint, p_leads bigint[], p_to text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
  v_today date := (now() at time zone public.business_tz())::date;
  p public.projects%rowtype;
  v_type text;
  v_staged bigint;
  v_lead_result public.call_results%rowtype;
  m record;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'The Match Tool is for administrators' using errcode = '42501';
  end if;
  if p_to not in ('dbdev', 'appt') then
    raise exception 'Bring matches to the DB Dev or the appointment project' using errcode = '22023';
  end if;
  select * into p from public.projects where id = p_project and deleted_at is null;
  if p.id is null then
    raise exception 'That project no longer exists' using errcode = '22023';
  end if;
  v_type := public.project_type_code(p.id);
  if p_to = 'dbdev' and v_type <> 'DBDV' then
    raise exception '% is not a DB Dev project', p.name using errcode = '22023';
  end if;
  if p_to = 'appt' and v_type = 'DBDV' and p.appt_project_id is null then
    raise exception 'Link % to an appointment project before sending it leads', p.name using errcode = '22023';
  end if;
  select id into v_staged from public.call_results where project_type = 'DBDV' and name = 'Viable-Staged';
  select * into v_lead_result from public.call_results where project_type = 'APPT' and name = 'Lead-No Contact';

  for m in select * from public.project_matches_raw(p.id, v_today) mm where mm.lead_id = any (p_leads) loop
    -- The record's renewal dates, each brought round to its next time, and its carriers.
    if not exists (select 1 from public.insurance_details where lead_id = m.lead_id) then
      insert into public.insurance_details (lead_id) values (m.lead_id);
    end if;
    update public.insurance_details i set
      pkg_xdate = public.next_renewal((m.lines->>'pkg_xdate')::date, v_today), pkg_carrier = coalesce(i.pkg_carrier, m.lines->>'pkg_carrier'),
      wc_xdate = public.next_renewal((m.lines->>'wc_xdate')::date, v_today), wc_carrier = coalesce(i.wc_carrier, m.lines->>'wc_carrier'),
      auto_xdate = public.next_renewal((m.lines->>'auto_xdate')::date, v_today), auto_carrier = coalesce(i.auto_carrier, m.lines->>'auto_carrier'),
      health_xdate = public.next_renewal((m.lines->>'health_xdate')::date, v_today), health_carrier = coalesce(i.health_carrier, m.lines->>'health_carrier'),
      dental_xdate = public.next_renewal((m.lines->>'dental_xdate')::date, v_today), dental_provider = coalesce(i.dental_provider, m.lines->>'dental_provider'),
      vision_xdate = public.next_renewal((m.lines->>'vision_xdate')::date, v_today), vision_provider = coalesce(i.vision_provider, m.lines->>'vision_provider'),
      prof_liab_xdate = public.next_renewal((m.lines->>'prof_liab_xdate')::date, v_today), prof_liab_carrier = coalesce(i.prof_liab_carrier, m.lines->>'prof_liab_carrier'),
      do_xdate = public.next_renewal((m.lines->>'do_xdate')::date, v_today), do_carrier = coalesce(i.do_carrier, m.lines->>'do_carrier'),
      eo_xdate = public.next_renewal((m.lines->>'eo_xdate')::date, v_today), eo_carrier = coalesce(i.eo_carrier, m.lines->>'eo_carrier'),
      homeowner_xdate = public.next_renewal((m.lines->>'homeowner_xdate')::date, v_today), homeowner_carrier = coalesce(i.homeowner_carrier, m.lines->>'homeowner_carrier'),
      personal_auto_xdate = public.next_renewal((m.lines->>'personal_auto_xdate')::date, v_today), personal_auto_carrier = coalesce(i.personal_auto_carrier, m.lines->>'personal_auto_carrier'),
      personal_lines_xdate = public.next_renewal((m.lines->>'personal_lines_xdate')::date, v_today), personal_lines_carrier = coalesce(i.personal_lines_carrier, m.lines->>'personal_lines_carrier'),
      agency_name = coalesce(i.agency_name, m.lines->>'agency_name'),
      -- Its Ultimate X-date: on DB Dev left blank, for the lead managers to set; on the appointment project, the renewal.
      ultimate_xdate = case when p_to = 'appt' then m.renewal else null end
    where i.lead_id = m.lead_id;

    if p_to = 'dbdev' then
      update public.leads set result_id = v_staged, call_result_dbdv = 'Viable-Staged', call_weight = 0, resolved_at = null,
             matched_at = now(), matched_from_lead_id = m.source_lead_id, matched_by = v_me
       where id = m.lead_id;
    elsif v_type = 'DBDV' then
      -- On to the appointment project as a lead, nobody's developed one.
      update public.leads set
        stage = 'appt', project_id = p.appt_project_id, source_project_id = coalesce(source_project_id, p.id),
        dbdv_user_id = null, assigned_user_id = public.least_loaded_rep(p.appt_project_id),
        result_id = v_lead_result.id, call_result_appt = v_lead_result.name, call_weight = 0,
        promoted_at = now(), resolved_at = null,
        matched_at = now(), matched_from_lead_id = m.source_lead_id, matched_by = v_me
       where id = m.lead_id;
    else
      -- Already on an appointment project: a lead there now.
      update public.leads set result_id = v_lead_result.id, call_result_appt = v_lead_result.name, call_weight = 0, resolved_at = null,
             matched_at = now(), matched_from_lead_id = m.source_lead_id, matched_by = v_me
       where id = m.lead_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.add_matches(bigint, bigint[], text) from public, anon;
grant execute on function public.add_matches(bigint, bigint[], text) to authenticated;
