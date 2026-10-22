-- =============================================================================
-- Special Pay for DB dev leads (Sean, Oct 2026)
--
-- A DB dev project can set a goal: so many leads by one rep on it in a pay
-- period (5 or 10, say), and a Special Pay for each (an extra $1 a lead).
-- When a rep's leads on the project that pay period reach the goal, each of
-- them earns the Special Pay, and so does each lead after it that period; the
-- rep is told when they hit it. It is paid as pay events of its own kind, so
-- it is in every pay total, and shown as Special Pay on the pay summary and
-- the production report. A lead charged back (Lead-Invalid) takes its Special
-- Pay back with it.
--
-- What was called "special pay" until now, the pay for confirming an
-- appointment (confirmation_rate), is called Confirmation pay from here on.
--
--   projects.special_goal / special_rate   the goal and the pay, set by an administrator
--   pay_period_of(day)                     the pay period a day falls in, as the app works it out
--   award_special_pay(user, project)       pays Special Pay once the goal is hit (from pay())
--   pay_report / production_report         + Special Pay, and Confirmation pay by its own name
--   pipeline_report                        the project's own time zone; a DB dev project's Special Pay
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The goal and the pay, on a project
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists special_goal int;
alter table public.projects add column if not exists special_rate numeric(10,2) not null default 0;
alter table public.projects drop constraint if exists projects_special_pay_check;
alter table public.projects add constraint projects_special_pay_check
  check ((special_goal is null or special_goal between 1 and 1000) and special_rate between 0 and 1000);

comment on column public.projects.special_goal is 'Special Pay: leads one rep develops on this DB dev project in a pay period to earn it (null: none)';
comment on column public.projects.special_rate is 'Special Pay: USD more for each of those leads, once the goal is hit';

-- Pay events of the new kind.
alter table public.pay_events drop constraint if exists pay_events_kind_check;
alter table public.pay_events add constraint pay_events_kind_check
  check (kind in ('lead', 'appointment', 'confirmation', 'special'));

-- Only administrators set pay: the rates, and now the Special Pay goal and amount.
create or replace function public.tg_projects_lifecycle_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin()
     and (tg_op = 'INSERT' and (new.lead_rate, new.appointment_rate, new.confirmation_rate, new.special_rate, coalesce(new.special_goal, 0))
                               is distinct from (0::numeric, 0::numeric, 0::numeric, 0::numeric, 0)
          or tg_op = 'UPDATE' and (new.lead_rate, new.appointment_rate, new.confirmation_rate, new.special_rate, new.special_goal)
                                   is distinct from (old.lead_rate, old.appointment_rate, old.confirmation_rate, old.special_rate, old.special_goal)) then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  if new.appt_project_id is not null then
    if new.appt_project_id = new.id then
      raise exception 'A project cannot promote to itself' using errcode = '23514';
    end if;
    if (select t.code from public.project_types t where t.id = new.project_type_id) is distinct from 'DBDV' then
      raise exception 'Only a database-development project promotes leads to an appointment project' using errcode = '23514';
    end if;
    if not exists (select 1 from public.projects a join public.project_types t on t.id = a.project_type_id
                    where a.id = new.appt_project_id and t.code = 'APPT' and a.company_id is not distinct from new.company_id) then
      raise exception 'Leads can only be promoted to an appointment project for the same client' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

/** An administrator sets a DB dev project's Special Pay: the goal (leads a pay period) and the pay a lead; both null/0 for none. */
create or replace function public.set_project_special_pay(p_project_id bigint, p_goal int, p_rate numeric)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_type text;
  v_row  public.projects;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can set pay rates' using errcode = '42501';
  end if;
  select t.code into v_type from public.projects p left join public.project_types t on t.id = p.project_type_id where p.id = p_project_id;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  if p_goal is not null and (p_goal < 1 or p_goal > 1000) then
    raise exception 'Special Pay goal: a number of leads from 1 to 1,000' using errcode = '22023';
  end if;
  if coalesce(p_rate, 0) < 0 or coalesce(p_rate, 0) > 1000 then
    raise exception 'Special Pay must be between $0.00 and $1,000.00 a lead' using errcode = '22023';
  end if;
  if (p_goal is null) <> (coalesce(p_rate, 0) = 0) then
    raise exception 'Special Pay needs both a goal and an amount a lead (or neither)' using errcode = '22023';
  end if;
  if p_goal is not null and v_type is distinct from 'DBDV' then
    raise exception 'Special Pay is for DB dev projects' using errcode = '22023';
  end if;
  update public.projects set special_goal = p_goal, special_rate = round(coalesce(p_rate, 0), 2)
   where id = p_project_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'special_goal', v_row.special_goal, 'special_rate', v_row.special_rate);
