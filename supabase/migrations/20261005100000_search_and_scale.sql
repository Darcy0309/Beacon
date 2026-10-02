-- ---------------------------------------------------------------------------
-- Lighthouse CRM — search that finds things, at the size of the real book
--
--   search_words()         what was typed, as words: every word must match
--                          ("Sean Fitzgerald", "Drain, LLC", "(602) 851-8511",
--                          "+1 602 851 8511"); a number-like word as digits
--   search_doc()           text as a search reads it: lower-case, plus each
--                          run of digits and phone punctuation as bare digits,
--                          so a number matches however either side wrote it
--   leads.search_text      company, contact, city, state, ZIP, email and phone
--                          through search_doc(), with a trigram index: one
--                          place every lead search looks, fast at 100k+
--   global_search()        Ctrl+K: all words, per-group totals, the client and
--                          status beside each hit, only the groups asked for
--   lead_explore()         renewal month from any policy line (not only the
--                          ultimate X-date), carriers by name (as imports store
--                          them) as well as by record, the same word search
--   call_list()            a rep's list searched word by word, like the rest
--   notifications          the sender's name on every message, so a recipient
--                          (a client included) sees who it is from
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. What is searched, and what was typed
-- ---------------------------------------------------------------------------

/**
 * Text as a search reads it: lower-case, then each run of digits and phone
 * punctuation again as bare digits. "(602) 851-8511" also reads
 * "6028518511", "24-7 Plumbing" also "247", so a number-like word typed in
 * any style (search_words() cuts it to digits) finds it. Matches
 * searchDoc() in src/lib/search-words.js.
 */
create or replace function public.search_doc(t text)
returns text
language sql immutable parallel safe set search_path = public as $$
  select lower(coalesce(t, '')) || coalesce(' ' || (
           select string_agg(regexp_replace(m[1], '\D', '', 'g'), ' ')
             from regexp_matches(lower(coalesce(t, '')), '([0-9][0-9().+ -]*[0-9])', 'g') as m), '');
$$;

