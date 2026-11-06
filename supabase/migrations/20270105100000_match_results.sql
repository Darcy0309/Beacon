-- The Match Tool (Sean, Nov 2026): a record elsewhere is a match's source only when its own call
-- result qualifies; Lead-Disco#, Out of Business and invalid ones don't. The results left out are an
-- administrator's choice on the Match Tool page (app_settings 'match_results': { "exclude": [names] }),
-- a result's name standing for it on both DB Dev and Appt lists; until chosen, those below.
--
-- match_summary() counts each project's matches by the month and year of their next renewal
-- ("2026-11"), not the month alone: the rest of this November and next November a year off are
-- two months, so "the next three months" are those three.
--
-- Safe to run more than once.

create or replace function public.match_excluded_results()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(s.value->'exclude')) from public.app_settings s where s.key = 'match_results'),
    array['Disco#', 'Lead-Disco#', 'Out of Business', 'Lead-Out of Business', 'Lead-Invalid', 'Appointment-Invalid']);
$$;
revoke execute on function public.match_excluded_results() from public, anon;
grant execute on function public.match_excluded_results() to authenticated;

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
        -- Not a record whose own call result says it's no use (Lead-Disco#, invalid…: Sean, Nov 2026).
        join public.call_results sr on sr.id = s.result_id and sr.name <> all (public.match_excluded_results())
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
        select to_char(mm.renewal, 'YYYY-MM') as mon, count(*) as k
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
