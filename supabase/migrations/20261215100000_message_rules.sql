-- Who may message whom (Sean, Oct 2026): sending to everyone in a role (all
-- clients, all agents…) is an administrator's alone; an account manager sends
-- to the projects they are on (the client's people and the project's reps)
-- and to particular people (any administrator or manager, and the clients and
-- agents on their own projects); and the administrators get a copy of
-- whatever a manager sends to clients or agents.
--
--   project_people(project)      who is on a project: its client's people and its reps
--   message_projects()           the projects the caller may send to, each with its people
--   send_notification(…, p_projects)   checks the above, and sends the copies
--
-- Administrators and account managers. Safe to run more than once. Run it
-- before the code that goes with it is pushed (the code before it keeps
-- working with it).

create or replace function public.project_people(p_project bigint) returns setof bigint
language sql stable security definer set search_path = public as $$
  select u.id from public.users u
   where u.status = 'active'
     and ((u.role = 'client' and u.company_id is not null
           and u.company_id = (select p.company_id from public.projects p where p.id = p_project and p.deleted_at is null))
       or u.id in (select pa.ae_user_id from public.project_assignments pa where pa.project_id = p_project
                   union select pa.cl_user_id from public.project_assignments pa where pa.project_id = p_project))
$$;
revoke execute on function public.project_people(bigint) from public, anon, authenticated;

/** The projects the caller may send a message to (every active one for an administrator, a manager's own), with who is on each. */
create or replace function public.message_projects() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_admin boolean := public.app_role() = 'admin';
begin
  if not public.is_manager() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'label', public.project_label(p.id),
                                        'people', coalesce((select jsonb_agg(x) from public.project_people(p.id) x where x <> v_me), '[]'::jsonb))
                     order by public.project_label(p.id))
      from public.projects p
     where p.deleted_at is null
       and p.status_id = (select id from public.project_statuses where name = 'Active')
       and (v_admin or exists (select 1 from public.project_assignments pa where pa.project_id = p.id and pa.ae_user_id = v_me))), '[]'::jsonb);
end $$;
revoke execute on function public.message_projects() from public, anon;
grant execute on function public.message_projects() to authenticated;

drop function if exists public.send_notification(bigint[], text[], text, text, text);
create or replace function public.send_notification(
  p_user_ids bigint[],
  p_roles    text[],
  p_title    text,
  p_body     text,
  p_link     text default null,
  p_projects bigint[] default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me     bigint := public.app_user_id();
  v_admin  boolean := public.app_role() = 'admin';
  v_batch  uuid := gen_random_uuid();
  v_sent   int;
  v_title  text := btrim(coalesce(p_title, ''));
  v_body   text := nullif(btrim(coalesce(p_body, '')), '');
  v_link   text := nullif(btrim(coalesce(p_link, '')), '');
  v_to     bigint[];
  v_names  text;
  v_n      int;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can send notifications'
      using errcode = '42501';
  end if;
  if length(v_title) = 0 then
    raise exception 'A title is required' using errcode = '22023';
  end if;
  if v_link is not null and v_link !~ '^/([^/\\[:space:][:cntrl:]][^[:space:][:cntrl:]]*)?$' then
    raise exception 'Links must point inside Lighthouse, like /leads/123' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_roles, '{}')) > 0 and not v_admin then
    raise exception 'Only administrators can send to everyone in a role' using errcode = '42501';
  end if;
  if not v_admin and exists (
       select 1 from unnest(coalesce(p_projects, '{}')) as pid
        where not exists (select 1 from public.project_assignments pa where pa.project_id = pid and pa.ae_user_id = v_me)) then
    raise exception 'You can send to the projects you are on only' using errcode = '42501';
  end if;
  -- A manager's clients and agents are those on their own projects.
  if not v_admin and exists (
       select 1 from public.users u
        where u.id = any(coalesce(p_user_ids, '{}')) and u.role in ('client', 'agent')
          and u.id not in (select public.project_people(pa.project_id) from public.project_assignments pa where pa.ae_user_id = v_me)) then
    raise exception 'You can message the clients and agents on your own projects only' using errcode = '42501';
  end if;

  v_to := array(
    select distinct x from (
      select u.id as x from public.users u where u.id = any(coalesce(p_user_ids, '{}')) or u.role = any(coalesce(p_roles, '{}'))
      union
      select public.project_people(pid) from unnest(coalesce(p_projects, '{}')) as pid
    ) t where x is not null);

  v_sent := public.notify_users(v_to, 'message', v_title, v_body, v_link, null, v_batch);

  -- A manager's message to clients or agents: a copy to each administrator, saying who it went to.
  if not v_admin and v_sent > 0 and exists (select 1 from public.users u where u.id = any(v_to) and u.role in ('client', 'agent') and u.id <> v_me) then
    select string_agg(nm, ', '), count(*) into v_names, v_n
      from (select coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), u.email) as nm
              from public.users u where u.id = any(v_to) and u.id <> v_me and u.status = 'active'
             order by u.first_name, u.last_name limit 12) s;
    v_n := (select count(*) from public.users u where u.id = any(v_to) and u.id <> v_me and u.status = 'active');
    perform public.notify_users(
      array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and not (u.id = any(v_to))),
      'message', left('[Copy] ' || v_title, 160),
      left('Sent to ' || v_names || case when v_n > 12 then ' and ' || (v_n - 12) || ' more' else '' end || '.'
           || coalesce(E'\n\n' || v_body, ''), 1000),
      v_link, null, null);
  end if;

  return jsonb_build_object('batch', v_batch, 'sent', v_sent);
end $$;
revoke execute on function public.send_notification(bigint[], text[], text, text, text, bigint[]) from public, anon;
grant execute on function public.send_notification(bigint[], text[], text, text, text, bigint[]) to authenticated;
