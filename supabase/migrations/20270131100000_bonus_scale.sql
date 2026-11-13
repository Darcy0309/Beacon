-- Bonus plans, as Sean set them out (Nov 2026):
--
--   Appointment manager, each half of a pay period: a scale, not tiers. Each valid appointment set from
--     the 21st to the 30th is $5, and from the 31st on $10 (21 = $5, 28 = $40, 30 = $50, 32 = $70,
--     50 = $250). The same scale for each half, so a poor first half doesn't spoil the second.
--     app_settings 'bonus_plans' -> 'appt_weekly_scale': [{ from, each }].
--   Appointment manager, each month: 100 to 149 valid = $300; 150 or more = $500 in all (as before).
--   Lead manager, each half: units counted on the half they were earned in. A lead found invalid (or
--     corrected) later comes off the half its pay was earned in, not the half it is found in. When that
--     takes an already paid half under its tier, what was paid over is taken back on the pay period it
--     is found in (a 'lead_adjust' line, a minus amount).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The plans
-- ---------------------------------------------------------------------------

create or replace function public.bonus_rules()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'first_days',   coalesce((r->>'first_days')::int, 5),
    'units',        coalesce(r->'units', '{"lead": 1, "appointment": 2, "dec_sheet": 1}'::jsonb),
    'lead_weekly',  coalesce(r->'lead_weekly', '[{"at": 50, "amount": 50}, {"at": 75, "amount": 75}]'::jsonb),
    'appt_weekly_scale', coalesce(r->'appt_weekly_scale', '[{"from": 21, "each": 5}, {"from": 31, "each": 10}]'::jsonb),
    'appt_monthly', coalesce(r->'appt_monthly', '[{"at": 100, "amount": 300}, {"at": 150, "amount": 500}]'::jsonb),
    'monthly_total', coalesce((r->>'monthly_total')::boolean, true))
  from (select coalesce((select s.value from public.app_settings s where s.key = 'bonus_plans'), '{}'::jsonb) as r) x;
$$;
revoke execute on function public.bonus_rules() from public, anon;
grant execute on function public.bonus_rules() to authenticated;

/** What a scale [{ from, each }] pays for `n`: each step's rate for every one from its start to the next step's. */
create or replace function public.bonus_scale(p_scale jsonb, p_n numeric)
returns numeric
language sql immutable set search_path = public as $$
  with s as (
    select (x->>'from')::numeric as f, (x->>'each')::numeric as each_,
           lead((x->>'from')::numeric) over (order by (x->>'from')::numeric) as nf
      from jsonb_array_elements(coalesce(p_scale, '[]'::jsonb)) x
     where (x->>'from')::numeric > 0 and (x->>'each')::numeric > 0
  )
  select coalesce(sum(greatest(0, least(floor(p_n), coalesce(nf - 1, floor(p_n))) - f + 1) * each_), 0) from s;
