-- ---------------------------------------------------------------------------
-- Lighthouse CRM — internal notes for administrators and managers only
-- (Sean, Oct 2026: "Agents should only see client notes")
--
--   lead_notes          a lead's internal notes: administrators and account
--                       managers read and write them; agents and clients
--                       neither.
--   call_records.notes  what was said on a call: no one signed in reads the
--                       column directly any more (agents still read the
--                       calls themselves, for QA and the history);
--                       administrators and managers read it through
--                       call_notes(). record_call_result() still writes it.
-- ---------------------------------------------------------------------------

/** Administrators and account managers: those who see a lead's internal notes and its call notes. */
create or replace function public.sees_internal_notes()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin', 'manager'), false);
$$;
revoke execute on function public.sees_internal_notes() from public, anon;
grant execute on function public.sees_internal_notes() to authenticated;

drop policy if exists lead_notes_staff on public.lead_notes;
drop policy if exists lead_notes_managers on public.lead_notes;
create policy lead_notes_managers on public.lead_notes
  for all to authenticated
  using ((select public.sees_internal_notes())) with check ((select public.sees_internal_notes()));

-- Call records: every column but the notes.
revoke select on public.call_records from anon, authenticated;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'call_records' and column_name <> 'notes';
  execute format('grant select (%s) on public.call_records to authenticated', v_cols);
end $$;
comment on column public.call_records.notes is
  'What was said on the call: internal. Not readable directly; administrators and managers read it through call_notes(). A column added to call_records must be granted: grant select (<column>) on public.call_records to authenticated.';

/** The notes on a lead's calls, for administrators and managers; nothing for anyone else. */
create or replace function public.call_notes(p_lead_id bigint)
returns table (id bigint, notes text)
language sql stable security definer set search_path = public as $$
  select c.id, c.notes
    from public.call_records c
   where c.lead_id = p_lead_id and c.notes is not null and public.sees_internal_notes();
$$;
revoke execute on function public.call_notes(bigint) from public, anon;
grant execute on function public.call_notes(bigint) to authenticated;
