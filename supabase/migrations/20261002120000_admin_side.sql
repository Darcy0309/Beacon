-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the administrator's side
--
-- What the project drill-down and the two new reports need:
--   business_tz()        the time zone a "day" is counted in: the
--                        'business_timezone' setting, America/Phoenix until set
--   project_overview()   one project's true totals, for its page tiles
--   project_reps()       who works a project: names held, calls today and this
--                        month, appointments this month, last worked
--   set_project_rep()    put a rep on a project or take them off, and share its
--                        names out evenly again, in one transaction
--   xdates_by_month()    renewals per month of the year: total, appointments,
--                        off the list, viable left
--   xdate_month_leads()  the leads behind any number in that report
--   production_report()  calls and paid events per day, rep and project
--   set_project_rates()  an administrator sets a project's pay rates
--
-- Reads are security invoker: Row Level Security scopes them as everywhere
-- else. The production report shows anyone but an administrator only their
-- own rows, as pay_events already does.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Days
-- ---------------------------------------------------------------------------

/** The business's time zone, for "today" and "this month". Unknown names fall back to Phoenix. */
create or replace function public.business_tz()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value->>'name' from public.app_settings s
      where s.key = 'business_timezone'
        and exists (select 1 from pg_timezone_names z where z.name = s.value->>'name')),
    'America/Phoenix');
$$;
revoke execute on function public.business_tz() from public, anon;
grant execute on function public.business_tz() to authenticated;

/** Midnight today and on the 1st of this month, in the business's time zone. */
create or replace function public.business_bounds(out day_start timestamptz, out month_start timestamptz)
language sql stable security invoker set search_path = public as $$
  select date_trunc('day', now() at time zone tz) at time zone tz,
         date_trunc('month', now() at time zone tz) at time zone tz
    from (select public.business_tz() as tz) t;
$$;
grant execute on function public.business_bounds() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pay events: which rows are chargebacks
--
-- A chargeback normally reverses a payment (reverses_id). One for an older
-- lead with no payment on record to reverse is written at minus today's
-- rate, which is $0 until rates are set, so its note is what marks it.
-- ---------------------------------------------------------------------------

alter table public.pay_events
  add column if not exists is_chargeback boolean generated always as (
    reverses_id is not null or amount < 0 or coalesce(note, '') like 'Lead invalid (no original payment%'
  ) stored;

-- ---------------------------------------------------------------------------
-- 3. One project, as an administrator watches it
-- ---------------------------------------------------------------------------

create or replace function public.project_overview(p_project_id bigint)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with b as (select * from public.business_bounds()),
  l as (
    select l.assigned_user_id, r.viable, r.callable
      from public.leads l join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id
  ),
  a as (
    select a.qa_status, a.appt_create_date from public.appointments a
     where (a.project_id = p_project_id or a.set_project_id = p_project_id) and a.invalid_at is null
  ),
  c as (select c.call_date from public.call_records c where c.project_id = p_project_id),
  days as (
    select generate_series(0, 13) as ago
  )
  select jsonb_build_object(
    'leads',        (select count(*) from l),
    'viable_left',  (select count(*) from l where viable and callable),
    'unassigned',   (select count(*) from l where viable and callable and assigned_user_id is null),
    'pending',      (select count(*) from l where viable and not callable),
    'off_list',     (select count(*) from l where not viable),
    'appointments', (select count(*) from a),
    'appts_month',  (select count(*) from a, b where a.appt_create_date >= b.month_start),
    'qa_pending',   (select count(*) from a where a.qa_status = 'pending'),
    'calls_today',  (select count(*) from c, b where c.call_date >= b.day_start),
    'calls_month',  (select count(*) from c, b where c.call_date >= b.month_start),
    'last_worked',  (select max(c.call_date) from c),
    -- Calls per day for the last two weeks, oldest first (the tile sparkline).
    'calls_14d',    (select coalesce(jsonb_agg(n order by ago desc), '[]'::jsonb)
                       from (select d.ago, (select count(*) from c, b
                                             where c.call_date >= b.day_start - make_interval(days => d.ago)
                                               and c.call_date <  b.day_start - make_interval(days => d.ago - 1)) as n
                               from days d) t)
  );
$$;
revoke execute on function public.project_overview(bigint) from public, anon;
grant execute on function public.project_overview(bigint) to authenticated;