$$;
revoke execute on function public.bonus_scale(jsonb, numeric) from public, anon;
grant execute on function public.bonus_scale(jsonb, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- A lead manager's units, on the half they were earned in, as they stood at a moment
-- ---------------------------------------------------------------------------

drop function if exists public.bonus_units(bigint, date, date);

/**
 * A lead manager's units earned on the business's days p_from..p_to, as they stood at p_as_of: each
 * lead, appointment and dec sheet paid by then, less those charged back by p_as_of (a chargeback
 * counted on the half of the pay it takes back).
 */
create or replace function public.bonus_units(p_user bigint, p_from date, p_to date, p_as_of timestamptz default now())
returns numeric
language sql stable set search_path = public as $$
  with w as (select public.bonus_rules()->'units' as w),
       b as (select (p_from::timestamp at time zone public.business_tz()) as s,
                    ((p_to + 1)::timestamp at time zone public.business_tz()) as e)
  select coalesce(sum(coalesce((w.w->>pe.kind)::numeric, 0)
           * case when pe.reverses_id is not null or pe.is_chargeback then -1 else 1 end), 0)
    from public.pay_events pe
    cross join w cross join b
    left join public.pay_events o on o.id = pe.reverses_id
   where pe.user_id = p_user and pe.kind in ('lead', 'appointment', 'dec_sheet')
     and pe.created_at <= p_as_of  -- inclusive: now() is the transaction's start, when what it pays is written
     and case when pe.reverses_id is not null
              then o.created_at >= b.s and o.created_at < b.e
              else pe.created_at >= b.s and pe.created_at < b.e end;
$$;
revoke execute on function public.bonus_units(bigint, date, date, timestamptz) from public, anon;
grant execute on function public.bonus_units(bigint, date, date, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- The bonuses
-- ---------------------------------------------------------------------------

/**
 * The bonuses paid in the pay periods that end on p_from..p_to, one row each: whose, which plan, the
 * days counted, how many, the amount, and the pay period it is paid in.
 *   lead          each half of a period: units, paid that period (as they stood at its end)
 *   lead_adjust   an earlier half's units bonus taken back (a minus amount) on the period that found the
 *                 leads invalid that took it under its tier
 *   appt_weekly   each half of a period: valid appointments set, on the scale, paid the period after
 *   appt_monthly  a month's valid appointments set, a tier paid in the period its last appointment's
 *                 date passes (the month over by then)
 */
create or replace function public.pay_bonuses(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, plan text, label text, from_day date, to_day date, counted numeric, amount numeric, paid_from date, paid_to date)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare
  v_rules  jsonb := public.bonus_rules();
  v_first  int   := greatest(coalesce((v_rules->>'first_days')::int, 5), 1);
  v_tz     text  := public.business_tz();
  v_today  date  := (now() at time zone public.business_tz())::date;
  per      record;
  nxt      record;
  q        record;
  u        record;
  h        record;
  m        date;
  t        record;
  v_n      numeric;
  v_amt    numeric;
  v_was    numeric;
  v_prev   numeric;
  v_at     date;
  v_paid   record;
  v_end    timestamptz;
begin
  for per in
    select distinct (public.pay_period_of(d::date)).starts_on as s, (public.pay_period_of(d::date)).ends_on as e
      from generate_series(p_from - 70, p_to, interval '1 day') d
     order by 1
  loop
    -- As things stood when the period closed (or now, while it is open).
    v_end := least(now(), (per.e + 1)::timestamp at time zone v_tz);
    for h in
      select per.s as hs, least(per.s + v_first - 1, per.e) as he, 1 as half
      union all
      select per.s + v_first, per.e, 2 where per.s + v_first <= per.e
    loop
      -- A lead manager's units, paid the same period.
      if per.e between p_from and p_to then
        for u in select pp.user_id as uid from public.pay_profiles pp
                  where pp.bonus_plan = 'lead' and (p_user is null or pp.user_id = p_user) loop
          v_n := public.bonus_units(u.uid, h.hs, h.he, v_end);
          if public.bonus_tier(v_rules->'lead_weekly', v_n) > 0 then
            user_id := u.uid; plan := 'lead'; label := 'Units'; from_day := h.hs; to_day := h.he;
            counted := v_n; amount := public.bonus_tier(v_rules->'lead_weekly', v_n); paid_from := per.s; paid_to := per.e;
            return next;
          end if;
        end loop;
      end if;
      -- An appointment manager's half, on the scale, paid the period after.
      select * into nxt from public.pay_period_of(per.e + 1);
      if nxt.ends_on between p_from and p_to then
        for u in select pp.user_id as uid from public.pay_profiles pp
                  where pp.bonus_plan = 'appointment' and (p_user is null or pp.user_id = p_user) loop
          v_n := public.bonus_appointments(u.uid, h.hs, h.he);
          v_amt := public.bonus_scale(v_rules->'appt_weekly_scale', v_n);
          if v_amt > 0 then
            user_id := u.uid; plan := 'appt_weekly'; label := 'Valid appointments'; from_day := h.hs; to_day := h.he;
            counted := v_n; amount := v_amt; paid_from := nxt.starts_on; paid_to := nxt.ends_on;
            return next;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  -- An earlier half's units bonus taken back: leads found invalid during period q, from a half paid before it.
  for q in
    select distinct (public.pay_period_of(d::date)).starts_on as s, (public.pay_period_of(d::date)).ends_on as e
      from generate_series(p_from - 31, p_to, interval '1 day') d
  loop
    continue when q.e < p_from or q.e > p_to or q.s > v_today;
    for u in select pp.user_id as uid from public.pay_profiles pp
              where pp.bonus_plan = 'lead' and (p_user is null or pp.user_id = p_user) loop
      for per in
        select distinct (public.pay_period_of(d::date)).starts_on as s, (public.pay_period_of(d::date)).ends_on as e
          from generate_series(q.s - 180, q.s - 1, interval '1 day') d
      loop
        continue when per.e >= q.s;
        for h in
          select per.s as hs, least(per.s + v_first - 1, per.e) as he
          union all
          select per.s + v_first, per.e where per.s + v_first <= per.e
        loop
          v_was := public.bonus_tier(v_rules->'lead_weekly', public.bonus_units(u.uid, h.hs, h.he, q.s::timestamp at time zone v_tz));
          continue when v_was = 0;
          v_n := public.bonus_units(u.uid, h.hs, h.he, least(now(), (q.e + 1)::timestamp at time zone v_tz));
          v_amt := public.bonus_tier(v_rules->'lead_weekly', v_n);
          if v_amt < v_was then
            user_id := u.uid; plan := 'lead_adjust'; label := 'Units bonus taken back'; from_day := h.hs; to_day := h.he;
            counted := v_n; amount := v_amt - v_was; paid_from := q.s; paid_to := q.e;
            return next;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  -- An appointment manager's month: each tier paid in the period its last appointment's date passes.
  for m in select generate_series(date_trunc('month', p_from - 150)::date, date_trunc('month', p_to)::date, interval '1 month')::date loop
    for u in select pp.user_id as uid from public.pay_profiles pp
              where pp.bonus_plan = 'appointment' and (p_user is null or pp.user_id = p_user) loop
      v_n := public.bonus_appointments(u.uid, m, (m + interval '1 month')::date - 1);
      v_prev := 0;
      for t in select (x->>'at')::int as at_n, (x->>'amount')::numeric as amt
                 from jsonb_array_elements(v_rules->'appt_monthly') x order by 1 loop
        exit when v_n < t.at_n;
        -- The date the tier is reached: the month over, and the t.at_n-th appointment's date passed.
        select greatest((m + interval '1 month')::date,
                        coalesce(a.appt_date, (a.created_at at time zone public.business_tz())::date) + 1) into v_at
          from public.appointments a
         where a.user_id = u.uid and a.deleted_at is null and a.invalid_at is null and a.qa_status is distinct from 'failed'
           and a.created_at >= (m::timestamp at time zone public.business_tz())
           and a.created_at <  (((m + interval '1 month')::date)::timestamp at time zone public.business_tz())
         order by coalesce(a.appt_date, (a.created_at at time zone public.business_tz())::date), a.id
         offset t.at_n - 1 limit 1;
        if v_at is not null and v_at <= v_today then
          select * into v_paid from public.pay_period_of(v_at);
          if v_paid.ends_on between p_from and p_to then
            user_id := u.uid; plan := 'appt_monthly'; label := to_char(m, 'FMMonth') || ' valid appointments';
            from_day := m; to_day := (m + interval '1 month')::date - 1; counted := t.at_n;
            amount := case when coalesce((v_rules->>'monthly_total')::boolean, true) then t.amt - v_prev else t.amt end;
            paid_from := v_paid.starts_on; paid_to := v_paid.ends_on;
            if amount > 0 then return next; end if;
          end if;
        end if;
        v_prev := t.amt;
      end loop;
    end loop;
  end loop;
end $$;
revoke execute on function public.pay_bonuses(date, date, bigint) from public, anon;
grant execute on function public.pay_bonuses(date, date, bigint) to authenticated;

/**
 * A bonus just reached in this half of the pay period: its manager congratulated, once. A lead manager
 * at each units tier; an appointment manager at each step of the scale (the 21st valid, the 31st…).
 */
create or replace function public.bonus_notify(p_user bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rules jsonb := public.bonus_rules();
  v_first int   := greatest(coalesce((v_rules->>'first_days')::int, 5), 1);
  v_today date  := (now() at time zone public.business_tz())::date;
  v_plan  text;
  per     record;
  v_hs    date;
  v_he    date;
  v_n     numeric;
  t       record;
  v_new   boolean;
  v_days  text;
begin
  select bonus_plan into v_plan from public.pay_profiles where user_id = p_user;
  if v_plan is null then return; end if;
  select * into per from public.pay_period_of(v_today);
  if v_today < per.starts_on + v_first then
    v_hs := per.starts_on; v_he := least(per.starts_on + v_first - 1, per.ends_on);
  else
    v_hs := per.starts_on + v_first; v_he := per.ends_on;
  end if;
  v_days := to_char(v_hs, 'FMMM/FMDD') || '–' || to_char(v_he, 'FMMM/FMDD');
  if v_plan = 'lead' then
    v_n := public.bonus_units(p_user, v_hs, v_he);
    for t in select (x->>'at')::numeric as at_n, (x->>'amount')::numeric as amt
               from jsonb_array_elements(v_rules->'lead_weekly') x order by 1 loop
      continue when v_n < t.at_n;
      insert into public.bonus_notices (user_id, key) values (p_user, 'lead:' || v_hs || ':' || t.at_n)
      on conflict do nothing returning true into v_new;
      if v_new then
        -- Written straight in: notify_users() leaves out whoever is acting, and here that is the manager themselves.
        insert into public.notifications (user_id, kind, title, body, link)
        values (p_user, 'system', 'Congrats! You hit your ' || to_char(t.amt, 'FM$999,990') || ' bonus',
          t.at_n || ' units ' || v_days || ' · on this pay period''s check', '/reports/pay');
      end if;
      v_new := null;
    end loop;
  else
    v_n := public.bonus_appointments(p_user, v_hs, v_he);
    for t in select (x->>'from')::numeric as at_n, (x->>'each')::numeric as each_
               from jsonb_array_elements(v_rules->'appt_weekly_scale') x order by 1 loop
      continue when v_n < t.at_n;
      insert into public.bonus_notices (user_id, key) values (p_user, 'appointment:' || v_hs || ':' || t.at_n)
      on conflict do nothing returning true into v_new;
      if v_new then
        insert into public.notifications (user_id, kind, title, body, link)
        values (p_user, 'system',
          'Congrats! You hit your ' || to_char(public.bonus_scale(v_rules->'appt_weekly_scale', t.at_n), 'FM$999,990') || ' bonus',
          t.at_n || ' valid appointments set ' || v_days || ' · ' || to_char(t.each_, 'FM$999,990') || ' more for each one after this · on next pay period''s check, if they stay valid',
          '/reports/pay');
      end if;
      v_new := null;
    end loop;
  end if;
end $$;
revoke execute on function public.bonus_notify(bigint) from public, anon, authenticated;
