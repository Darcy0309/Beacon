-- Deleting a lead project, and the names it sent on (Sean, Nov 2026: "removes the lists from the lead project
-- I delete and also pulls out those names from the appt project"): a DB dev project's names promoted to its
-- appointment project (as leads or appointments) stay there when the DB dev project is deleted. Asked to, they
-- go with it: only those from that project (each lead keeps the project it came from, source_project_id), never
-- the names other DB dev projects sent to the same appointment project. They go as the project's own names do,
-- with their appointments, marked as taken by it, so restoring the project under Settings › Deleted records
-- brings them back too. Calls made and pay earned stay as they are.
--
--   project_sent_counts(ids)   how many names each DB dev project has on another project now (for the delete box)
--   remove_sent_names(id)      takes them off with the (deleted) project
--
-- Safe to run more than once.

/** How many of each project's names it sent on are on another project now, not deleted. */
create or replace function public.project_sent_counts(p_ids bigint[])
returns table (project_id bigint, sent bigint)
language sql stable security invoker set search_path = public as $$
  select l.source_project_id, count(*)
    from public.leads l
   where l.source_project_id = any(p_ids)
     and l.project_id is distinct from l.source_project_id
     and l.deleted_at is null
   group by l.source_project_id
$$;
revoke execute on function public.project_sent_counts(bigint[]) from public, anon;
grant execute on function public.project_sent_counts(bigint[]) to authenticated;

/**
 * Takes the names p_project sent on to another project off with it (it is deleted, or being deleted): each
 * lead and its appointments, marked as gone with the project. Returns how many names.
 */
create or replace function public.remove_sent_names(p_project bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me  bigint := public.app_user_id();
  v_now timestamptz := now();
  v_via text := 'projects:' || p_project;
  v_n   integer;
begin
  if not (public.is_manager() and public.mfa_satisfied()) then
    raise exception 'Only an administrator can delete a project' using errcode = '42501';
  end if;
  update public.appointments a set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
   where a.deleted_at is null
     and a.lead_id in (select l.id from public.leads l
                        where l.source_project_id = p_project and l.project_id is distinct from p_project and l.deleted_at is null);
  update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
   where source_project_id = p_project and project_id is distinct from p_project and deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.remove_sent_names(bigint) from public, anon;
grant execute on function public.remove_sent_names(bigint) to authenticated;