end $$;
revoke execute on function public.set_project_special_pay(bigint, int, numeric) from public, anon;
grant execute on function public.set_project_special_pay(bigint, int, numeric) to authenticated;

-- The confirmation's pay by its new name in the range check's message.
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
  perform public.check_pay_rate('Confirmation pay', coalesce(p_confirmation, 0), v_old.confirmation_rate, v_rates->'special');

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
-- 2. The pay period a day is in
-- ---------------------------------------------------------------------------

/**
 * The pay period containing p_day (today by default), exactly as the app's
 * payPeriod() in src/lib/pay.js works it out from Settings › Pay & time:
 * weeks or two weeks counted from period_start, halves of the month, months,
 * or the business's own schedule (a day between its periods, or after the
 * last, in the latest begun; before the first, the first; none yet: two weeks).
 */
create or replace function public.pay_period_of(p_day date default null, out starts_on date, out ends_on date)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_day    date := coalesce(p_day, (now() at time zone public.business_tz())::date);
  v_time   jsonb := coalesce((select s.value from public.app_settings s where s.key = 'time_tracking'), '{}'::jsonb);
  v_kind   text := coalesce(v_time->>'pay_period', 'weekly');
  v_anchor date;
  v_len    int;
  v_month  date := date_trunc('month', v_day)::date;
begin
  if v_kind = 'custom' then
    select p.starts_on, p.ends_on into starts_on, ends_on from public.pay_periods p
     where p.starts_on <= v_day order by p.starts_on desc limit 1;
    if found then return; end if;
    select p.starts_on, p.ends_on into starts_on, ends_on from public.pay_periods p order by p.starts_on limit 1;
    if found then return; end if;
    v_kind := 'biweekly';
  end if;
  if v_kind in ('weekly', 'biweekly') then
    v_len := case when v_kind = 'weekly' then 7 else 14 end;
    begin
      v_anchor := coalesce((v_time->>'period_start')::date, date '2026-10-05');
    exception when others then
      v_anchor := date '2026-10-05';
    end;
    starts_on := v_anchor + (floor((v_day - v_anchor)::numeric / v_len)::int * v_len);
    ends_on := starts_on + v_len - 1;
  elsif v_kind = 'semimonthly' then
    if extract(day from v_day) <= 15 then
      starts_on := v_month; ends_on := v_month + 14;
    else
      starts_on := v_month + 15; ends_on := (v_month + interval '1 month')::date - 1;
    end if;
  else
    starts_on := v_month; ends_on := (v_month + interval '1 month')::date - 1;
  end if;
