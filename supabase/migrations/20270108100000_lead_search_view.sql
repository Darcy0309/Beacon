-- Searching the lists of leads, faster (Nov 2026). Row Level Security keeps Postgres from using
-- the trigram index on leads.search_text: LIKE is not "leakproof", so it may not run before the
-- policy, and every search of the Leads list, a project's leads or a picker read the whole table
-- (170-250 ms on 300,000 leads, against under 1 ms with the index; and the count read it again).
--
--   leads_searchable   the leads a person may see, as the policy has them (signed in, past the
--                      authenticator check, and staff or one of a client's own projects; not
--                      deleted), read as its owner so the index is used. Read-only. The app reads
--                      it in place of leads when something is typed in a search box, with every
--                      other filter, the related records, the order, the page and the count as before.
--
-- Not a security barrier, so filters reach the index: a person's filters are the API's own
-- comparisons on these columns, which leak nothing; the rows that come back are only those the
-- rule lets them see. Every column of leads is theirs to read already (no column grants).
--
-- Safe to run more than once.

create or replace view public.leads_searchable as
  select l.*
    from public.leads l
   where l.deleted_at is null
     and (select public.app_user_id()) is not null
     and (select public.mfa_satisfied())
     and ((select public.is_staff()) or l.project_id in (select public.client_project_ids()));

revoke all on public.leads_searchable from public, anon;
grant select on public.leads_searchable to authenticated;

notify pgrst, 'reload schema';
