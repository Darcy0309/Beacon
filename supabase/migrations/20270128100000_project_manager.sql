-- A project's manager, changed from the Projects list (client, Nov 2026: pick another account manager in
-- the Manager column, confirm, done). set_project_manager() puts that person on the project in place of
-- the account managers (and administrators) on it now; the agents working it stay. The project's names
-- still to call are then shared out again, in the same transaction, as set_project_rep() does.
--
-- Safe to run more than once.

create or replace function public.set_project_manager(p_project_id bigint, p_user_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user public.users;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can change who manages a project' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project_id and deleted_at is null for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'That person no longer has an account' using errcode = 'P0002';
  end if;
  if v_user.role not in ('admin', 'manager') then
    raise exception 'Only an account manager or administrator can manage a project' using errcode = '22023';
  end if;
  if v_user.status is distinct from 'active' then
    raise exception '% cannot manage a project until their account is active',
      coalesce(nullif(concat_ws(' ', v_user.first_name, v_user.last_name), ''), v_user.email) using errcode = '22023';
  end if;

  -- The managers on it now come off (a row that also links a client contact keeps that link); agents stay.
  update public.project_assignments pa set ae_user_id = null
    from public.users u
   where pa.project_id = p_project_id and u.id = pa.ae_user_id and u.id <> p_user_id
     and u.role in ('admin', 'manager') and pa.cl_user_id is not null;
  delete from public.project_assignments pa
   using public.users u
   where pa.project_id = p_project_id and u.id = pa.ae_user_id and u.id <> p_user_id
     and u.role in ('admin', 'manager');

  insert into public.project_assignments (project_id, ae_user_id)
  select p_project_id, p_user_id
   where not exists (select 1 from public.project_assignments
                      where project_id = p_project_id and ae_user_id = p_user_id);

  return public.distribute_names(p_project_id);
end $$;
revoke execute on function public.set_project_manager(bigint, bigint) from public, anon;
grant execute on function public.set_project_manager(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
