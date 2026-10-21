-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the client's dashboard, top row (Sean, Oct 2026)
--
--   1  Leads Developed      every name on their projects (whatever its call
--                           result), over 1 week, 1/3/6 months or all time,
--                           and how many on each project
--   2  Appointments Set     over the same days, as a share of those leads
--   3  Appointment Results  each appointment's outcome as the client records
--                           it: Pending (until they do), Quoting, Quoted-Not
--                           Sold, Valid-Not Quoting, Invalid Appointment, Sold
--   4  Upcoming Pipeline    viable names renewing in each of the next 3 or 6
--                           months (not the one we are in)
--
-- Row two, 1  Sale Pipeline   what the client records from our appointments:
--                              premium written (sold, this year), in the pipe
--                              (quoted on those still quoting), their annual
--                              goal, and their close ratio (sold of pending,
--                              quoting, quoted-not sold and sold), with the
--                              premium written month by month, like a ticker
--
-- Administrators see 3 and 4, and the Sale Pipeline, on a client's page: the
-- same figures, for that client.
--
--   appointments.client_result     the client's outcome (null: Pending)
--   appointments.client_result_at  when they recorded it, and who:
--   appointments.client_result_by
--   client_dashboard(p_from, p_company_id)   tiles 1 to 3
--   client_pipeline(p_months, p_company_id)  tile 4
--   appointments.quoted_premium    the premium quoted, and written (sold), as
--   appointments.written_premium   the client records them
--   client_goals                   each client's premium goal for a year
--   set_client_goal(p_company_id, p_year, p_goal)   the client's, or an administrator's
--   client_sales(p_company_id)     the Sale Pipeline
--   client_activity(...)           row three, Recent Activity: the leads and
--                                  appointments developed on their projects,
--                                  as the client may see them (no pay)
--
-- Both read as the person asking (a client sees only their own projects, and
-- only the appointments QA let through). Safe to run again.
-- ---------------------------------------------------------------------------

alter table public.appointments
  add column if not exists client_result text
    check (client_result in ('pending', 'quoting', 'quoted_not_sold', 'valid_not_quoting', 'invalid', 'sold')),
  add column if not exists client_result_at timestamptz,
  add column if not exists client_result_by bigint references public.users(id) on delete set null;

alter table public.appointments
  add column if not exists quoted_premium numeric(12, 2) check (quoted_premium >= 0),
  add column if not exists written_premium numeric(12, 2) check (written_premium >= 0);

comment on column public.appointments.client_result is
  'The appointment''s outcome as the client records it: pending (or null), quoting, quoted_not_sold, valid_not_quoting, invalid, sold.';

/** Tiles 1 to 3: leads, appointments and their results since p_from (null: all time), for one client or all the caller sees. */
create or replace function public.client_dashboard(p_from date default null, p_company_id bigint default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), p as (
    select pr.id, pr.name from public.projects pr
     where pr.deleted_at is null and (p_company_id is null or pr.company_id = p_company_id)
  ), l as (
    select le.project_id from public.leads le, z
     where le.project_id in (select id from p)
       and (p_from is null or coalesce(le.lead_date, le.created_at) >= (p_from::timestamp at time zone z.tz))
  ), a as (
    -- As the client sees them: through QA, not invalid.
    select coalesce(ap.client_result, 'pending') as result from public.appointments ap, z
     where coalesce(ap.project_id, ap.set_project_id) in (select id from p)
       and ap.invalid_at is null and coalesce(ap.qa_status, 'passed') = 'passed'
       and (p_from is null or ap.created_at >= (p_from::timestamp at time zone z.tz))
  )
  select jsonb_build_object(
    'leads', (select count(*) from l),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'leads', coalesce(c.n, 0))
                                           order by coalesce(c.n, 0) desc, p.name), '[]'::jsonb)
                   from p left join (select project_id, count(*) as n from l group by project_id) c on c.project_id = p.id),
    'appts', (select count(*) from a),
    'results', (select jsonb_build_object(
                  'pending', count(*) filter (where result = 'pending'),
                  'quoting', count(*) filter (where result = 'quoting'),
                  'quoted_not_sold', count(*) filter (where result = 'quoted_not_sold'),
                  'valid_not_quoting', count(*) filter (where result = 'valid_not_quoting'),
                  'invalid', count(*) filter (where result = 'invalid'),
                  'sold', count(*) filter (where result = 'sold')) from a)
  );
$$;
revoke execute on function public.client_dashboard(date, bigint) from public, anon;
grant execute on function public.client_dashboard(date, bigint) to authenticated;

/**
 * Tile 4: the viable names (still to call) renewing in each of the next p_months months, the month
 * we are in left out. A renewal date is a month of the year (they come round every year).
 */
create or replace function public.client_pipeline(p_months int default 3, p_company_id bigint default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), m as (
    select i, (date_trunc('month', now() at time zone z.tz) + (i * interval '1 month'))::date as first
      from z, generate_series(1, greatest(least(coalesce(p_months, 3), 12), 1)) as i
  ), v as (
    select extract(month from ren.renewal)::int as month
      from public.leads le
      join public.call_results r on r.id = le.result_id and r.viable
      join public.projects pr on pr.id = le.project_id and pr.deleted_at is null
      left join lateral (
        select min(coalesce(i.ultimate_xdate,
                            least(i.pkg_xdate, i.wc_xdate, i.auto_xdate, i.health_xdate, i.dental_xdate,
                                  i.vision_xdate, i.prof_liab_xdate, i.do_xdate, i.eo_xdate))) as renewal
          from public.insurance_details i where i.lead_id = le.id
      ) ren on true
     where (p_company_id is null or pr.company_id = p_company_id) and ren.renewal is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', to_char(m.first, 'YYYY-MM'), 'label', to_char(m.first, 'Mon'),
           'leads', (select count(*) from v where v.month = extract(month from m.first)::int)
         ) order by m.i), '[]'::jsonb)
    from m;
