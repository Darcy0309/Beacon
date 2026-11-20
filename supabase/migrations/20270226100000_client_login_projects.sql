-- Which of a client's projects each of its logins sees (Sean, Nov 2026: "A client is the parent account that
-- should view all of the projects the client is paying for. An agent are the child accounts for the projects
-- they are assigned to by the client... so an agent should only see the projects the client is buying for
-- them"). A client login is set, on Users, to see:
--
--   all    every project of its client (as before: the parent account)
--   only   only the projects ticked for it (client_user_projects): a producer of the client's
--
-- client_project_ids() follows it, so everything a client login reaches (projects, their names, appointments,
-- documents, reports) does. Administrators set it. Safe to run more than once.

alter table public.users add column if not exists project_scope text not null default 'all';
do $$ begin
  alter table public.users add constraint users_project_scope check (project_scope in ('all', 'only'));
exception when duplicate_object then null; end $$;
-- The users table grants its columns one by one.
grant update (project_scope) on public.users to authenticated;

create table if not exists public.client_user_projects (
  user_id    bigint not null references public.users(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists client_user_projects_project on public.client_user_projects (project_id);
alter table public.client_user_projects enable row level security;
drop policy if exists client_user_projects_admin on public.client_user_projects;
create policy client_user_projects_admin on public.client_user_projects for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists client_user_projects_own on public.client_user_projects;
create policy client_user_projects_own on public.client_user_projects for select to authenticated
  using (user_id = (select public.app_user_id()));
grant select, insert, update, delete on public.client_user_projects to authenticated;

-- Only an administrator changes which projects a login sees (as its role and client account).
CREATE OR REPLACE FUNCTION public.tg_users_guard_protected_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if (new.role, new.status, new.company_id, new.auth_id, new.email, new.user_type_id, new.must_change_password, new.project_scope)
     is distinct from
     (old.role, old.status, old.company_id, old.auth_id, old.email, old.user_type_id, old.must_change_password, old.project_scope) then
    raise exception 'Only an administrator can change a user''s role, status, client account, projects or sign-in identity'
      using errcode = '42501';
  end if;
  return new;
end $function$;

-- A client login's projects: all its client's, or only those ticked for it (of its client's); either way
-- while its Signature Select is on. Projects assigned to it by name (project_assignments) as before.
create or replace function public.client_project_ids()
 returns setof bigint
 language sql stable security definer set search_path = public as $$
  with me as (
    select u.id, coalesce(u.project_scope, 'all') as scope from public.users u where u.id = public.app_user_id()
  )
  select p.id from public.projects p, me
  where me.scope = 'all' and p.company_id = public.app_company_id() and p.deleted_at is null
    and not public.select_access_ended(p.company_id)
  union
  select p.id from public.client_user_projects cup
    join me on me.id = cup.user_id and me.scope = 'only'
    join public.projects p on p.id = cup.project_id
  where p.company_id = public.app_company_id() and p.deleted_at is null
    and not public.select_access_ended(p.company_id)
  union
  select pa.project_id from public.project_assignments pa
  where pa.cl_user_id = public.app_user_id()
    and exists (select 1 from public.projects p where p.id = pa.project_id and p.deleted_at is null
                 and not public.select_access_ended(p.company_id));
$$;

-- What a client login sees beyond its projects (its client's own records: goals, removal requests): only a
-- login that sees all its client's projects.
create or replace function public.client_sees_all()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.project_scope = 'all' from public.users u where u.id = public.app_user_id()), true);
$$;
grant execute on function public.client_sees_all() to authenticated;

-- Appointment updates, documents and removal requests: a login kept to some projects sees those projects' only.
drop policy if exists appointment_updates_read on public.appointment_updates;
create policy appointment_updates_read on public.appointment_updates for select to authenticated
  using ((select public.is_staff())
         or (company_id = (select public.app_company_id()) and ((select public.client_sees_all()) or project_id in (select public.client_project_ids()))));
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using ((select public.is_staff())
         or (company_id = (select public.app_company_id()) and (select public.client_sees_all()))
         or project_id in (select public.client_project_ids()));
drop policy if exists client_removals_read on public.client_removals;
create policy client_removals_read on public.client_removals for select
  using ((select public.is_staff())
         or (company_id = (select public.app_company_id())
             and ((select public.client_sees_all())
                  or exists (select 1 from public.leads l where l.id = lead_id and l.project_id in (select public.client_project_ids())))));

create or replace function public.lead_client_updates(p_lead_id bigint)
 RETURNS TABLE(id bigint, appointment_id bigint, status text, previous_status text, note text, potential_premium numeric, sold_lines jsonb, total_premium numeric, created_at timestamp with time zone, by_name text, by_client boolean, appt_date date, appt_time text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x.id, x.appointment_id, x.status, x.previous_status, x.note, x.potential_premium, x.sold_lines, x.total_premium, x.created_at,
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.role = 'client', a.appt_date, a.appt_time
    from public.appointment_updates x
    left join public.users u on u.id = x.created_by
    left join public.appointments a on a.id = x.appointment_id
   where x.lead_id = p_lead_id
     and public.app_user_id() is not null
     and (public.is_staff()
          or (x.company_id = public.app_company_id() and (public.client_sees_all() or x.project_id in (select public.client_project_ids()))))
   order by x.created_at desc, x.id desc
   limit 300;
$function$;

-- Taking names off: a client login, only names on the projects it sees.
CREATE OR REPLACE FUNCTION public.mark_names(p_ids bigint[], p_reason text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role    text := public.app_role();
  v_company bigint := public.app_company_id();
  v_me      bigint := public.app_user_id();
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_label   text := case p_reason when 'deletion' then 'Deletion' when 'dont_call' then 'Don''t call' else 'Current customer' end;
  v_stamp   text := public.note_stamp();
  v_by      text;
  r         public.call_results;
  l         record;
  v_marked  int := 0;
  v_kept    int := 0;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'client') then
    raise exception 'Only a client''s people, administrators and account managers can take names off' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('deletion', 'dont_call', 'current_customer') then
    raise exception 'Choose why these names come off' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Choose the names to take off' using errcode = '22023';
  end if;
  if array_length(p_ids, 1) > 5000 then
    raise exception 'Take off up to 5,000 names at a time' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), email) into v_by from public.users where id = v_me;

  for l in
    select x.id, x.project_id, x.result_id, p.company_id, public.project_type_code(x.project_id) as kind, cr.effect
      from public.leads x
      join public.projects p on p.id = x.project_id
      join public.call_results cr on cr.id = x.result_id
     where x.id = any(p_ids) and x.deleted_at is null
     order by x.id
       for update of x
  loop
    -- A client login: its client's names, on the projects it sees (Nov 2026: a login kept to some projects).
    if v_role = 'client' and (l.company_id is distinct from v_company or l.project_id not in (select public.client_project_ids())) then
      raise exception 'Those names are not on your lists' using errcode = '42501';
    end if;
    if l.effect not in ('none', 'pending', 'correct_xdate') then
      v_kept := v_kept + 1;
      continue;
    end if;
    select * into r from public.call_results
     where project_type = l.kind and applies_to = 'name' and client_removal = p_reason
     order by sort_order limit 1;
    if not found then
      raise exception 'No call result to mark these names with' using errcode = 'P0002';
    end if;
    if l.result_id is distinct from r.id then
      update public.leads
         set result_id = r.id,
             status_id = coalesce((select s.id from public.lead_statuses s where s.code = r.status_code), status_id),
             resolved_at = coalesce(resolved_at, now())
       where id = l.id;
    end if;
    perform public.add_name_note(l.id, v_stamp || ' Taken off the list by ' || coalesce(v_by, 'the client') || ': ' || v_label
                                      || coalesce(' (' || v_note || ')', '') || '.');
    update public.client_removals
       set reason = p_reason, note = coalesce(v_note, note), removed_by = v_me
     where lead_id = l.id;
    v_marked := v_marked + 1;
  end loop;
  return jsonb_build_object('marked', v_marked, 'kept', v_kept, 'reason', v_label);
end $function$;

notify pgrst, 'reload schema';
