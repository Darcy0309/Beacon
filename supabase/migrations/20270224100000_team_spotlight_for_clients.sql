-- Meet the Team's Spotlight for a client, on their own projects (Sean, Nov 2026: "Can it be set to only show
-- the stats for the managers on that specific client? I'd prefer not to show a client totals for a manager
-- across all clients"). For a client, the week's most appointments, leads and calls count only what was done
-- on their projects, by the people on their team (those assigned to their projects, and their Sales Rep);
-- a kind no one has done for them this week says so. Staff see the whole team's week, as before.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.team_spotlight()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with z as (
    select public.business_tz() as tz,
           (date_trunc('week', now() at time zone public.business_tz()))::timestamp at time zone public.business_tz() as since,
           public.app_role() = 'client' as client
  ), theirs as (
    -- A client's projects (none for staff: theirs is everyone's).
    select p.id from public.projects p, z where z.client and p.id in (select public.client_project_ids())
  ), people as (
    select u.id, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.photo_path
      from public.users u, z
     where u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
       -- A client's team only: those assigned to their projects, and their Sales Rep.
       and (not z.client
            or u.id in (select pa.ae_user_id from public.project_assignments pa where pa.project_id in (select id from theirs))
            or u.id in (select c.sales_rep_id from public.companies c where c.id = public.app_company_id()))
  ), ev as (
    select e.user_id, count(*) filter (where e.kind = 'appointment') as appts, count(*) filter (where e.kind = 'lead') as leads
      from public.pay_events e, z
     where e.created_at >= z.since and not e.is_chargeback and e.kind in ('lead', 'appointment')
       and (not z.client or e.project_id in (select id from theirs))
     group by 1
  ), ca as (
    select c.user_id, count(*) as calls from public.call_records c, z
     where c.call_date >= z.since and (not z.client or c.project_id in (select id from theirs))
     group by 1
  ), top as (
    select 'appointments' as what, p.id, p.name, p.photo_path, ev.appts as n from ev join people p on p.id = ev.user_id where ev.appts > 0
    union all
    select 'leads', p.id, p.name, p.photo_path, ev.leads from ev join people p on p.id = ev.user_id where ev.leads > 0
    union all
    select 'calls', p.id, p.name, p.photo_path, ca.calls from ca join people p on p.id = ca.user_id where ca.calls > 0
  ), best as (
    select distinct on (what) what, id, name, photo_path, n from top order by what, n desc, name
  )
  select case when coalesce((select (value->>'spotlight')::boolean from public.app_settings where key = 'team'), true) is false then null
              when public.app_user_id() is null then null
              else coalesce((select jsonb_object_agg(what, jsonb_build_object('id', id, 'name', name, 'photo', photo_path, 'count', n)) from best), '{}'::jsonb) end;
$function$;

notify pgrst, 'reload schema';