create or replace function public.project_reps(p_project_id bigint)
returns table (
  user_id bigint, first_name text, last_name text, email text, role text, status text,
  names_left bigint,   -- names still to call on their list
  leads_held bigint,   -- every name on the project in their hands, resolved or not
  calls_today bigint, calls_month bigint,
  appts_month bigint,  -- appointments they set from this project this month
  last_worked timestamptz
)
language sql stable security invoker set search_path = public as $$
  select u.id, u.first_name, u.last_name, u.email, u.role, u.status,
         (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
           where l.project_id = p_project_id and l.assigned_user_id = u.id and r.viable and r.callable),
         (select count(*) from public.leads l where l.project_id = p_project_id and l.assigned_user_id = u.id),
         (select count(*) from public.call_records c
           where c.project_id = p_project_id and c.user_id = u.id and c.call_date >= b.day_start),
         (select count(*) from public.call_records c
           where c.project_id = p_project_id and c.user_id = u.id and c.call_date >= b.month_start),
         (select count(*) from public.appointments a
           where a.set_project_id = p_project_id and a.user_id = u.id and a.invalid_at is null
             and a.appt_create_date >= b.month_start),
         (select max(c.call_date) from public.call_records c where c.project_id = p_project_id and c.user_id = u.id)
    from (select distinct pa.ae_user_id from public.project_assignments pa
           where pa.project_id = p_project_id and pa.ae_user_id is not null) pa
    join public.users u on u.id = pa.ae_user_id
    cross join public.business_bounds() b
   order by u.first_name, u.last_name, u.id;
$$;
revoke execute on function public.project_reps(bigint) from public, anon;
grant execute on function public.project_reps(bigint) to authenticated;

/**
 * Put a rep on a project (p_on) or take them off, then share the project's
 * names still to call evenly across whoever is on it now. Returns what
 * distribute_names() reports: names, reps, how many moved, before and after.
 */
