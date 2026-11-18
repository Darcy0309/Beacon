-- Pay & Hours over a long range ("This year") ran until the page gave up (client, Nov 2026). The bonuses
-- (pay_bonuses(), under pay_report()) worked out each day's pay period twice, for every day of the range, and,
-- for every period in it and every lead manager, every day of the 180 before it again, with each earlier
-- half's units counted twice: tens of thousands of lookups for a year. The periods are now walked once
-- (pay_periods_in()), and a period is looked into for a units bonus taken back only when that manager had
-- a lead, appointment or dec sheet taken back during it (nothing else can lower an earlier half: a new one
-- counts on its own day). Same answers, same signature.
--
-- Safe to run more than once.

/** The pay periods touching the business's days p_from..p_to, in order: each looked up once, not each day. */
create or replace function public.pay_periods_in(p_from date, p_to date)
returns table (s date, e date)
language plpgsql stable set search_path = public as $$
declare
  d     date := p_from;
  per   record;
  last_ date;
begin
  while d <= p_to loop
    select * into per from public.pay_period_of(d);
    if last_ is distinct from per.starts_on then
      s := per.starts_on; e := per.ends_on;
      return next;
      last_ := per.starts_on;
    end if;
    -- The day after the period (a custom schedule with a gap: the next day).
    d := greatest(per.ends_on, d) + 1;
  end loop;
end $$;
revoke execute on function public.pay_periods_in(date, date) from public, anon;
grant execute on function public.pay_periods_in(date, date) to authenticated;

do $$ begin
  create type public.pay_period_span as (s date, e date);
exception when duplicate_object then null; end $$;

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
  v_back   public.pay_period_span[];
  v_q0     timestamptz;
  v_q1     timestamptz;
begin
  for per in select pp.s, pp.e from public.pay_periods_in(p_from - 70, p_to) pp loop
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
  -- The periods worked out once (not a lookup a day for every period), and a period q looked into only for
  -- a manager with a lead, appointment or dec sheet taken back during it: nothing else lowers an earlier half.
  v_back := array(select row(pp.s, pp.e)::public.pay_period_span from public.pay_periods_in(p_from - 31 - 180 - 62, p_to) pp);
  for q in select pp.s, pp.e from public.pay_periods_in(p_from - 31, p_to) pp loop
    continue when q.e < p_from or q.e > p_to or q.s > v_today;
    v_q0 := q.s::timestamp at time zone v_tz;
    v_q1 := least(now(), (q.e + 1)::timestamp at time zone v_tz);
    for u in select pp.user_id as uid from public.pay_profiles pp
              where pp.bonus_plan = 'lead' and (p_user is null or pp.user_id = p_user)
                and exists (select 1 from public.pay_events pe
                             where pe.user_id = pp.user_id and pe.kind in ('lead', 'appointment', 'dec_sheet')
                               and (pe.is_chargeback or pe.reverses_id is not null)
                               and pe.created_at > v_q0 and pe.created_at <= v_q1) loop
      for per in
        select b.s, b.e from unnest(v_back) b where b.e < q.s and b.e >= q.s - 180 order by b.s
      loop
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

notify pgrst, 'reload schema';