alter table public.leads
  add column if not exists search_text text
    -- || rather than concat_ws(), which is not immutable and so cannot feed a generated column.
    generated always as (public.search_doc(
      coalesce(company_name, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' || coalesce(zip, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))) stored;

create index if not exists leads_search_text_trgm on public.leads using gin (search_text extensions.gin_trgm_ops);

/**
 * What someone typed, as lower-case words ready for LIKE, at most eight:
 *   - punctuation that only separates (commas, brackets, quotes, semicolons,
 *     backslashes) splits words: "AZ Pro Plumbing and Drain, LLC" is six;
 *   - a US country code in front of a number is dropped ("+1", or "1"
 *     before an area code), and a number-like word ("851-8511",
 *     "602.851.8511", "1-602-851-8511") becomes its digits, without a
 *     leading country code;
 *   - LIKE's wildcards are escaped.
 * Matches searchWords() and wordForms() in src/lib/search-words.js.
 */
create or replace function public.search_words(q text)
returns text[]
language sql immutable parallel safe set search_path = public as $$
  with parts as (
    select ord, part, lead(part) over (order by ord) as next
      from unnest(regexp_split_to_array(lower(btrim(regexp_replace(coalesce(q, ''), '[,;"''()\[\]{}\\]', ' ', 'g'))), '\s+'))
           with ordinality as t(part, ord)
     where part <> ''
  ), words as (
    select ord,
           case when part ~ '^[0-9().+-]+$' and part ~ '[0-9]{2}'
                then regexp_replace(regexp_replace(part, '\D', '', 'g'), '^1([0-9]{10})$', '\1')
                else regexp_replace(part, '([%_\\])', '\\\1', 'g') end as w
      from parts
     where part <> '+1' and not (part = '1' and coalesce(next, '') ~ '^[0-9]{3}$')
  )
  select coalesce(array_agg(w order by ord), '{}')
    from (select ord, w from words where w <> '' order by ord limit 8) x;
$$;

/** '%word%' for each word: the patterns for `text LIKE ALL (...)`. */
create or replace function public.search_patterns(words text[])
returns text[]
language sql immutable parallel safe set search_path = public as $$
  select coalesce(array_agg('%' || w || '%'), '{}') from unnest(words) w;
$$;

/** The longest word's pattern: the one a trigram index narrows best, checked first. Null for no words. */
create or replace function public.search_lead_pattern(words text[])
returns text
language sql immutable parallel safe set search_path = public as $$
  select '%' || w || '%' from unnest(words) w order by length(w) desc, w limit 1;
$$;

/** A carrier's name as a filter compares it: lower-case, commas and runs of spaces as one space. */
create or replace function public.carrier_key(name text)
returns text
language sql immutable parallel safe set search_path = public as $$
  select nullif(btrim(regexp_replace(lower(coalesce(name, '')), '[\s,]+', ' ', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- 2. Ctrl+K
-- ---------------------------------------------------------------------------

drop function if exists public.global_search(text, int);

/**
 * Search every record type at once. Every word typed must appear (in any
 * order, in any of the record's fields). Each group comes back as
 * { total, items }, items carrying what the palette shows beside them: a
 * lead's contact, place, client and status; a project's client and status.
 * `groups` limits it to the kinds the caller can open (the app passes the
 * ones the role's pages allow). Row Level Security still scopes everything.
 */
create or replace function public.global_search(q text, per_group int default 5,
                                                groups text[] default array['leads','clients','projects','users','documents','carriers'])
returns jsonb
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_words text[] := public.search_words(q);
  v_pats  text[] := public.search_patterns(v_words);
  v_first text   := public.search_lead_pattern(v_words);
  v_n     int    := greatest(least(coalesce(per_group, 5), 20), 1);
  v_out   jsonb  := '{}'::jsonb;
  v_items jsonb;
  v_total bigint;
begin
  if cardinality(v_words) = 0 then
    return v_out;
  end if;

  if 'leads' = any(groups) then
    with hits as (
      select l.id, l.company_name, l.contact_name, l.city, l.state, l.phone, l.lead_date, l.project_id, l.status_id
        from public.leads l
       where l.search_text like v_first and l.search_text like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.lead_date desc nulls last, x.id desc), '[]'::jsonb) from (
             select h.id, h.lead_date, h.company_name as title, h.contact_name as contact,
                    nullif(concat_ws(', ', h.city, h.state), '') as place, h.phone,
                    co.name as client, s.name as status
               from hits h
               left join public.projects p on p.id = h.project_id
               left join public.companies co on co.id = p.company_id
               left join public.lead_statuses s on s.id = h.status_id
              order by h.lead_date desc nulls last, h.id desc
              limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('leads', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'clients' = any(groups) then
    with hits as (
      select c.* from public.companies c
       where public.search_doc(concat_ws(' ', c.name, c.contact_name, c.city, c.state)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.contact_name as contact, nullif(concat_ws(', ', h.city, h.state), '') as place,
                    (select count(*) from public.projects p where p.company_id = h.id) as projects
               from hits h order by h.name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('clients', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'projects' = any(groups) then
    with hits as (
      select p.id, p.name, coalesce(c.name, p.client_name) as client, ps.name as status, t.code as type
        from public.projects p
        left join public.companies c on c.id = p.company_id
        left join public.project_statuses ps on ps.id = p.status_id
        left join public.project_types t on t.id = p.project_type_id
       where public.search_doc(concat_ws(' ', p.name, p.client_name, c.name)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.client, h.status, h.type from hits h order by h.name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('projects', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'users' = any(groups) then
    with hits as (
      select u.* from public.users u
       where public.search_doc(concat_ws(' ', u.first_name, u.last_name, u.email)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, coalesce(nullif(concat_ws(' ', h.first_name, h.last_name), ''), h.email) as title,
                    h.email, h.role, h.status
               from hits h order by h.first_name, h.last_name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('users', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'documents' = any(groups) then
    with hits as (
      select d.id, d.name, d.file_type, d.created_at, c.name as client
        from public.documents d
        left join public.companies c on c.id = d.company_id
       where public.search_doc(concat_ws(' ', d.name, c.name)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
             select h.id, h.name as title, h.file_type, h.client, h.created_at from hits h order by h.created_at desc limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('documents', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'carriers' = any(groups) then
    with hits as (
      select a.* from public.agencies a
       where public.search_doc(concat_ws(' ', a.name, a.association)) like all (v_pats)
    )
    select count(*), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.association from hits h order by h.name limit v_n) x)
      into v_total, v_items
      from hits;
    v_out := v_out || jsonb_build_object('carriers', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  return v_out;
end $$;
revoke execute on function public.global_search(text, int, text[]) from public, anon;
grant execute on function public.global_search(text, int, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lead Explorer
-- ---------------------------------------------------------------------------

/**
 * As before, with these changes. A lead's renewal is lead_renewal_date()'s
 * rule (the ultimate X-date, else the earliest policy line), so a lead
 * whose only date is on its package or workers' comp line has a renewal
 * month too. A carrier is the lead's current one: its carrier record, or
 * when it has none, the carrier name an import stored on its policy; the
 * criteria name carriers by carrier_key() (old links by record id still
 * work). Free text is the word search the rest of the app uses.
 */
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
    select l.id, l.company_name, l.contact_name, l.phone, l.email,
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

/**
 * The values present in the caller's own book, for the criteria pickers.
 * Carriers are every carrier record plus every name an import stored on a
 * policy, each once however it was capitalised or punctuated (the record's
 * spelling wins), with how many leads it is the current carrier of.
 */
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
    'carriers',   (select coalesce(jsonb_agg(jsonb_build_object('value', t.k, 'label', t.label, 'count', t.n) order by t.k), '[]'::jsonb)
                     from (select k, (array_agg(label order by rec desc, label))[1] as label, sum(n)::bigint as n
                             from (select public.carrier_key(a.name) as k, btrim(a.name) as label, true as rec, 0 as n
                                     from public.agencies a
                                   union all
                                   select public.carrier_key(coalesce(ag.name, ins.agency_name)), btrim(coalesce(ag.name, ins.agency_name)), false, 1
                                     from public.leads l
                                     left join public.agencies ag on ag.id = l.agency_id
                                     left join public.insurance_details ins on ins.lead_id = l.id) x
                            where k is not null
                            group by k) t),
    'reps',       (select coalesce(jsonb_agg(jsonb_build_object('value', id, 'label', nullif(concat_ws(' ', first_name, last_name), '')) order by first_name, last_name), '[]'::jsonb)
                     from public.users where role in ('admin', 'manager', 'agent'))
  );
$$;

-- ---------------------------------------------------------------------------
-- 3b. A rep's call list, searched like everything else
-- ---------------------------------------------------------------------------

/**
 * As before, but `p_search` matches word by word, in any order, across the
 * company, contact, city, state, ZIP, email and phone (search_text), where
 * it used to need the whole phrase in one field.
 */
create or replace function public.call_list(p_project_id bigint, p_rep bigint default null,
                                            p_limit int default 50, p_offset int default 0,
                                            p_search text default null)
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
begin
  if v_rep is distinct from public.app_user_id() and not public.is_manager() then
    raise exception 'You can only open your own call list' using errcode = '42501';
  end if;
  return query
    select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
           r.name, l.call_weight, r.sort_last, l.date_last_worked,
           public.lead_renewal_date(l.id), count(*) over ()
      from public.leads l
      join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id
       and l.assigned_user_id = v_rep
       and r.viable and r.callable
       and (v_first is null or (l.search_text like v_first and l.search_text like all (v_pats)))
     order by r.sort_last, l.call_weight, l.date_last_worked nulls first, l.id
     limit greatest(least(coalesce(p_limit, 50), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
grant execute on function public.call_list(bigint, bigint, int, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who a message is from
--
-- A recipient may not be allowed to read the users table (a client cannot),
-- so the name travels with the notification: filled in from the sender's
-- account on every insert, whichever function sends it.
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists sender_name text;

create or replace function public.tg_notifications_sender_name()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_id is not null and new.sender_name is null then
    select coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Lighthouse user')
      into new.sender_name
      from public.users u where u.id = new.sender_id;
  end if;
  return new;
end $$;

drop trigger if exists notifications_sender_name on public.notifications;
create trigger notifications_sender_name
  before insert on public.notifications
  for each row execute function public.tg_notifications_sender_name();

update public.notifications n
   set sender_name = coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Lighthouse user')
  from public.users u
 where u.id = n.sender_id and n.sender_name is null;

-- ---------------------------------------------------------------------------
-- 5. The two policies left calling auth.uid() for every row
-- ---------------------------------------------------------------------------

drop policy if exists users_read_self on public.users;
create policy users_read_self on public.users for select to authenticated
  using (auth_id = (select auth.uid()));

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (auth_id = (select auth.uid()) and (select public.app_user_id()) is not null)
  with check (auth_id = (select auth.uid()));
