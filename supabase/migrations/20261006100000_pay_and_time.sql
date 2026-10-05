-- ---------------------------------------------------------------------------
-- Lighthouse CRM — pay rates, hybrid pay and time worked
--
--   pay_rules()          the rules an administrator sets in Settings: the
--                        range each project rate is picked from (lead $8–$12,
--                        appointment $30–$50, special pay $5–$20) and the
--                        hourly range ($15.15–$25); how time is counted (stop
--                        after 5 idle minutes, round each hour up to 15, a
--                        call counts up to 30 minutes) and the pay period
--   set_project_rates()  keeps a project's rates inside those ranges
--   pay_profiles         each account manager's pay: commission only, or
--                        hybrid (an hourly rate or the commission, whichever
--                        is higher for the pay period)
--   work_activity        what someone did in the app, minute by minute,
--                        written only by track_activity() at the server's time
--   work_minutes()       minutes worked per person, day and hour
--   work_days()          per day: minutes worked and minutes paid (rounded)
--   pay_report()         per person for a period: hours, hourly pay,
--                        commission and the pay due
--   production_report()  now names the client, and splits the pay by kind
--   call_records         a call's person, time and name are the server's
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The rules
-- ---------------------------------------------------------------------------

/**
 * The pay and time rules, with the defaults filled in for any an
 * administrator has not set (app_settings 'pay_rates' and 'time_tracking').
 * Amounts are dollars; `step` is how far apart the choices in a rate's list are.
 */
create or replace function public.pay_rules()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'rates', jsonb_build_object(
      'lead',        coalesce(r->'lead',        '{"min": 8, "max": 12, "step": 0.5}'::jsonb),
      'appointment', coalesce(r->'appointment', '{"min": 30, "max": 50, "step": 1}'::jsonb),
      'special',     coalesce(r->'special',     '{"min": 5, "max": 20, "step": 1}'::jsonb),
      'hourly',      coalesce(r->'hourly',      '{"min": 15.15, "max": 25}'::jsonb)),
    'time', jsonb_build_object(
      -- Minutes without any action after which the timer stops.
      'idle_minutes', coalesce((t->>'idle_minutes')::int, 5),
      -- hour_up: each hour's minutes round up to `round_to`; day_up / day_nearest:
      -- each day's total does; none: exact minutes.
      'rounding',     coalesce(t->>'rounding', 'hour_up'),
      'round_to',     coalesce((t->>'round_to')::int, 15),
      -- A call (Call now, then its result saved) counts as work up to this long; 0 turns it off.
      'call_minutes', coalesce((t->>'call_minutes')::int, 30),
      -- weekly / biweekly (counted from period_start) / semimonthly / monthly.
      'pay_period',   coalesce(t->>'pay_period', 'weekly'),
      'period_start', coalesce(t->>'period_start', '2026-10-05'))
  )
  from (select coalesce((select s.value from public.app_settings s where s.key = 'pay_rates'), '{}'::jsonb) as r,
               coalesce((select s.value from public.app_settings s where s.key = 'time_tracking'), '{}'::jsonb) as t) x;
$$;
revoke execute on function public.pay_rules() from public, anon;
grant execute on function public.pay_rules() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Project rates inside their ranges
-- ---------------------------------------------------------------------------

/**
 * A rate being set must be $0 (that event is not paid on this project) or
 * inside its range. A rate left as it was is kept, even if the range has
 * moved since it was set.
 */
create or replace function public.check_pay_rate(p_label text, p_new numeric, p_old numeric, p_range jsonb)
returns void
language plpgsql immutable set search_path = public as $$
declare
  v_min numeric := coalesce((p_range->>'min')::numeric, 0);
  v_max numeric := coalesce((p_range->>'max')::numeric, 10000);
begin
  if p_new is null or p_new < 0 then
    raise exception '% cannot be negative', p_label using errcode = '22023';
  end if;
  if round(p_new, 2) is distinct from p_old and p_new <> 0 and (p_new < v_min or p_new > v_max) then
    raise exception '% must be between % and %, or $0 for none', p_label,
      to_char(v_min, 'FM$999,990.00'), to_char(v_max, 'FM$999,990.00') using errcode = '22023';
  end if;
end $$;
revoke execute on function public.check_pay_rate(text, numeric, numeric, jsonb) from public, anon;
-- set_project_rates() runs as the administrator calling it, so they need to be able to call this too.
grant execute on function public.check_pay_rate(text, numeric, numeric, jsonb) to authenticated;

