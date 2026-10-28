-- Changing call results in bulk (Sean, Oct 2026), as the old system's
-- Result Change tools did: a group of names on a project from one result to
-- another (names marked Removed back to Viable), or names picked by what
-- they are (a client wants no leads under 5 employees: those Removed).
--
--   employee_n(lead)       a name's employees as a number, to filter and sort
--                          a project's list by (a computed field: no column
--                          added, nothing rewritten)
--   change_results(ids, result)   the names given that result: no call is
--                          recorded and no pay; a note on each says what it
--                          was; names callable again are shared out to the
--                          project's reps
--
-- Administrators and account managers. Safe to run more than once.

create or replace function public.employee_n(public.leads) returns int
language sql immutable parallel safe set search_path = public as $$
  select public.employee_count($1.employees)
$$;
grant execute on function public.employee_n(public.leads) to authenticated;

create or replace function public.change_results(p_ids bigint[], p_result bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result  public.call_results;
  v_status  bigint;
  v_stamp   text := public.note_stamp();
  l         record;
  v_changed int := 0;
  v_same    int := 0;
  v_projects bigint[] := '{}';
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can change call results' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Choose the names to change' using errcode = '22023';
  end if;
  if array_length(p_ids, 1) > 5000 then
    raise exception 'Change up to 5,000 names at a time' using errcode = '22023';
  end if;
  select * into v_result from public.call_results where id = p_result;
  -- Only results that are a name's standing: one that promotes, books an appointment
  -- or charges back pay goes through a call, not here.
  if not found or v_result.applies_to is distinct from 'name' or v_result.effect not in ('none', 'pending') then
    raise exception 'Choose a call result that names can be changed to' using errcode = '22023';
  end if;
  select s.id into v_status from public.lead_statuses s where s.code = v_result.status_code;

  for l in
    select x.id, x.project_id, x.result_id, r.name as was
      from public.leads x join public.call_results r on r.id = x.result_id
     where x.id = any(p_ids) and x.deleted_at is null
     order by x.id
       for update of x
  loop
    if public.project_type_code(l.project_id) is distinct from v_result.project_type then
      raise exception '% is for % projects; these names are on a different kind', v_result.name,
        case v_result.project_type when 'APPT' then 'appointment' else 'DB dev' end using errcode = '22023';
    end if;
    if l.result_id = p_result then
      v_same := v_same + 1;
      continue;
    end if;
    update public.leads
       set result_id = p_result,
           status_id = coalesce(v_status, status_id),
           resolved_at = case when v_result.viable then null else coalesce(resolved_at, now()) end
     where id = l.id;
    perform public.add_name_note(l.id, v_stamp || ' Call result changed from ' || l.was || ' to ' || v_result.name || '.');
    v_changed := v_changed + 1;
    if not (l.project_id = any(v_projects)) then
      v_projects := v_projects || l.project_id;
    end if;
  end loop;

  -- Names back on the call lists go to the project's reps, evenly.
  if v_changed > 0 and v_result.viable and v_result.callable then
    for l in select unnest(v_projects) as project_id loop
      perform public.distribute_names(l.project_id);
    end loop;
  end if;
  return jsonb_build_object('changed', v_changed, 'same', v_same, 'result', v_result.name);
end $$;
revoke execute on function public.change_results(bigint[], bigint) from public, anon;
grant execute on function public.change_results(bigint[], bigint) to authenticated;
