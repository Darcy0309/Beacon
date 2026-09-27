-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the lead explorer
--
-- Querying the whole book at once: pick an industry, some ZIP codes and a
-- renewal month, and get back the matching leads, how many there are, and
-- whose book they sit on. The old system could not do this, and it is the
-- question the business actually asks ("every plumber in these ZIPs renewing
-- in July, and which clients they belong to").
--
-- One call returns the page of rows, the total and every breakdown. Runs as
-- the caller, so Row Level Security scopes it exactly like any other query:
-- a client only ever explores their own leads.
-- ---------------------------------------------------------------------------

-- Their imported book is mostly 1711; without this the industry filter would
-- show a bare code with no name against it.
insert into public.sic_codes (code, description) values
  ('1711', 'Plumbing, Heating & Air-Conditioning'),
  ('1721', 'Painting & Paper Hanging'),
  ('1761', 'Roofing, Siding & Sheet Metal Work'),
  ('1791', 'Structural Steel Erection'),
  ('7349', 'Building Cleaning & Maintenance')
on conflict (code) do nothing;

create or replace function public.lead_explore(
  criteria jsonb default '{}'::jsonb,
  page int default 1,
  per_page int default 10
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with c as (
    select
      array(select jsonb_array_elements_text(coalesce(criteria->'sic',       '[]'::jsonb)))          as sic,
      array(select jsonb_array_elements_text(coalesce(criteria->'states',    '[]'::jsonb)))          as states,
      array(select jsonb_array_elements_text(coalesce(criteria->'zips',      '[]'::jsonb)))          as zips,
      array(select jsonb_array_elements_text(coalesce(criteria->'counties',  '[]'::jsonb)))          as counties,
      array(select jsonb_array_elements_text(coalesce(criteria->'statuses',  '[]'::jsonb)))          as statuses,
      array(select (jsonb_array_elements_text(coalesce(criteria->'months',   '[]'::jsonb)))::int)    as months,
      array(select (jsonb_array_elements_text(coalesce(criteria->'clients',  '[]'::jsonb)))::bigint) as clients,
      array(select (jsonb_array_elements_text(coalesce(criteria->'carriers', '[]'::jsonb)))::bigint) as carriers,
      array(select (jsonb_array_elements_text(coalesce(criteria->'reps',     '[]'::jsonb)))::bigint) as reps,
      -- Escape the LIKE wildcards so a literal % or _ matches itself.
      nullif('%' || regexp_replace(btrim(coalesce(criteria->>'q', '')), '([%_\\])', '\\\1', 'g') || '%', '%%') as q
  ),
  m as (
    select l.id, l.company_name, l.contact_name, l.phone, l.email,
           l.city, l.state, l.zip, l.county, l.sic_code, l.lead_date,
           ins.ultimate_xdate,
           co.id as client_id, co.name as client_name,
           ag.name as carrier_name,
           st.code as status_code, st.name as status_name,
           nullif(concat_ws(' ', u.first_name, u.last_name), '') as rep_name
      from public.leads l
      cross join c
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
       and (cardinality(c.carriers) = 0 or l.agency_id        = any(c.carriers))
       and (cardinality(c.reps)     = 0 or l.assigned_user_id = any(c.reps))
       and (cardinality(c.months)   = 0 or extract(month from ins.ultimate_xdate)::int = any(c.months))
       and (c.q is null
            or l.company_name ilike c.q or l.contact_name ilike c.q
            or l.phone ilike c.q or l.email ilike c.q or l.city ilike c.q)
  ),
  win as (
    select * from m
     order by lead_date desc nulls last, id desc
     limit greatest(coalesce(per_page, 10), 1)
    offset greatest(coalesce(page, 1) - 1, 0) * greatest(coalesce(per_page, 10), 1)
  )
  select jsonb_build_object(
    'total',    (select count(*) from m),
    'rows',     (select coalesce(jsonb_agg(to_jsonb(win)), '[]'::jsonb) from win),
    -- "How many, and whose book are they on" — the question he asked for.
    'by_client', (select coalesce(jsonb_agg(jsonb_build_object('id', t.client_id, 'label', coalesce(t.client_name, 'Unassigned'), 'count', t.n)
                                            order by t.n desc, coalesce(t.client_name, 'zzz')), '[]'::jsonb)
                    from (select client_id, client_name, count(*) as n from m group by client_id, client_name) t),
    'by_state',  (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(t.state, '—'), 'count', t.n)
                                            order by t.n desc, coalesce(t.state, 'zz')), '[]'::jsonb)
                    from (select state, count(*) as n from m group by state) t),
    'by_month',  (select coalesce(jsonb_agg(jsonb_build_object('month', t.mon, 'label', to_char(to_date(t.mon::text, 'MM'), 'Mon'), 'count', t.n)
                                            order by t.mon), '[]'::jsonb)
                    from (select extract(month from ultimate_xdate)::int as mon, count(*) as n
                            from m where ultimate_xdate is not null group by 1) t),
    'by_industry', (select coalesce(jsonb_agg(jsonb_build_object('code', t.sic_code, 'label', coalesce(s.description, t.sic_code, '—'), 'count', t.n)
                                              order by t.n desc), '[]'::jsonb)
                      from (select sic_code, count(*) as n from m group by sic_code) t
                      left join public.sic_codes s on s.code = t.sic_code),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('code', t.status_code, 'label', coalesce(t.status_name, '—'), 'count', t.n)
                                            order by t.n desc), '[]'::jsonb)
                    from (select status_code, status_name, count(*) as n from m group by status_code, status_name) t),
    'clients_touched', (select count(distinct client_id) from m where client_id is not null),
    'with_xdate',      (select count(*) from m where ultimate_xdate is not null)
  );
$$;

-- The values actually present in the caller's book, for the criteria pickers.
-- Built from the leads themselves, so no filter ever offers a dead end.
create or replace function public.lead_explore_options()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.sic_code, 'label', coalesce(s.description, t.sic_code), 'count', t.n)
                                             order by t.n desc), '[]'::jsonb)
                     from (select sic_code, count(*) as n from public.leads where sic_code is not null group by sic_code) t
                     left join public.sic_codes s on s.code = t.sic_code),
    'states',     (select coalesce(jsonb_agg(jsonb_build_object('value', t.state, 'label', t.state, 'count', t.n)
                                             order by t.state), '[]'::jsonb)
                     from (select state, count(*) as n from public.leads where state is not null group by state) t),
    'counties',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.county, 'label', t.county, 'count', t.n)
                                             order by t.county), '[]'::jsonb)
                     from (select county, count(*) as n from public.leads where county is not null group by county) t),
    'statuses',   (select coalesce(jsonb_agg(jsonb_build_object('value', code, 'label', name) order by id), '[]'::jsonb)
                     from public.lead_statuses),
    'clients',    (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from public.companies),
    'carriers',   (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', name) order by name), '[]'::jsonb)
                     from public.agencies where name is not null),
    'reps',       (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', nullif(concat_ws(' ', first_name, last_name), '')) order by first_name, last_name), '[]'::jsonb)
                     from public.users where role in ('admin', 'manager', 'agent'))
  );
$$;

grant execute on function public.lead_explore(jsonb, int, int), public.lead_explore_options() to authenticated;