$$;
revoke execute on function public.client_pipeline(int, bigint) from public, anon;
grant execute on function public.client_pipeline(int, bigint) to authenticated;

-- Each client's premium goal for a year (from our appointments).
create table if not exists public.client_goals (
  company_id   bigint not null references public.companies(id) on delete cascade,
  year         int not null check (year between 2000 and 2100),
  premium_goal numeric(14, 2) not null check (premium_goal >= 0),
  updated_at   timestamptz not null default now(),
  updated_by   bigint references public.users(id) on delete set null,
  primary key (company_id, year)
);
alter table public.client_goals enable row level security;
revoke all on public.client_goals from anon;
revoke insert, update, delete, truncate on public.client_goals from authenticated;
grant select on public.client_goals to authenticated;
drop policy if exists client_goals_read on public.client_goals;
create policy client_goals_read on public.client_goals for select to authenticated
  using ((select public.is_staff()) or company_id = (select public.app_company_id()));
drop policy if exists active_account_required on public.client_goals;
create policy active_account_required on public.client_goals as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null);
drop policy if exists mfa_required on public.client_goals;
create policy mfa_required on public.client_goals as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

/** A client's premium goal for a year: their own (a client), or any client's (an administrator). */
create or replace function public.set_client_goal(p_company_id bigint, p_year int, p_goal numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
begin
  if v_me is null or not (public.is_admin() or p_company_id = public.app_company_id()) then
    raise exception 'Only the client or an administrator can set this goal' using errcode = '42501';
  end if;
  if p_goal is null or p_goal < 0 or p_goal > 999999999999 then
    raise exception 'Enter the goal as an amount' using errcode = '22023';
  end if;
  insert into public.client_goals (company_id, year, premium_goal, updated_at, updated_by)
  values (p_company_id, p_year, round(p_goal, 2), now(), v_me)
  on conflict (company_id, year) do update set premium_goal = excluded.premium_goal, updated_at = now(), updated_by = v_me;
end $$;
revoke execute on function public.set_client_goal(bigint, int, numeric) from public, anon;
grant execute on function public.set_client_goal(bigint, int, numeric) to authenticated;

/**
 * The Sale Pipeline for one client (an administrator) or the caller's own (a client): premium
 * written this year (sold, by when they marked it), in the pipe (quoted, on those still quoting),
 * the year's goal, the close ratio (sold of pending, quoting, quoted-not sold and sold), and the
 * premium written in each month of the year.
 */
create or replace function public.client_sales(p_company_id bigint default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with z as (
    select public.business_tz() as tz, extract(year from now() at time zone public.business_tz())::int as yr
  ), co as (
    select coalesce(p_company_id, public.app_company_id()) as id
  ), a as (
    select coalesce(ap.client_result, 'pending') as result, ap.quoted_premium, ap.written_premium,
           (ap.client_result_at at time zone z.tz) as at
      from public.appointments ap
      join public.projects pr on pr.id = coalesce(ap.project_id, ap.set_project_id) and pr.deleted_at is null, z, co
     where pr.company_id = co.id
       and ap.invalid_at is null and coalesce(ap.qa_status, 'passed') = 'passed'
  ), sold as (
    select a.written_premium, a.at from a, z where a.result = 'sold' and extract(year from a.at)::int = z.yr
  )
  select jsonb_build_object(
    'year', (select yr from z),
    'written', (select coalesce(sum(written_premium), 0) from sold),
    'pipe', (select coalesce(sum(quoted_premium), 0) from a where result = 'quoting'),
    'goal', (select g.premium_goal from public.client_goals g, co, z where g.company_id = co.id and g.year = z.yr),
    'sold', (select count(*) from a where result = 'sold'),
    'considered', (select count(*) from a where result in ('pending', 'quoting', 'quoted_not_sold', 'sold')),
    'months', (select jsonb_agg(jsonb_build_object(
                 'month', m, 'label', to_char(make_date(z.yr, m, 1), 'Mon'),
                 'written', (select coalesce(sum(written_premium), 0) from sold where extract(month from sold.at)::int = m)
               ) order by m) from z, generate_series(1, 12) m)
  );
$$;
revoke execute on function public.client_sales(bigint) from public, anon;
grant execute on function public.client_sales(bigint) to authenticated;

/**
 * Recent Activity (Sean, Oct 2026): the leads and appointments developed on the caller's projects
 * (a client's; an administrator's: any, or p_company_id's) from p_from to p_to (the business's days),
 * newest first: the name, its project, the agent, when, what it was (Lead; an appointment as
 * Appointment, Appointment-Confirmed or Appointment-Invalid), its X-date and the manager. Read from
 * what developed them, without what it paid; an appointment only once QA has let it through.
 */
create or replace function public.client_activity(p_from date, p_to date, p_project_id bigint default null,
  p_kind text default null, p_company_id bigint default null)
returns table (id bigint, at timestamptz, kind text, result text, lead_id bigint, company text, city text, state text,
  project_id bigint, project text, agent text, manager text, xdate date)
language sql stable security definer set search_path = public as $$
  with z as (
    select public.business_tz() as tz
  ), mine as (
    select p.id from public.projects p
     where p.deleted_at is null
       and (case when public.is_staff() then (p_company_id is null or p.company_id = p_company_id)
                 else p.id in (select public.client_project_ids()) end)
       and (p_project_id is null or p.id = p_project_id)
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
            from public.insurance_details i where i.lead_id = l.id)
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