create or replace function public.set_project_rep(p_project_id bigint, p_user_id bigint, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user public.users;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can change who works a project' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'That person no longer has an account' using errcode = 'P0002';
  end if;

  if p_on then
    if v_user.role not in ('admin', 'manager', 'agent') then
      raise exception 'Only staff can work a project' using errcode = '22023';
    end if;
    if v_user.status is distinct from 'active' then
      raise exception '% cannot work a project until their account is active',
        coalesce(nullif(concat_ws(' ', v_user.first_name, v_user.last_name), ''), v_user.email) using errcode = '22023';
    end if;
    insert into public.project_assignments (project_id, ae_user_id)
    select p_project_id, p_user_id
     where not exists (select 1 from public.project_assignments
                        where project_id = p_project_id and ae_user_id = p_user_id);
  else
    -- A row that also links a client contact keeps that link.
    update public.project_assignments set ae_user_id = null
     where project_id = p_project_id and ae_user_id = p_user_id and cl_user_id is not null;
    delete from public.project_assignments
     where project_id = p_project_id and ae_user_id = p_user_id;
  end if;

  return public.distribute_names(p_project_id);
end $$;
revoke execute on function public.set_project_rep(bigint, bigint, boolean) from public, anon;
grant execute on function public.set_project_rep(bigint, bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. X-dates by month
--
-- A renewal comes round every year, so names group by the month of their
-- renewal date (lead_renewal_date(): the ultimate X-date, else the earliest
-- policy line), January to December; month 0 is "no renewal date". Each name
-- is in one bucket:
--   appointment  its result set an appointment (or confirmed one)
--   off          taken off the list for another reason (not qualified, DNC…)
--   viable       still to work
-- ---------------------------------------------------------------------------

create or replace function public.lead_xdate_bucket(p_viable boolean, p_effect text)
returns text
language sql immutable set search_path = public as $$
  select case when p_effect in ('appointment', 'confirm') then 'appointment'
              when p_viable then 'viable'
              else 'off' end;
$$;

create or replace function public.xdates_by_month(p_project_id bigint default null, p_company_id bigint default null)
returns table (month int, total bigint, appointments bigint, off_list bigint, viable_left bigint)
language sql stable security invoker set search_path = public as $$
  with x as (
    select coalesce(extract(month from public.lead_renewal_date(l.id))::int, 0) as m,
           public.lead_xdate_bucket(r.viable, r.effect) as bucket
      from public.leads l
      join public.call_results r on r.id = l.result_id
      left join public.projects p on p.id = l.project_id
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

/** One page of the names behind a number in xdates_by_month(); p_bucket null means all of them. */
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
    cross join lateral (select public.lead_renewal_date(l.id) as renewal) x
   where (p_project_id is null or l.project_id = p_project_id)
     and (p_company_id is null or p.company_id = p_company_id)
     and coalesce(extract(month from x.renewal)::int, 0) = p_month
     and (p_bucket is null or public.lead_xdate_bucket(r.viable, r.effect) = p_bucket)
   order by extract(day from x.renewal) nulls last, l.company_name, l.id
   limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.xdate_month_leads(int, text, bigint, bigint, int, int) from public, anon;
grant execute on function public.xdate_month_leads(int, text, bigint, bigint, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Daily production and pay
-- ---------------------------------------------------------------------------

/**
 * Per day (in the business's time zone), rep and project: calls made, and
 * the paid events with their total. A chargeback counts once and its
 * negative amount comes off the total. Anyone but an administrator sees
 * only their own rows, whatever p_user_id says.
 */
create or replace function public.production_report(p_from date, p_to date,
                                                    p_project_id bigint default null, p_user_id bigint default null)
returns table (
  day date, user_id bigint, first_name text, last_name text, email text,
  project_id bigint, project text,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint,
  amount numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user_id else public.app_user_id() end;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a start date on or before the end date' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;

  return query
  with c as (
    select (cr.call_date at time zone v_tz)::date as d, cr.user_id as uid, cr.project_id as pid, count(*) as n
      from public.call_records cr
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date <  ((p_to + 1)::timestamp at time zone v_tz)
       and cr.user_id is not null
       and (v_user is null or cr.user_id = v_user)
       and (p_project_id is null or cr.project_id = p_project_id)
     group by 1, 2, 3
  ),
  e as (
    select (pe.created_at at time zone v_tz)::date as d, pe.user_id as uid, pe.project_id as pid,
           count(*) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as leads,
           count(*) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appts,
           count(*) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as confirms,
           count(*) filter (where pe.is_chargeback) as backs,
           sum(pe.amount) as amount
      from public.pay_events pe
     where pe.created_at >= (p_from::timestamp at time zone v_tz)
       and pe.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
       and pe.user_id is not null
       and (v_user is null or pe.user_id = v_user)
       and (p_project_id is null or pe.project_id = p_project_id)
     group by 1, 2, 3
  ),
  k as (select c.d, c.uid, c.pid from c union select e.d, e.uid, e.pid from e)
  select k.d, k.uid, u.first_name, u.last_name, u.email, k.pid, p.name,
         coalesce(c.n, 0), coalesce(e.leads, 0), coalesce(e.appts, 0), coalesce(e.confirms, 0), coalesce(e.backs, 0),
         coalesce(e.amount, 0)::numeric
    from k
    left join c on c.d = k.d and c.uid = k.uid and c.pid is not distinct from k.pid
    left join e on e.d = k.d and e.uid = k.uid and e.pid is not distinct from k.pid
    left join public.users u on u.id = k.uid
    left join public.projects p on p.id = k.pid
   order by k.d desc, u.first_name, u.last_name, p.name;
end $$;
revoke execute on function public.production_report(date, date, bigint, bigint) from public, anon;
grant execute on function public.production_report(date, date, bigint, bigint) to authenticated;

/** Set one project's pay rates (administrators only; the projects trigger enforces it too). */
create or replace function public.set_project_rates(p_project_id bigint, p_lead numeric, p_appointment numeric, p_confirmation numeric)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_row public.projects;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  if least(p_lead, p_appointment, p_confirmation) < 0 or greatest(p_lead, p_appointment, p_confirmation) > 10000 then
    raise exception 'Rates must be between $0 and $10,000' using errcode = '22023';
  end if;
  update public.projects
     set lead_rate = round(coalesce(p_lead, 0), 2),
         appointment_rate = round(coalesce(p_appointment, 0), 2),
         confirmation_rate = round(coalesce(p_confirmation, 0), 2)
   where id = p_project_id
  returning * into v_row;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'lead_rate', v_row.lead_rate,
                            'appointment_rate', v_row.appointment_rate, 'confirmation_rate', v_row.confirmation_rate);
end $$;
revoke execute on function public.set_project_rates(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function public.set_project_rates(bigint, numeric, numeric, numeric) to authenticated;
