-- ---------------------------------------------------------------------------
-- Lighthouse CRM — Recent Activity by campaign (Sean, Oct 2026)
--
-- A client's Recent Activity filtered by project now takes a campaign: the
-- project chosen with those tied to it (a DB dev project and the
-- appointment project it promotes to), so the leads developed and the
-- appointments set on them show together.
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

-- Recent Activity, as before; its project now a campaign (the row it returns is the same, but made again to be sure).
drop function if exists public.client_activity(date, date, bigint, text, bigint);
create function public.client_activity(p_from date, p_to date, p_project_id bigint default null,
  p_kind text default null, p_company_id bigint default null)
returns table (id bigint, at timestamptz, kind text, result text, lead_id bigint, company text, city text, state text,
  project_id bigint, project text, agent text, manager text, xdate date, manager_id bigint)
language sql stable security definer set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), mine as (
    select p.id from public.projects p
     where p.deleted_at is null
       and (case when public.is_staff() then (p_company_id is null or p.company_id = p_company_id)
                 else p.id in (select public.client_project_ids()) end)
       -- A campaign (Sean, Oct 2026): the project chosen and those tied to it, a DB dev project and the
       -- appointment project it promotes to, either way round.
       and (p_project_id is null or p.id = p_project_id or p.appt_project_id = p_project_id
            or p.id = (select x.appt_project_id from public.projects x where x.id = p_project_id))
  )
  select e.id, e.created_at, e.kind,
         case when e.kind = 'lead' then 'Lead'
              when ap.invalid_at is not null then 'Appointment-Invalid'
              when ap.confirmed_at is not null then 'Appointment-Confirmed'
              else 'Appointment' end,
         l.id, l.company_name, l.city, l.state, pr.id, pr.name,
         coalesce(nullif(btrim(ap.rep_name), ''), nullif(btrim(pr.contact_name), '')),
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''),
         (select min(coalesce(i.ultimate_xdate, least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                                      i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate)))
            from public.insurance_details i where i.lead_id = l.id),
         case when u.status = 'active' then u.id end
    from public.pay_events e
    join public.leads l on l.id = e.lead_id and l.deleted_at is null
    join public.projects pr on pr.id = coalesce(e.project_id, l.project_id)
    left join public.appointments ap on ap.id = e.appointment_id
    left join public.users u on u.id = e.user_id, z
   where public.app_user_id() is not null
     and pr.id in (select id from mine)
     and e.kind in ('lead', 'appointment') and not e.is_chargeback
     and (p_kind is null or e.kind = p_kind)
     and e.created_at >= (p_from::timestamp at time zone z.tz)
     and e.created_at < ((p_to + 1)::timestamp at time zone z.tz)
     and (e.kind = 'lead' or coalesce(ap.qa_status, 'passed') = 'passed')
   order by e.created_at desc, e.id desc
   limit 1000;
$$;
revoke execute on function public.client_activity(date, date, bigint, text, bigint) from public, anon;
grant execute on function public.client_activity(date, date, bigint, text, bigint) to authenticated;

notify pgrst, 'reload schema';