end $$;
revoke execute on function public.pay_period_of(date) from public, anon;
grant execute on function public.pay_period_of(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Paying it
-- ---------------------------------------------------------------------------

insert into public.alert_rules (name, trigger, channel, recipients, enabled)
select 'Special Pay goal hit', 'special_pay', 'inapp', null, true
 where not exists (select 1 from public.alert_rules r where r.trigger = 'special_pay');

/**
 * After a lead is paid: if the rep's leads on this DB dev project this pay
 * period (less any charged back) have reached its Special Pay goal, each of
 * them that has not had it earns the Special Pay. The rep is told the first
 * time in the period (by themselves, so not through notify_users(), which
 * leaves out whoever acted). Returns how many leads were paid it.
 */
create or replace function public.award_special_pay(p_user bigint, p_project bigint)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_tz    text := public.business_tz();
  v_goal  int;
  v_rate  numeric(10,2);
  v_name  text;
  v_type  text;
  v_from  date;
  v_to    date;
  v_leads bigint[];
  v_had   int;
  v_new   int;
  v_rule  bigint;
  v_on    boolean;
begin
  select p.special_goal, p.special_rate, p.name, t.code into v_goal, v_rate, v_name, v_type
    from public.projects p left join public.project_types t on t.id = p.project_type_id
   where p.id = p_project;
  if p_user is null or v_type is distinct from 'DBDV' or coalesce(v_goal, 0) < 1 or coalesce(v_rate, 0) <= 0 then
    return 0;
  end if;
  -- One rep and project at a time, so two leads saved together never pay one lead twice.
  perform pg_advisory_xact_lock(hashtextextended(format('special_pay:%s:%s', p_user, p_project), 0));
  select pp.starts_on, pp.ends_on into v_from, v_to from public.pay_period_of((now() at time zone v_tz)::date) pp;

  -- Their leads on it this period, any charged back left out.
  select array_agg(pe.lead_id order by pe.id) into v_leads
    from public.pay_events pe
   where pe.user_id = p_user and pe.project_id = p_project and pe.kind = 'lead' and not pe.is_chargeback
     and not exists (select 1 from public.pay_events r where r.reverses_id = pe.id)
     and pe.created_at >= (v_from::timestamp at time zone v_tz)
     and pe.created_at <  ((v_to + 1)::timestamp at time zone v_tz);
  if coalesce(cardinality(v_leads), 0) < v_goal then
    return 0;
  end if;

  -- Already hit this period? (Then this is one lead more, and no second message.)
  select count(*) into v_had
    from public.pay_events b
   where b.user_id = p_user and b.project_id = p_project and b.kind = 'special' and not b.is_chargeback
     and not exists (select 1 from public.pay_events r where r.reverses_id = b.id)
     and b.created_at >= (v_from::timestamp at time zone v_tz)
     and b.created_at <  ((v_to + 1)::timestamp at time zone v_tz);

  insert into public.pay_events (user_id, project_id, lead_id, kind, amount, note, created_by)
  select p_user, p_project, l.id, 'special', v_rate,
         format('Special Pay: %s leads on this project in the pay period %s – %s', v_goal, to_char(v_from, 'FMMM/FMDD'), to_char(v_to, 'FMMM/FMDD')),
         public.app_user_id()
    from unnest(v_leads) as l(id)
   where l.id is not null
     and not exists (select 1 from public.pay_events b
                      where b.kind = 'special' and b.lead_id = l.id and b.user_id = p_user and not b.is_chargeback
                        and not exists (select 1 from public.pay_events r where r.reverses_id = b.id));
  get diagnostics v_new = row_count;

  if v_new > 0 and v_had = 0 then
    select r.id, r.enabled into v_rule, v_on from public.alert_rules r where r.trigger = 'special_pay' order by r.id limit 1;
    if v_rule is null or v_on then
      insert into public.notifications (user_id, kind, title, body, link)
      select u.id, 'lead',
             left(format('Special Pay: you hit %s leads on %s', v_goal, v_name), 160),
             left(format('That is %s more for each of your %s leads there this pay period (%s so far), and for each lead after it until %s. It is on your pay summary as Special Pay.',
                         to_char(v_rate, 'FM$999,990.00'), cardinality(v_leads), to_char(v_rate * v_new, 'FM$999,990.00'), to_char(v_to, 'FMMM/FMDD')), 1000),
             '/reports/pay'
        from public.users u where u.id = p_user and u.status = 'active';
      if found and v_rule is not null then
        insert into public.alert_log (rule_id, subject, detail, status)
        values (v_rule, left(format('Special Pay: %s leads on %s', v_goal, v_name), 200), 'In-app to 1 person', 'sent');
      end if;
    end if;
  end if;
  return v_new;
end $$;
revoke execute on function public.award_special_pay(bigint, bigint) from public, anon, authenticated;

-- pay(): as before, then Special Pay once a lead is paid.
create or replace function public.pay(p_user bigint, p_project bigint, p_kind text, p_lead bigint,
                                      p_appointment bigint, p_call bigint, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_id bigint;
begin
  -- A lead is developed once: no second payment for it unless the first was
  -- charged back (a lead moved back to its DBDev project and promoted again).
  if p_kind = 'lead' and exists (
       select 1 from public.pay_events pe
        where pe.lead_id = p_lead and pe.kind = 'lead' and not pe.is_chargeback
          and not exists (select 1 from public.pay_events r where r.reverses_id = pe.id)) then
    return '[]'::jsonb;
  end if;
  select case p_kind when 'lead' then lead_rate when 'appointment' then appointment_rate else confirmation_rate end
    into v_amount from public.projects where id = p_project;
  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, note, created_by)
  values (p_user, p_project, p_lead, p_appointment, p_call, p_kind, coalesce(v_amount, 0), p_note, public.app_user_id())
  returning id into v_id;
  if p_kind = 'lead' then
    perform public.award_special_pay(p_user, p_project);
  end if;
  return jsonb_build_object('id', v_id, 'user_id', p_user, 'kind', p_kind, 'amount', coalesce(v_amount, 0));
end $$;
revoke execute on function public.pay(bigint, bigint, text, bigint, bigint, bigint, text) from public, anon, authenticated;

-- charge_back(): as before; a lead's chargeback takes its Special Pay back too.
create or replace function public.charge_back(p_lead bigint, p_appointment bigint, p_kinds text[], p_call bigint, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_out jsonb := '[]'::jsonb;
  v_id bigint;
  v_kinds text[] := case when 'lead' = any(p_kinds) then p_kinds || array['special'] else p_kinds end;
begin
  for e in
    select pe.* from public.pay_events pe
     where pe.kind = any(v_kinds)
       and pe.reverses_id is null
       and (p_lead is null or pe.lead_id = p_lead)
       and (p_appointment is null or pe.appointment_id = p_appointment)
       and not exists (select 1 from public.pay_events x where x.reverses_id = pe.id)
     order by pe.id
     for update
  loop
    insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, reverses_id, note, created_by)
    values (e.user_id, e.project_id, e.lead_id, e.appointment_id, p_call, e.kind, -e.amount, e.id, p_note, public.app_user_id())
    returning id into v_id;
    v_out := v_out || jsonb_build_object('id', v_id, 'user_id', e.user_id, 'kind', e.kind, 'amount', -e.amount, 'reverses', e.id);
  end loop;
  return v_out;
end $$;
revoke execute on function public.charge_back(bigint, bigint, text[], bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The reports: Special Pay of its own, Confirmation pay by its name
-- ---------------------------------------------------------------------------

drop function if exists public.pay_report(date, date, bigint);

/**
 * As before, with each person's Special Pay, any charged back taken off
 * (specials: the leads it is paid on; special_goal_pay: what it comes to),
 * which is in their commission.
 */
create function public.pay_report(p_from date, p_to date, p_user bigint default null)
returns table (
  user_id bigint, first_name text, last_name text, email text, role text,
  pay_model text, hourly_rate numeric,
  worked_minutes int, paid_minutes int,
  hourly_pay numeric, commission numeric, pay numeric,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint,
  specials bigint, special_goal_pay numeric
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
           count(*) filter (where pe.is_chargeback) as backs,
           -- Special Pay net of any charged back: the leads it is still paid on, and what it comes to.
           count(*) filter (where pe.kind = 'special' and not pe.is_chargeback) - count(*) filter (where pe.kind = 'special' and pe.is_chargeback) as specials,
           sum(pe.amount) filter (where pe.kind = 'special') as special_amt
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
           coalesce(m.confirms, 0) as confirms, coalesce(m.backs, 0) as backs,
           coalesce(m.specials, 0) as specials, round(coalesce(m.special_amt, 0), 2) as special_amt
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
         f.calls, f.leads, f.appts, f.confirms, f.backs, f.specials, f.special_amt
    from figures f
   order by f.first_name, f.last_name, f.id;
end $$;
revoke execute on function public.pay_report(date, date, bigint) from public, anon;
grant execute on function public.pay_report(date, date, bigint) to authenticated;

drop function if exists public.production_report(date, date, bigint, bigint);

/**
 * Per day (in the business's time zone), rep and project: calls made, the
 * paid events, and what they came to by kind (lead pay, appointment pay,
 * confirmation pay, Special Pay, chargebacks) and in total. Anyone but an
 * administrator sees only their own rows, whatever p_user_id says.
 * special_pay is confirmation_pay's old name, kept while the app deployed
 * before this still reads it; a later migration drops it.
 */
create function public.production_report(p_from date, p_to date,
                                         p_project_id bigint default null, p_user_id bigint default null)
returns table (
  day date, user_id bigint, first_name text, last_name text, email text,
  project_id bigint, project text, client_id bigint, client text,
  calls bigint, leads bigint, appointments bigint, confirmations bigint, chargebacks bigint,
  lead_pay numeric, appointment_pay numeric, special_pay numeric, chargeback_amount numeric,
  amount numeric, confirmation_pay numeric, specials bigint, special_goal_pay numeric
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
           count(*) filter (where pe.kind = 'special'      and not pe.is_chargeback) as specials,
           sum(pe.amount) filter (where pe.kind = 'lead'         and not pe.is_chargeback) as lead_amt,
           sum(pe.amount) filter (where pe.kind = 'appointment'  and not pe.is_chargeback) as appt_amt,
           sum(pe.amount) filter (where pe.kind = 'confirmation' and not pe.is_chargeback) as confirm_amt,
           sum(pe.amount) filter (where pe.kind = 'special'      and not pe.is_chargeback) as special_amt,
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
         coalesce(e.lead_amt, 0)::numeric, coalesce(e.appt_amt, 0)::numeric, coalesce(e.confirm_amt, 0)::numeric,
         coalesce(e.back_amt, 0)::numeric, coalesce(e.amount, 0)::numeric,
         coalesce(e.confirm_amt, 0)::numeric, coalesce(e.specials, 0), coalesce(e.special_amt, 0)::numeric
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

-- ---------------------------------------------------------------------------
-- 5. The Pipeline Report: the project's own time zone; a DB dev project's Special Pay
-- ---------------------------------------------------------------------------

drop function if exists public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]);

/**
 * As before, except: the time zone is the project's own (none set: none), and
 * special_pay is a DB dev project's Special Pay a lead (special_goal: the
 * leads a pay period it takes), an appointment project's its confirmation pay.
 */
create function public.pipeline_report(p_months int[] default null, p_project_ids bigint[] default null,
  p_company_id bigint default null, p_type text default null, p_rep_id bigint default null, p_user_ids bigint[] default null)
returns table (project_id bigint, project text, project_type text, time_zone text, state text,
  manager_id bigint, manager_first text, manager_last text, last_appt_set date, last_worked timestamptz, calls bigint,
  months jsonb, total bigint, appts bigint, off_list bigint, viable_left bigint,
  pay numeric, special_pay numeric, sales_rep_first text, sales_rep_last text, shared_with jsonb, special_goal int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me     bigint := public.app_user_id();
  v_tz     text := public.business_tz();
  v_today  date := (now() at time zone public.business_tz())::date;
  v_months int[] := p_months;
  v_allowed bigint[];
begin
  if v_me is null or not public.is_staff() then
    raise exception 'The Pipeline Report is for staff' using errcode = '42501';
  end if;
  if v_months is null or cardinality(v_months) = 0 then
    v_months := array(select ((extract(month from v_today)::int - 1 + i) % 12) + 1 from generate_series(1, 3) i);
  end if;
  -- The projects this person may read: every one (an administrator), or those they are assigned to.
  if public.is_admin() then
    v_allowed := p_project_ids;
  else
    v_allowed := array(select pa.project_id from public.project_assignments pa where pa.ae_user_id = v_me
                        and (p_project_ids is null or pa.project_id = any(p_project_ids)));
  end if;

  return query
  with names as (
    select x.project_id as pid, x.user_id as uid, x.month as m, x.bucket
      from public.xdate_names(v_allowed, p_company_id, p_type, p_rep_id, p_user_ids) x
     where x.month = any(v_months) and x.user_id is not null
  ), per_month as (
    select n.pid, n.uid, n.m, count(*) as c from names n group by 1, 2, 3
  ), per_row as (
    select n.pid, n.uid, count(*) as total,
           count(*) filter (where n.bucket = 'appointment') as appts,
           count(*) filter (where n.bucket = 'off') as off_list,
           count(*) filter (where n.bucket = 'viable') as viable_left
      from names n group by 1, 2
  )
  select pr.id, pr.name, t.code,
         tz.name, coalesce(nullif(pr.state, ''), c.state),
         u.id, u.first_name, u.last_name,
         (select max((coalesce(a.appt_create_date, a.created_at) at time zone v_tz)::date) from public.appointments a
           where a.user_id = r.uid and coalesce(a.set_project_id, a.project_id) = r.pid and a.deleted_at is null),
         (select max(cr.call_date) from public.call_records cr where cr.user_id = r.uid and cr.project_id = r.pid),
         (select count(*) from public.call_records cr where cr.user_id = r.uid and cr.project_id = r.pid
             and cr.call_date >= (date_trunc('month', v_today)::timestamp at time zone v_tz)),
         (select jsonb_object_agg(pm.m, pm.c) from per_month pm where pm.pid = r.pid and pm.uid = r.uid),
         r.total, r.appts, r.off_list, r.viable_left,
         case when t.code = 'DBDV' then pr.lead_rate else pr.appointment_rate end,
         case when t.code = 'DBDV' then pr.special_rate else pr.confirmation_rate end,
         sr.first_name, sr.last_name,
         coalesce((select jsonb_agg(jsonb_build_object('first', o.first_name, 'last', o.last_name) order by o.first_name, o.last_name)
                     from public.project_assignments pa join public.users o on o.id = pa.ae_user_id
                    where pa.project_id = r.pid and pa.ae_user_id <> r.uid and o.status = 'active' and o.deleted_at is null), '[]'::jsonb),
         case when t.code = 'DBDV' then pr.special_goal end
    from per_row r
    join public.projects pr on pr.id = r.pid
    join public.users u on u.id = r.uid
    left join public.project_types t on t.id = pr.project_type_id
    left join public.companies c on c.id = pr.company_id
    left join public.timezones tz on tz.id = pr.timezone_id
    left join public.users sr on sr.id = c.sales_rep_id;
end $$;
revoke execute on function public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]) from public, anon;
grant execute on function public.pipeline_report(int[], bigint[], bigint, text, bigint, bigint[]) to authenticated;