create or replace function public.set_project_rates(p_project_id bigint, p_lead numeric, p_appointment numeric, p_confirmation numeric)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_old   public.projects;
  v_row   public.projects;
  v_rates jsonb := public.pay_rules()->'rates';
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  select * into v_old from public.projects where id = p_project_id;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  perform public.check_pay_rate('Lead pay', coalesce(p_lead, 0), v_old.lead_rate, v_rates->'lead');
  perform public.check_pay_rate('Appointment pay', coalesce(p_appointment, 0), v_old.appointment_rate, v_rates->'appointment');
  perform public.check_pay_rate('Special pay', coalesce(p_confirmation, 0), v_old.confirmation_rate, v_rates->'special');

  update public.projects
     set lead_rate = round(coalesce(p_lead, 0), 2),
         appointment_rate = round(coalesce(p_appointment, 0), 2),
         confirmation_rate = round(coalesce(p_confirmation, 0), 2)
   where id = p_project_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'lead_rate', v_row.lead_rate,
                            'appointment_rate', v_row.appointment_rate, 'confirmation_rate', v_row.confirmation_rate);
end $$;
revoke execute on function public.set_project_rates(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function public.set_project_rates(bigint, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. How each account manager is paid
-- ---------------------------------------------------------------------------

create table if not exists public.pay_profiles (
  user_id     bigint primary key references public.users(id) on delete cascade,
  pay_model   text not null default 'commission' check (pay_model in ('commission', 'hybrid')),
  hourly_rate numeric(8,2) check (hourly_rate is null or hourly_rate between 0 and 1000),
  updated_at  timestamptz not null default now(),
  updated_by  bigint references public.users(id) on delete set null,
  constraint pay_profiles_hybrid_rate check (pay_model <> 'hybrid' or hourly_rate is not null)
);

alter table public.pay_profiles enable row level security;

-- An administrator sets them; each person can see their own.
drop policy if exists pay_profiles_read on public.pay_profiles;
create policy pay_profiles_read on public.pay_profiles
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists pay_profiles_write on public.pay_profiles;
create policy pay_profiles_write on public.pay_profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.pay_profiles;
create policy mfa_required on public.pay_profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.pay_profiles;
create policy active_account_required on public.pay_profiles as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

grant select, insert, update, delete on public.pay_profiles to authenticated;

/** An hourly rate being set must be inside the hourly range in Settings; who set it, and when, is stamped on. */
create or replace function public.tg_pay_profiles_check()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_range jsonb   := public.pay_rules()->'rates'->'hourly';
  v_min   numeric := coalesce((v_range->>'min')::numeric, 0);
  v_max   numeric := coalesce((v_range->>'max')::numeric, 1000);
begin
  new.updated_at := now();
  new.updated_by := coalesce(public.app_user_id(), new.updated_by);
  if new.hourly_rate is not null
     and (tg_op = 'INSERT' or new.hourly_rate is distinct from old.hourly_rate)
     and (new.hourly_rate < v_min or new.hourly_rate > v_max) then
    raise exception 'The hourly rate must be between % and %',
      to_char(v_min, 'FM$999,990.00'), to_char(v_max, 'FM$999,990.00') using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists pay_profiles_check on public.pay_profiles;
create trigger pay_profiles_check
  before insert or update on public.pay_profiles
  for each row execute function public.tg_pay_profiles_check();

-- ---------------------------------------------------------------------------
-- 4. What someone did in the app, minute by minute
--
-- The app reports clicks and key presses (never mouse movement, which a
-- program can fake while nobody works) at most twice a minute, and presses
-- of "Call now" with the name being called. Rows are written only by
-- track_activity(), at the server's time: nobody can backdate or add time.
-- ---------------------------------------------------------------------------

create table if not exists public.work_activity (
  id       bigint generated always as identity primary key,
  user_id  bigint not null references public.users(id) on delete cascade,
  minute   timestamptz not null,               -- the minute it happened in
  at       timestamptz not null default now(),
  kind     text not null default 'use' check (kind in ('use', 'call')),
  lead_id  bigint references public.leads(id) on delete set null
);

-- One 'use' row a minute, one 'call' row a minute and name.
create unique index if not exists work_activity_use_once on public.work_activity (user_id, minute) where kind = 'use';
create unique index if not exists work_activity_call_once on public.work_activity (user_id, minute, lead_id) where kind = 'call';
create index if not exists work_activity_user_minute on public.work_activity (user_id, minute);

alter table public.work_activity enable row level security;

drop policy if exists work_activity_read on public.work_activity;
create policy work_activity_read on public.work_activity
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists mfa_required on public.work_activity;
create policy mfa_required on public.work_activity as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.work_activity;
create policy active_account_required on public.work_activity as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

revoke insert, update, delete, truncate on public.work_activity from anon, authenticated;
grant select on public.work_activity to authenticated;

/**
 * Record that the signed-in person did something now: 'use' for a click or
 * key press, 'call' for "Call now" on a name (which counts as use too).
 * Staff only; anyone else is ignored.
 */
create or replace function public.track_activity(p_kind text default 'use', p_lead bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();   -- null for an inactive account or one short of two-factor
  v_lead bigint;
begin
  if v_me is null or public.app_role() not in ('admin', 'manager', 'agent') then
    return;
  end if;
  if p_kind = 'call' and p_lead is not null then
    select l.id into v_lead from public.leads l where l.id = p_lead;
  end if;
  if v_lead is not null then
    insert into public.work_activity (user_id, minute, kind, lead_id)
    values (v_me, date_trunc('minute', now()), 'call', v_lead)
    on conflict do nothing;
  end if;
  insert into public.work_activity (user_id, minute, kind)
  values (v_me, date_trunc('minute', now()), 'use')
  on conflict do nothing;
end $$;
revoke execute on function public.track_activity(text, bigint) from public, anon;
grant execute on function public.track_activity(text, bigint) to authenticated;

-- A call's person, time and name come from the server, as they now count
-- towards time worked: record_call_result() writes them; a direct write
-- through the API (staff may) gets the caller and the current time stamped
-- on, and cannot change them afterwards. Administrators can still correct one.
create or replace function public.tg_call_records_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.user_id   := public.app_user_id();
      new.call_date := now();
    elsif (new.user_id, new.call_date, new.lead_id) is distinct from (old.user_id, old.call_date, old.lead_id) then
      raise exception 'Who made a call, when, and to whom are recorded with it and cannot be changed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists call_records_guard on public.call_records;
create trigger call_records_guard
  before insert or update on public.call_records
  for each row execute function public.tg_call_records_guard();

create index if not exists call_records_user_date on public.call_records (user_id, call_date);
create index if not exists call_records_lead_user on public.call_records (lead_id, user_id, call_date);

-- ---------------------------------------------------------------------------
-- 5. Time worked
-- ---------------------------------------------------------------------------

/**
 * Minutes worked per person, day and hour (the business's days and hours),
 * from what they did in Lighthouse:
 *   - each minute with an action in the app (work_activity) or a saved call
 *     result (call_records);
 *   - the minutes between two such minutes at most `idle_minutes` apart
 *     (5): reading a name, dialling, typing notes. A longer gap counts
 *     nothing: the timer had stopped;
 *   - a call: from pressing Call now on a name to saving that name's result,
 *     up to `call_minutes` (30), since a phone conversation has no clicks.
 * Anyone but an administrator gets only their own minutes.
 */
create or replace function public.work_minutes(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, day date, hour int, minutes int)
language sql stable security invoker set search_path = public as $$
  with cfg as (
    select public.business_tz() as tz,
           greatest(coalesce((r->>'idle_minutes')::int, 5), 0) as idle,
           greatest(coalesce((r->>'call_minutes')::int, 30), 0) as call_cap
      from (select public.pay_rules()->'time' as r) x
  ), b as (
    select cfg.tz, cfg.idle, cfg.call_cap,
           (p_from::timestamp at time zone cfg.tz) as t0,
           ((p_to + 1)::timestamp at time zone cfg.tz) as t1,
           case when public.is_admin() then p_user else public.app_user_id() end as uid,
           public.is_admin() or public.app_user_id() is not null as allowed
      from cfg
  ), marks as (
    select a.user_id as uid, a.minute as m
      from public.work_activity a, b
     where b.allowed and a.minute >= b.t0 - make_interval(mins => b.idle) and a.minute < b.t1
       and (b.uid is null or a.user_id = b.uid)
    union
    select c.user_id, date_trunc('minute', c.call_date)
      from public.call_records c, b
     where b.allowed and c.call_date >= b.t0 - make_interval(mins => b.idle) and c.call_date < b.t1
       and c.user_id is not null and (b.uid is null or c.user_id = b.uid)
    union
    select a.user_id, gs.m
      from public.work_activity a
      cross join b
      cross join lateral (
        select min(c.call_date) as ended
          from public.call_records c
         where c.user_id = a.user_id and c.lead_id = a.lead_id
           and c.call_date >= a.at and c.call_date <= a.at + make_interval(mins => b.call_cap)
      ) e
      cross join lateral generate_series(a.minute, date_trunc('minute', e.ended), interval '1 minute') as gs(m)
     where b.allowed and a.kind = 'call' and b.call_cap > 0 and e.ended is not null
       and a.minute >= b.t0 - make_interval(mins => b.call_cap) and a.minute < b.t1
       and (b.uid is null or a.user_id = b.uid)
  ), ordered as (
    select d.uid, d.m, lag(d.m) over (partition by d.uid order by d.m) as prev
      from (select distinct mk.uid, mk.m from marks mk) d
  ), covered as (
    select o.uid, o.m from ordered o
    union
    select o.uid, gs.m
      from ordered o
      cross join b
      cross join lateral generate_series(o.prev + interval '1 minute', o.m - interval '1 minute', interval '1 minute') as gs(m)
     where o.prev is not null and o.m - o.prev <= make_interval(mins => b.idle)
  )
  select c.uid, (c.m at time zone b.tz)::date, extract(hour from c.m at time zone b.tz)::int, count(*)::int
    from covered c, b
   where c.m >= b.t0 and c.m < b.t1
   group by 1, 2, 3;
$$;
revoke execute on function public.work_minutes(date, date, bigint) from public, anon;
grant execute on function public.work_minutes(date, date, bigint) to authenticated;

/**
 * Per person and day: minutes worked, minutes paid after the rounding rule,
 * and each hour's minutes ({ hour, minutes, paid }) to show how it adds up.
 */
create or replace function public.work_days(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, day date, worked int, paid int, hours jsonb)
language sql stable security invoker set search_path = public as $$
  with cfg as (
    select coalesce(r->>'rounding', 'hour_up') as rounding, greatest(coalesce((r->>'round_to')::int, 15), 1) as step
      from (select public.pay_rules()->'time' as r) x
  ), h as (
    select w.user_id as uid, w.day as d, w.hour as hr, w.minutes as mins,
           least(60, (ceil(w.minutes::numeric / cfg.step) * cfg.step)::int) as hour_up
      from public.work_minutes(p_from, p_to, p_user) w, cfg
  )
  select h.uid, h.d, sum(h.mins)::int,
         (case cfg.rounding
            when 'hour_up'     then sum(h.hour_up)
            when 'day_up'      then ceil(sum(h.mins)::numeric / cfg.step) * cfg.step
            when 'day_nearest' then round(sum(h.mins)::numeric / cfg.step) * cfg.step
            else sum(h.mins) end)::int,
         jsonb_agg(jsonb_build_object('hour', h.hr, 'minutes', h.mins,
                                      'paid', case when cfg.rounding = 'hour_up' then h.hour_up else h.mins end)
                   order by h.hr)
    from h, cfg
   group by h.uid, h.d, cfg.rounding, cfg.step;
$$;
revoke execute on function public.work_days(date, date, bigint) from public, anon;
grant execute on function public.work_days(date, date, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Pay for a period
-- ---------------------------------------------------------------------------

/**
 * Per person for a period (the business's days): minutes worked and paid,
 * the hourly pay at their rate, their commission (every pay event in the
 * period, chargebacks taken off) and what they are due: the commission, or
 * for the hybrid model whichever of the two is higher. Account managers and
 * agents are listed even with nothing in the period. Anyone but an
 * administrator gets only their own row.
 */
create or replace function public.pay_report(p_from date, p_to date, p_user bigint default null)
returns table (
  user_id bigint, first_name text, last_name text, email text, role text,
  pay_model text, hourly_rate numeric,
  worked_minutes int, paid_minutes int,
  hourly_pay numeric, commission numeric, pay numeric,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_tz   text   := public.business_tz();
  v_user bigint := case when public.is_admin() then p_user else public.app_user_id() end;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a start date on or before the end date' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;
  if v_user is null and not public.is_admin() then
    return;
  end if;

  return query
  with t as (
    select wd.user_id as uid, sum(wd.worked)::int as worked, sum(wd.paid)::int as paid
      from public.work_days(p_from, p_to, v_user) wd
     group by 1
  ), m as (
    select pe.user_id as uid,
           sum(pe.amount) as commission,
           count(*) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as leads,
           count(*) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appts,
           count(*) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as confirms,
           count(*) filter (where pe.is_chargeback) as backs
      from public.pay_events pe
     where pe.created_at >= (p_from::timestamp at time zone v_tz)
       and pe.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
       and pe.user_id is not null
       and (v_user is null or pe.user_id = v_user)
     group by 1
  ), c as (
    select cr.user_id as uid, count(*) as n
      from public.call_records cr
     where cr.call_date >= (p_from::timestamp at time zone v_tz)
       and cr.call_date <  ((p_to + 1)::timestamp at time zone v_tz)
       and cr.user_id is not null
       and (v_user is null or cr.user_id = v_user)
     group by 1
  ), people as (
    select u.id
      from public.users u
     where (v_user is null or u.id = v_user)
       and ((u.role in ('manager', 'agent') and u.status = 'active')
            or u.id in (select t.uid from t) or u.id in (select m.uid from m) or u.id in (select c.uid from c))
  ), figures as (
    select u.id, u.first_name, u.last_name, u.email, u.role,
           coalesce(pp.pay_model, 'commission') as model, pp.hourly_rate as rate,
           coalesce(t.worked, 0) as worked, coalesce(t.paid, 0) as paid,
           round(coalesce(t.paid, 0) / 60.0 * coalesce(pp.hourly_rate, 0), 2) as hourly,
           round(coalesce(m.commission, 0), 2) as commission,
           coalesce(c.n, 0) as calls, coalesce(m.leads, 0) as leads, coalesce(m.appts, 0) as appts,
           coalesce(m.confirms, 0) as confirms, coalesce(m.backs, 0) as backs
      from people pl
      join public.users u on u.id = pl.id
      left join public.pay_profiles pp on pp.user_id = u.id
      left join t on t.uid = u.id
      left join m on m.uid = u.id
      left join c on c.uid = u.id
  )
  select f.id, f.first_name, f.last_name, f.email, f.role, f.model, f.rate::numeric,
         f.worked, f.paid, f.hourly, f.commission,
         case when f.model = 'hybrid' then greatest(f.hourly, f.commission) else f.commission end,
         f.calls, f.leads, f.appts, f.confirms, f.backs
    from figures f
   order by f.first_name, f.last_name, f.id;
end $$;
revoke execute on function public.pay_report(date, date, bigint) from public, anon;
grant execute on function public.pay_report(date, date, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The production report names the client and splits the pay by kind
-- ---------------------------------------------------------------------------

drop function if exists public.production_report(date, date, bigint, bigint);

/**
 * Per day (in the business's time zone), rep and project: calls made, the
 * paid events, and what they came to by kind (lead pay, appointment pay,
 * special pay for a confirmation, chargebacks) and in total. Anyone but an
 * administrator sees only their own rows, whatever p_user_id says.
 */
create function public.production_report(p_from date, p_to date,
                                         p_project_id bigint default null, p_user_id bigint default null)
returns table (
  day date, user_id bigint, first_name text, last_name text, email text,
  project_id bigint, project text, client_id bigint, client text,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint,
  lead_pay numeric, appointment_pay numeric, special_pay numeric, chargeback_amount numeric,
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
           sum(pe.amount) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as lead_amt,
           sum(pe.amount) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appt_amt,
           sum(pe.amount) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as special_amt,
           sum(pe.amount) filter (where pe.is_chargeback) as back_amt,
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
  select k.d, k.uid, u.first_name, u.last_name, u.email, k.pid, p.name, co.id, co.name,
         coalesce(c.n, 0), coalesce(e.leads, 0), coalesce(e.appts, 0), coalesce(e.confirms, 0), coalesce(e.backs, 0),
         coalesce(e.lead_amt, 0)::numeric, coalesce(e.appt_amt, 0)::numeric, coalesce(e.special_amt, 0)::numeric,
         coalesce(e.back_amt, 0)::numeric, coalesce(e.amount, 0)::numeric
    from k
    left join c on c.d = k.d and c.uid = k.uid and c.pid is not distinct from k.pid
    left join e on e.d = k.d and e.uid = k.uid and e.pid is not distinct from k.pid
    left join public.users u on u.id = k.uid
    left join public.projects p on p.id = k.pid
    left join public.companies co on co.id = p.company_id
   order by k.d desc, u.first_name, u.last_name, p.name;
end $$;
revoke execute on function public.production_report(date, date, bigint, bigint) from public, anon;
grant execute on function public.production_report(date, date, bigint, bigint) to authenticated;
