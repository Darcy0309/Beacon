-- Search, faster (Nov 2026). The leads are found by search_lead_hits() below, newest first, and
-- not counted past the few shown (the palette says "5+"); every other kind of record is counted to
-- 101 at most ("100+"). So a common word ("Phoenix", "Inc") no longer reads every lead it is on.

create index if not exists leads_newest on public.leads (lead_date desc nulls last, id desc) where deleted_at is null;
--
-- Safe to run more than once.

-- The leads' part, in a function of its own. Row Level Security keeps Postgres from using the
-- trigram index on leads.search_text (LIKE is not "leakproof", so it may not run before the policy),
-- which made every lead search read the whole table: 0.5 ms with the index, 170-250 ms without it
-- on 300,000 leads. This runs as its owner, with the policy's own rule written into the query
-- (signed in, past the authenticator check, and staff or one of a client's own projects), so the
-- index is used and the same leads are found. Planned with the words themselves (not parameters),
-- so a rare word goes by the trigram index and a common one walks leads_newest to its fifth.
create or replace function public.search_lead_hits(p_first text, p_pats text[], p_n int)
returns table (total bigint, items jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_seen text := '(select public.app_user_id()) is not null and (select public.mfa_satisfied())
                  and ((select public.is_staff()) or l.project_id in (select public.client_project_ids()))';
begin
  execute format($q$
    select coalesce(jsonb_agg(x order by x.lead_date desc nulls last, x.id desc), '[]'::jsonb) from (
      select l.id, l.lead_date, l.company_name as title, l.contact_name as contact,
             nullif(concat_ws(', ', l.city, l.state), '') as place, l.phone,
             co.name as client, s.name as status
        from (select l.* from public.leads l
               where l.deleted_at is null and %s and l.search_text like %L and l.search_text like all (%L::text[])
               order by l.lead_date desc nulls last, l.id desc
               limit %s) l
        left join public.projects p on p.id = l.project_id
        left join public.companies co on co.id = p.company_id
        left join public.lead_statuses s on s.id = l.status_id) x$q$, v_seen, p_first, p_pats, greatest(least(coalesce(p_n, 5), 20), 1))
    into items;
  -- Not counted beyond them (Nov 2026): counting a common word's matches cost far more than finding
  -- the newest few. Fewer than asked for are all there are; otherwise "more" (null), and the Leads list counts them.
  total := case when jsonb_array_length(items) < greatest(least(coalesce(p_n, 5), 20), 1) then jsonb_array_length(items) end;
  return next;
end $$;
revoke execute on function public.search_lead_hits(text, text[], int) from public, anon;
grant execute on function public.search_lead_hits(text, text[], int) to authenticated;

CREATE OR REPLACE FUNCTION public.global_search(q text, per_group integer DEFAULT 5, groups text[] DEFAULT ARRAY['leads'::text, 'clients'::text, 'projects'::text, 'users'::text, 'documents'::text, 'carriers'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
    -- The leads through search_lead_hits(), which can use the trigram index (see above).
    select h.total, h.items into v_total, v_items from public.search_lead_hits(v_first, v_pats, v_n) h;
    v_out := v_out || jsonb_build_object('leads', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'clients' = any(groups) then
    with hits as (
      select c.* from public.companies c
       where public.search_doc(concat_ws(' ', c.name, c.contact_name, c.city, c.state)) like all (v_pats)
    )
    select (select count(*) from (select 1 from hits limit 101) capped), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.contact_name as contact, nullif(concat_ws(', ', h.city, h.state), '') as place,
                    (select count(*) from public.projects p where p.company_id = h.id) as projects
               from hits h order by h.name limit v_n) x)
      into v_total, v_items;
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
    select (select count(*) from (select 1 from hits limit 101) capped), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.client, h.status, h.type from hits h order by h.name limit v_n) x)
      into v_total, v_items;
    v_out := v_out || jsonb_build_object('projects', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'users' = any(groups) then
    with hits as (
      select u.* from public.users u
       where public.search_doc(concat_ws(' ', u.first_name, u.last_name, u.email)) like all (v_pats)
    )
    select (select count(*) from (select 1 from hits limit 101) capped), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, coalesce(nullif(concat_ws(' ', h.first_name, h.last_name), ''), h.email) as title,
                    h.email, h.role, h.status
               from hits h order by h.first_name, h.last_name limit v_n) x)
      into v_total, v_items;
    v_out := v_out || jsonb_build_object('users', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'documents' = any(groups) then
    with hits as (
      select d.id, d.name, d.file_type, d.created_at, c.name as client
        from public.documents d
        left join public.companies c on c.id = d.company_id
       where public.search_doc(concat_ws(' ', d.name, c.name)) like all (v_pats)
    )
    select (select count(*) from (select 1 from hits limit 101) capped), (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
             select h.id, h.name as title, h.file_type, h.client, h.created_at from hits h order by h.created_at desc limit v_n) x)
      into v_total, v_items;
    v_out := v_out || jsonb_build_object('documents', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'carriers' = any(groups) then
    with hits as (
      select a.* from public.agencies a
       where public.search_doc(concat_ws(' ', a.name, a.association)) like all (v_pats)
    )
    select (select count(*) from (select 1 from hits limit 101) capped), (select coalesce(jsonb_agg(x order by x.title), '[]'::jsonb) from (
             select h.id, h.name as title, h.association from hits h order by h.name limit v_n) x)
      into v_total, v_items;
    v_out := v_out || jsonb_build_object('carriers', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  return v_out;
end $function$;
