-- Deleting a client (Sean, Nov 2026: "How do I delete clients? I deleted projects, but don't see a way"): the
-- client's page has Delete now. It already took the client's projects, names and appointments with it; its own
-- people's logins now go too (disabled, so they can't sign in to an empty account), each back as it was when the
-- client is restored. Its deletion lists, goals and other settings stay with it, hidden, for a restore.
--
-- Safe to run more than once.

alter table public.users add column if not exists status_before_delete text;

CREATE OR REPLACE FUNCTION public.tg_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me    bigint := public.app_user_id();
  v_now   timestamptz := now();
  v_via   text := tg_table_name || ':' || old.id;
  v_other text;
begin
  if old.deleted_at is not null then
    return null;
  end if;

  if tg_table_name = 'projects' then
    -- Leads promoted from a DB dev project would land on a project nobody can see.
    select p.name into v_other from public.projects p
     where p.appt_project_id = old.id and p.id <> old.id and p.deleted_at is null limit 1;
    if v_other is not null then
      raise exception '% promotes its leads to this project. Delete that project first, or have it promote to another.', v_other
        using errcode = '23503';
    end if;
    update public.appointments a set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where a.deleted_at is null
       and a.lead_id in (select l.id from public.leads l where l.project_id = old.id and l.deleted_at is null);
    update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where project_id = old.id and deleted_at is null;
    update public.projects set deleted_at = v_now, deleted_by = v_me, deleted_via = null where id = old.id;

  elsif tg_table_name = 'companies' then
    update public.appointments a set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where a.deleted_at is null
       and a.lead_id in (select l.id from public.leads l join public.projects p on p.id = l.project_id
                          where p.company_id = old.id and p.deleted_at is null and l.deleted_at is null);
    update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where deleted_at is null
       and project_id in (select p.id from public.projects p where p.company_id = old.id and p.deleted_at is null);
    update public.projects set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where company_id = old.id and deleted_at is null;
    -- Its own people's logins go with it, signed out of Lighthouse; restored with it, as they were (Nov 2026).
    update public.users set status_before_delete = status, status = 'disabled', deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where company_id = old.id and role = 'client' and deleted_at is null;
    update public.companies set deleted_at = v_now, deleted_by = v_me, deleted_via = null where id = old.id;

  elsif tg_table_name = 'leads' then
    update public.appointments set deleted_at = v_now, deleted_by = v_me, deleted_via = v_via
     where lead_id = old.id and deleted_at is null;
    update public.leads set deleted_at = v_now, deleted_by = v_me, deleted_via = null where id = old.id;

  elsif tg_table_name = 'users' then
    -- The account no longer counts as active anywhere; its sign-in is removed by the app.
    update public.users set deleted_at = v_now, deleted_by = v_me, deleted_via = null, status = 'disabled' where id = old.id;

  else
    execute format('update public.%I set deleted_at = $1, deleted_by = $2, deleted_via = null where id = $3', tg_table_name)
      using v_now, v_me, old.id;
  end if;

  -- The row stays.
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.restore_record(p_table text, p_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_via  text := p_table || ':' || p_id;
  v_n    integer;
  v_held text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can restore a deleted record' using errcode = '42501';
  end if;
  if p_table not in ('companies', 'projects', 'leads', 'appointments', 'agencies', 'documents', 'bulletin_board', 'users') then
    raise exception 'Not a kind of record that can be restored' using errcode = '22023';
  end if;

  if p_table = 'projects' then
    select c.name into v_held from public.projects p join public.companies c on c.id = p.company_id
     where p.id = p_id and c.deleted_at is not null;
    if v_held is not null then
      raise exception 'Its client, %, is deleted. Restore the client first.', v_held using errcode = '23503';
    end if;
  elsif p_table = 'leads' then
    select p.name into v_held from public.leads l join public.projects p on p.id = l.project_id
     where l.id = p_id and p.deleted_at is not null;
    if v_held is not null then
      raise exception 'Its project, %, is deleted. Restore the project first.', v_held using errcode = '23503';
    end if;
  elsif p_table = 'appointments' then
    select l.company_name into v_held from public.appointments a join public.leads l on l.id = a.lead_id
     where a.id = p_id and l.deleted_at is not null;
    if v_held is not null then
      raise exception 'Its lead, %, is deleted. Restore the lead first.', v_held using errcode = '23503';
    end if;
  end if;

  -- Only what was deleted in its own right: what went with something comes back with that.
  execute format('update public.%I set deleted_at = null, deleted_by = null where id = $1 and deleted_at is not null and deleted_via is null', p_table)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;

  update public.projects set deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  update public.leads set deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  update public.appointments set deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  update public.users set status = coalesce(status_before_delete, status), status_before_delete = null,
         deleted_at = null, deleted_by = null, deleted_via = null where deleted_via = v_via;
  return true;
end $function$;
