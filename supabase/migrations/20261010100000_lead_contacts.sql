-- ---------------------------------------------------------------------------
-- Lighthouse CRM — more ways to reach a name: mobiles and the decision maker
--
-- A name had one phone and one email, and its decision maker only a name
-- and title. Now the contact has a mobile too, and the decision maker a
-- business phone, a mobile and an email; the lead sheet puts a Call button
-- beside every number and an Email button beside every address.
--
--   leads.contact_mobile, dm_phone, dm_mobile, dm_email
--   leads.search_text   now also the decision maker's name and the new
--                       numbers and addresses, so a call back from a mobile
--                       finds its name
--   lead_explore()      its rows carry them too, for the Lead Explorer's CSV
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists contact_mobile text check (length(contact_mobile) <= 40),
  add column if not exists dm_phone       text check (length(dm_phone) <= 40),
  add column if not exists dm_mobile      text check (length(dm_mobile) <= 40),
  add column if not exists dm_email       text check (length(dm_email) <= 120);

-- The search column, rebuilt with the new fields (search_doc() reads each
-- number also as bare digits, however it is written).
drop index if exists public.leads_search_text_trgm;
alter table public.leads drop column if exists search_text;
alter table public.leads
  add column search_text text
    -- || rather than concat_ws(), which is not immutable and so cannot feed a generated column.
    generated always as (public.search_doc(
      coalesce(company_name, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' || coalesce(zip, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' ||
      coalesce(contact_mobile, '') || ' ' || coalesce(decision_maker, '') || ' ' || coalesce(dm_phone, '') || ' ' ||
      coalesce(dm_mobile, '') || ' ' || coalesce(dm_email, ''))) stored;
create index if not exists leads_search_text_trgm on public.leads using gin (search_text extensions.gin_trgm_ops);

-- The Lead Explorer: the same as before, its rows carrying the new fields (for the CSV).
create or replace function public.lead_explore(criteria jsonb default '{}'::jsonb, page int default 1, per_page int default 10)
returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'statuses',  '[]'::jsonb)))          as statuses,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
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
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           coalesce(ins.ultimate_xdate, least(ins.pkg_xdate, ins.wc_xdate, ins.auto_xdate, ins.health_xdate, ins.dental_xdate,
                                              ins.vision_xdate, ins.prof_liab_xdate, ins.do_xdate, ins.eo_xdate)) as renewal_date,
           co.id as client_id, co.name as client_name,
           coalesce(ag.name, nullif(btrim(ins.agency_name), '')) as carrier_name,
           st.code as status_code, st.name as status_name,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
      cross join carrier_keys ck
      left join public.insurance_details ins on ins.lead_id = l.id
      left join public.projects p   on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
      left join public.agencies ag  on ag.id = l.agency_id
      left join public.lead_statuses st on st.id = l.status_id
      left join public.users u      on u.id  = l.assigned_user_id
     where (cardinality(c.sic)      = 0 or l.sic_code         = any(c.sic))
       and (cardinality(c.states)   = 0 or l.state            = any(c.states))
       and (cardinality(c.zips)     = 0 or left(l.zip, 5)     = any(c.zips))
       and (cardinality(c.counties) = 0 or l.county           = any(c.counties))
       and (cardinality(c.statuses) = 0 or st.code            = any(c.statuses))
       and (cardinality(c.clients)  = 0 or co.id              = any(c.clients))
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
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('code', t.status_code, 'label', coalesce(t.status_name, '—'), 'count', t.n)
                                            order by t.n desc), '[]'::jsonb)
                    from (select status_code, status_name, count(*) as n from m group by status_code, status_name) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where renewal_date is not null)
  );
$$;
