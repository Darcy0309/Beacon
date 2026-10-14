-- The Lead Explorer reads leads promoted to appointment projects, by their
-- call results (Sean, Oct 2026). A name still being developed is not a lead
-- yet, whatever renewal dates it carries, so it no longer turns up in the
-- results, the breakdowns or the pickers' counts. The old system's statuses
-- give way to the call result:
--
--   lead_explore          only leads at the appointment stage; criteria
--                         'results' (call result names, "Not called yet" for
--                         none) in place of 'statuses'; each row's result_id,
--                         result_name and result_viable; 'by_result' in place
--                         of 'by_status'
--   lead_explore_options  its pickers' values and counts from those leads;
--                         'results' in place of 'statuses'
--
-- Both are as the local database had them (20261108100000), with only these
-- changes.

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
      array(select (jsonb_array_elements_text(coalesce(criteria->'groups',   '[]'::jsonb)))::bigint) as groups,
      array(select jsonb_array_elements_text(coalesce(criteria->'carriers',  '[]'::jsonb)))          as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
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
       and (cardinality(c.groups)   = 0 or co.agency_group_id = any(c.groups))
       and (cardinality(c.carriers) = 0 or public.carrier_key(coalesce(ag.name, ins.agency_name)) = any(ck.keys))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
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
    'with_xdate',      (select count(*) from m where renewal_date is not null)
  );
$function$;

CREATE OR REPLACE FUNCTION public.lead_explore_options()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.sic_code, 'label', coalesce(s.description, t.sic_code), 'count', t.n)
                                             order by t.n desc), '[]'::jsonb)
                     from (select sic_code, count(*) as n from public.leads where stage = 'appt' and sic_code is not null group by sic_code) t
                     left join public.sic_codes s on s.code = t.sic_code),
    'states',     (select coalesce(jsonb_agg(jsonb_build_object('value', t.state, 'label', t.state, 'count', t.n)
                                             order by t.state), '[]'::jsonb)
                     from (select state, count(*) as n from public.leads where stage = 'appt' and state is not null group by state) t),
    'counties',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.county, 'label', t.county, 'count', t.n)
                                             order by t.county), '[]'::jsonb)
                     from (select county, count(*) as n from public.leads where stage = 'appt' and county is not null group by county) t),
    'results',    (select coalesce(jsonb_agg(jsonb_build_object('value', t.label, 'label', t.label, 'count', t.n) order by t.n desc, t.label), '[]'::jsonb)
                     from (select coalesce(r.name, 'Not called yet') as label, count(*) as n
                             from public.leads l left join public.call_results r on r.id = l.result_id
                            where l.stage = 'appt' group by 1) t),
    'clients',    (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from public.companies),
    'groups',     (select coalesce(jsonb_agg(jsonb_build_object('value', g.id, 'label', g.name, 'count', t.n) order by g.name), '[]'::jsonb)
                     from (select agency_group_id, count(*) as n from public.companies where agency_group_id is not null group by 1) t
                     join public.agencies g on g.id = t.agency_group_id),
    'carriers',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.k, 'label', t.label, 'count', t.n) order by t.k), '[]'::jsonb)
                     from (select k, (array_agg(label order by rec desc, label))[1] as label, sum(n)::bigint as n
                             from (select public.carrier_key(a.name) as k, btrim(a.name) as label, true as rec, 0 as n
                                     from public.agencies a
                                   union all
                                   select public.carrier_key(coalesce(ag.name, ins.agency_name)), btrim(coalesce(ag.name, ins.agency_name)), false, 1
                                     from public.leads l
                                     left join public.agencies ag on ag.id = l.agency_id
                                     left join public.insurance_details ins on ins.lead_id = l.id
                                    where l.stage = 'appt') x
                            where k is not null
                            group by k) t),
    'reps',       (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', nullif(concat_ws(' ', first_name, last_name), '')) order by first_name, last_name), '[]'::jsonb)
                     from public.users where role in ('admin', 'manager', 'agent'))
  );
$function$;
