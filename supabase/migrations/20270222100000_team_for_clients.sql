-- Meet the Team for a client (Sean, Nov 2026: "only show them the team/managers that are assigned to their
-- projects. I don't want clients to see how many callers we have or see the manager names that aren't
-- associated with their projects"). A client's team_directory() is the people assigned to their projects
-- and their Sales Rep, each with what they do on their projects (and "Sales Rep"); no one else. Their
-- team_spotlight() is empty: it names the team's top people, theirs or not. Staff see what they did before.
-- works_with_client() counts their Sales Rep too, so a client can message and thank the people they see.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.team_directory()
 RETURNS TABLE(id bigint, name text, role text, photo_path text, bio text, mine boolean, does text, since date, status text, last_call timestamp with time zone, kudos bigint, birthday_today boolean, gifts_today bigint, leads_month bigint, appts_month bigint, leads_total bigint, appts_total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    select public.app_user_id() as uid, public.app_role() as role, public.business_tz() as tz
  ), day as (
    select (now() at time zone me.tz)::date as today, date_trunc('month', now() at time zone me.tz) as month_start, me.tz from me
  ), staff as (
    select u.* from public.users u, me
     where me.uid is not null and u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
       -- A client sees only their own team (Sean, Nov 2026): those assigned to their projects, and their Sales Rep;
       -- not how many callers there are, nor managers who aren't on their projects.
       and (me.role <> 'client'
            or u.id in (select pa.ae_user_id from public.project_assignments pa
                         where pa.project_id in (select public.client_project_ids()))
            or u.id in (select c.sales_rep_id from public.companies c where c.id = public.app_company_id()))
  ), theirs as (
    select p.id from public.projects p, me where me.role = 'client' and p.id in (select public.client_project_ids())
  ), rep as (
    -- A client's Sales Rep (Sean, Nov 2026): on their team with those on their projects.
    select c.sales_rep_id as uid from public.companies c, me where me.role = 'client' and c.id = public.app_company_id()
  ), kinds as (
    -- What each does: on a client's own projects, for a client (Nov 2026); on any, for staff.
    select pa.ae_user_id as uid, bool_or(t.code = 'DBDV') as dbdv, bool_or(t.code = 'APPT') as appt
      from public.project_assignments pa join public.projects p on p.id = pa.project_id and p.deleted_at is null
      join public.project_types t on t.id = p.project_type_id
      cross join me
     where me.role <> 'client' or p.id in (select id from theirs)
     group by 1
  ), calls as (
    select c.user_id, max(c.call_date) as last_call from public.call_records c, day
     where c.call_date >= (day.today::timestamp at time zone day.tz) group by 1
  ), dev as (
    select e.user_id,
           count(*) filter (where e.kind = 'lead' and e.created_at >= (day.month_start at time zone day.tz)) as leads_month,
           count(*) filter (where e.kind = 'appointment' and e.created_at >= (day.month_start at time zone day.tz)) as appts_month,
           count(*) filter (where e.kind = 'lead') as leads_total,
           count(*) filter (where e.kind = 'appointment') as appts_total
      from public.pay_events e, day, me
     where e.kind in ('lead', 'appointment') and not e.is_chargeback
       and (me.role <> 'client' or e.project_id in (select id from theirs))
       and (me.role = 'client' or e.created_at >= (day.month_start at time zone day.tz))
     group by 1
  ), k as (
    select to_user, count(*) filter (where kind = 'thanks') as thanks,
           count(*) filter (where kind = 'birthday' and created_at >= (day.today::timestamp at time zone day.tz)) as gifts_today
      from public.kudos, day group by 1
  )
  select s.id, nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.role, s.photo_path, s.bio,
         me.role = 'client',
         case when me.role = 'client' then
                -- A client's team: what each does on their projects, and their Sales Rep.
                nullif(concat_ws(' · ',
                  case when kd.dbdv and kd.appt then 'Lead development & appointment setting'
                       when kd.appt then 'Appointment setting' when kd.dbdv then 'Lead development' end,
                  case when s.id in (select uid from rep) then 'Sales Rep' end), '')
              when s.role = 'admin' then 'Administration'
              when kd.dbdv and kd.appt then 'Lead development & appointment setting'
              when kd.appt then 'Appointment setting' when kd.dbdv then 'Lead development' end,
         s.created_at::date,
         case when c.last_call > now() - interval '15 minutes' then 'calling'
              when c.last_call is not null or (s.last_login at time zone day.tz)::date = day.today then 'active'
              else 'away' end,
         c.last_call, coalesce(k.thanks, 0), public.birthday_on(s.birthday, day.today), coalesce(k.gifts_today, 0),
         coalesce(d.leads_month, 0), coalesce(d.appts_month, 0),
         case when me.role = 'client' then coalesce(d.leads_total, 0) end,
         case when me.role = 'client' then coalesce(d.appts_total, 0) end
    from staff s cross join me cross join day
    left join kinds kd on kd.uid = s.id
    left join calls c on c.user_id = s.id
    left join dev d on d.user_id = s.id
    left join k on k.to_user = s.id
   order by 6 desc, 12 desc, s.first_name, s.last_name;
$function$;

CREATE OR REPLACE FUNCTION public.team_spotlight()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with z as (
    select public.business_tz() as tz,
           (date_trunc('week', now() at time zone public.business_tz()))::timestamp at time zone public.business_tz() as since
  ), people as (
    select u.id, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.photo_path
      from public.users u where u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
  ), ev as (
    select e.user_id, count(*) filter (where e.kind = 'appointment') as appts, count(*) filter (where e.kind = 'lead') as leads
      from public.pay_events e, z where e.created_at >= z.since and not e.is_chargeback and e.kind in ('lead', 'appointment')
     group by 1
  ), ca as (
    select c.user_id, count(*) as calls from public.call_records c, z where c.call_date >= z.since group by 1
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
              -- Not for a client (Sean, Nov 2026): it names the team's top people, theirs or not.
              when public.app_role() = 'client' then null
              else coalesce((select jsonb_object_agg(what, jsonb_build_object('id', id, 'name', name, 'photo', photo_path, 'count', n)) from best), '{}'::jsonb) end;
$function$;

CREATE OR REPLACE FUNCTION public.works_with_client(p_user_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.pay_events e where e.user_id = p_user_id and not e.is_chargeback
                    and e.project_id in (select public.client_project_ids()))
      or exists (select 1 from public.project_assignments pa where pa.ae_user_id = p_user_id
                    and pa.project_id in (select public.client_project_ids()))
      -- Their Sales Rep (Nov 2026): on their team, to message and thank.
      or exists (select 1 from public.companies c where c.id = public.app_company_id() and c.sales_rep_id = p_user_id);
$function$;

notify pgrst, 'reload schema';
