-- ---------------------------------------------------------------------------
-- Lighthouse CRM — speed (Oct 2026)
--
-- Measured on a copy with 100,000 names, 400,000 calls and 8,000
-- appointments, these were what made pages slow; each returns exactly what
-- it did before:
--
--   work_projects()      My Projects, a call list, a lead sheet: 27 s (over
--                        the API's 8 s limit, so the page failed). The
--                        caller's id was looked up again for every name and
--                        every call counted; it is now read once. And an
--                        index for a manager's last call on a project.
--   xdates_by_month(),   the X-dates report and a project's renewal chart:
--   xdate_month_leads()  38 s for the whole book. Each name's renewal date
--                        came from a function called once a name; it is now
--                        read in the same pass, from its index.
--   the leads list       newest first: 1.9 s. Without an index in that order
--                        the database joined every name's project, result,
--                        manager and coverage before keeping a page of them.
--
-- Indexes and functions only: no data changes. Safe to run again.
-- ---------------------------------------------------------------------------

-- The leads list and a project's names, newest first (deleted names are never listed).
create index if not exists leads_lead_date_idx
  on public.leads (lead_date desc nulls last, id desc) where deleted_at is null;

-- A manager's last call on a project (My Projects' "last worked").
create index if not exists call_records_project_user_date
  on public.call_records (project_id, user_id, call_date desc);

-- My Projects. `me` is materialized: read once, not again for each row counted.
create or replace function public.work_projects()
returns table (
  id bigint, name text, client text, company_id bigint, type text, timezone text,
  state text, status text, appt_project_id bigint,
  names_left bigint,       -- the caller's names still to call
  names_left_all bigint,   -- everyone's (what an administrator watches)
  follow_ups bigint,       -- the caller's upcoming appointments waiting to be confirmed
  last_worked timestamptz  -- the caller's last call on the project
)
language sql stable security invoker set search_path = public as $$
  with me as materialized (select public.app_user_id() as uid, coalesce(public.is_admin(), false) as admin)
  select p.id, p.name, co.name, p.company_id, t.code, tz.name, p.state, ps.name, p.appt_project_id,
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and l.assigned_user_id = me.uid and r.viable and r.callable),
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p.id and r.viable and r.callable),
         (select count(*) from public.appointments a
           where a.set_project_id = p.id and a.user_id = me.uid and a.confirmed_at is null and a.invalid_at is null
             and a.appt_date >= current_date - 1),
         (select max(c.call_date) from public.call_records c where c.project_id = p.id and c.user_id = me.uid)
    from public.projects p
    cross join me
    left join public.companies co        on co.id = p.company_id
    left join public.project_types t     on t.id = p.project_type_id
    left join public.timezones tz        on tz.id = p.timezone_id
    left join public.project_statuses ps on ps.id = p.status_id
   where me.uid is not null
     and (me.admin or exists (select 1 from public.project_assignments pa
                               where pa.project_id = p.id and pa.ae_user_id = me.uid))
   order by p.name;
$$;
grant execute on function public.work_projects() to authenticated;

-- X-dates by month: lead_renewal_date() and lead_xdate_bucket() written in place, so they run in the same pass.
create or replace function public.xdates_by_month(p_project_id bigint default null, p_company_id bigint default null)
returns table (month int, total bigint, appointments bigint, off_list bigint, viable_left bigint)
language sql stable security invoker set search_path = public as $$
  with x as (
    select coalesce(extract(month from ren.renewal)::int, 0) as m,
           case when r.effect in ('appointment', 'confirm') then 'appointment'
                when r.viable then 'viable'
                else 'off' end as bucket
      from public.leads l
      join public.call_results r on r.id = l.result_id
      left join public.projects p on p.id = l.project_id
      left join lateral (
        select min(coalesce(i.ultimate_xdate,
                            least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                  i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
          from public.insurance_details i where i.lead_id = l.id
      ) ren on true
     where (p_project_id is null or l.project_id = p_project_id)
       and (p_company_id is null or p.company_id = p_company_id)
  )
  select m, count(*),
         count(*) filter (where bucket = 'appointment'),
         count(*) filter (where bucket = 'off'),
         count(*) filter (where bucket = 'viable')
    from x
   group by m
   order by m;
$$;
revoke execute on function public.xdates_by_month(bigint, bigint) from public, anon;
grant execute on function public.xdates_by_month(bigint, bigint) to authenticated;

-- One page of the names behind a number in xdates_by_month(); p_bucket null means all of them.
create or replace function public.xdate_month_leads(
  p_month int, p_bucket text default null, p_project_id bigint default null, p_company_id bigint default null,
  p_limit int default 20, p_offset int default 0
)
returns table (
  id bigint, company_name text, contact_name text, phone text, city text, state text,
  project text, result text, renewal_date date, rep_first text, rep_last text, rep_email text, total bigint
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.company_name, l.contact_name, l.phone, l.city, l.state,
         p.name, r.name, x.renewal, u.first_name, u.last_name, u.email, count(*) over ()
    from public.leads l
    join public.call_results r on r.id = l.result_id
    left join public.projects p on p.id = l.project_id
    left join public.users u on u.id = l.assigned_user_id
    left join lateral (
      select min(coalesce(i.ultimate_xdate,
                          least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
        from public.insurance_details i where i.lead_id = l.id
    ) x on true
   where (p_project_id is null or l.project_id = p_project_id)
     and (p_company_id is null or p.company_id = p_company_id)
     and coalesce(extract(month from x.renewal)::int, 0) = p_month
     and (p_bucket is null or (case when r.effect in ('appointment', 'confirm') then 'appointment'
                                    when r.viable then 'viable'
                                    else 'off' end) = p_bucket)
   order by extract(day from x.renewal) nulls last, l.company_name, l.id
   limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.xdate_month_leads(int, text, bigint, bigint, int, int) from public, anon;
grant execute on function public.xdate_month_leads(int, text, bigint, bigint, int, int) to authenticated;

analyze public.leads;
analyze public.call_records;

notify pgrst, 'reload schema';
