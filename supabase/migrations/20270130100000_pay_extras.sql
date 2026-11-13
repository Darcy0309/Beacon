-- =============================================================================
-- Pay and bonus additions (Sean, Nov 2026: "items my team sent me that I never addressed")
--
--   1. Dec Sheet Pay      a manager ticks "Dec sheet received" on a lead with a file attached (the
--                         prospect's policy information): the project's dec sheet rate, once a lead
--                         (projects.dec_sheet_rate, $10 unless an administrator or the client's Sales Rep
--                         sets another); unticked, it is taken back. set_dec_sheet().
--   2. Lead-Corrected     the developer's lead pay moves to whoever corrects the lead (record_call_result:
--                         p_lead_manager names the developer of a lead with none on record).
--   3. A manager's rates  pay_profiles.appointment_rate / confirmation_rate: theirs on every project, in
--                         place of the project's (pay()).
--   4. Special Pay requests  a manager asks the project's Sales Rep (administrators when it has none) for
--                         an amount on a lead; approved, as asked or adjusted, it is paid. special_pay_requests.
--   5. Bonuses            each manager's plan (pay_profiles.bonus_plan): a lead manager's units for each
--                         half of a pay period (lead 1, appointment 2, dec sheet 1), paid that period; an
--                         appointment manager's valid appointments set in each half, paid the period
--                         after, and in a month, paid once the tier is reached (the appointments' dates
--                         passed). The tiers in Settings (app_settings 'bonus_plans', bonus_rules()).
--                         Worked out from what is on record each time (pay_bonuses()), so an appointment
--                         or lead found invalid later counts against it. A tier hit: a notification.
--   pay_report            + dec sheets, corrections, Special Pay requests and bonuses; a bonus is on top
--                         of the pay (a hybrid's too).
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The new kinds of pay
-- ---------------------------------------------------------------------------

alter table public.pay_events drop constraint if exists pay_events_kind_check;
alter table public.pay_events add constraint pay_events_kind_check
  check (kind in ('lead', 'appointment', 'confirmation', 'special', 'dec_sheet', 'corrected', 'request'));

-- ---------------------------------------------------------------------------
-- 1. Dec Sheet Pay
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists dec_sheet_rate numeric(10,2) not null default 10;
alter table public.projects drop constraint if exists projects_dec_sheet_rate_check;
alter table public.projects add constraint projects_dec_sheet_rate_check check (dec_sheet_rate between 0 and 1000);
comment on column public.projects.dec_sheet_rate is 'Dec Sheet Pay: USD to the manager who gets a prospect''s policy information, once a lead';

alter table public.leads add column if not exists dec_sheet_at timestamptz;
alter table public.leads add column if not exists dec_sheet_by bigint references public.users(id) on delete set null;
alter table public.leads add column if not exists dec_sheet_document_id bigint references public.documents(id) on delete set null;

-- Only through set_project_dec_sheet_rate() (administrators, the client's Sales Rep), or an administrator.
create or replace function public.tg_projects_dec_sheet_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin()
     and (tg_op = 'INSERT' and new.dec_sheet_rate is distinct from 10
          or tg_op = 'UPDATE' and new.dec_sheet_rate is distinct from old.dec_sheet_rate) then
    raise exception 'Only administrators and the client''s Sales Rep set the dec sheet rate' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists projects_dec_sheet_guard on public.projects;
create trigger projects_dec_sheet_guard before insert or update on public.projects
  for each row execute function public.tg_projects_dec_sheet_guard();

create or replace function public.tg_leads_dec_sheet_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin()
     and (tg_op = 'INSERT' and (new.dec_sheet_at is not null or new.dec_sheet_by is not null)
          or tg_op = 'UPDATE' and (new.dec_sheet_at, new.dec_sheet_by, new.dec_sheet_document_id)
                                   is distinct from (old.dec_sheet_at, old.dec_sheet_by, old.dec_sheet_document_id)) then
    raise exception 'A dec sheet is marked with its checkbox' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists leads_dec_sheet_guard on public.leads;
create trigger leads_dec_sheet_guard before insert or update on public.leads
  for each row execute function public.tg_leads_dec_sheet_guard();

/** A project's dec sheet rate: an administrator, or the Sales Rep of the project's client. */
create or replace function public.set_project_dec_sheet_rate(p_project_id bigint, p_rate numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
begin
  if v_me is null or not (public.is_admin() or exists (
       select 1 from public.projects pr join public.companies c on c.id = pr.company_id
        where pr.id = p_project_id and c.sales_rep_id = v_me)) then
    raise exception 'Only administrators and the client''s Sales Rep set the dec sheet rate' using errcode = '42501';
  end if;
  if p_rate is null or p_rate < 0 or p_rate > 1000 then
    raise exception 'Choose a dec sheet rate from $0 to $1,000' using errcode = '22023';
  end if;
  update public.projects set dec_sheet_rate = round(p_rate, 2) where id = p_project_id and deleted_at is null;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  return round(p_rate, 2);
end $$;
revoke execute on function public.set_project_dec_sheet_rate(bigint, numeric) from public, anon;
grant execute on function public.set_project_dec_sheet_rate(bigint, numeric) to authenticated;

/**
 * "Dec sheet received" on a lead (p_on), or taken off. Ticked: a file must be on the lead (its policy
 * information), and the one who ticks it is paid the project's dec sheet rate, once a lead however many
 * files come. Unticked (by whoever ticked it, or an administrator): the pay is taken back.
 */
create or replace function public.set_dec_sheet(p_lead_id bigint, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_role text   := public.app_role();
  l      public.leads;
  v_doc  bigint;
  v_amt  numeric(10,2);
  v_pay  jsonb := '[]'::jsonb;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff mark a dec sheet' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;

  if p_on then
    if l.dec_sheet_at is not null then
      raise exception 'The dec sheet on this lead is already marked' using errcode = '22023';
    end if;
    select d.id into v_doc from public.documents d where d.lead_id = l.id and d.deleted_at is null order by d.created_at desc, d.id desc limit 1;
    if v_doc is null then
      raise exception 'Attach the policy information to the lead first (Files)' using errcode = '22023';
    end if;
    update public.leads set dec_sheet_at = now(), dec_sheet_by = v_me, dec_sheet_document_id = v_doc where id = l.id;
    -- Once a lead: a dec sheet paid and not taken back.
    if not exists (select 1 from public.pay_events pe where pe.lead_id = l.id and pe.kind = 'dec_sheet' and not pe.is_chargeback
                    and not exists (select 1 from public.pay_events x where x.reverses_id = pe.id)) then
      select coalesce(dec_sheet_rate, 0) into v_amt from public.projects where id = l.project_id;
      insert into public.pay_events (user_id, project_id, lead_id, kind, amount, note, created_by)
      values (v_me, l.project_id, l.id, 'dec_sheet', coalesce(v_amt, 0), 'Dec sheet received', v_me);
      v_pay := jsonb_build_array(jsonb_build_object('user_id', v_me, 'kind', 'dec_sheet', 'amount', coalesce(v_amt, 0)));
    end if;
    perform public.bonus_notify(v_me);
  else
    if l.dec_sheet_at is null then
      return jsonb_build_object('on', false, 'pay', v_pay);
    end if;
    if l.dec_sheet_by is distinct from v_me and v_role <> 'admin' then
      raise exception 'Only whoever marked the dec sheet, or an administrator, can take it off' using errcode = '42501';
    end if;
    update public.leads set dec_sheet_at = null, dec_sheet_by = null, dec_sheet_document_id = null where id = l.id;
    v_pay := public.charge_back(l.id, null, array['dec_sheet'], null, 'Dec sheet unmarked');
  end if;
  return jsonb_build_object('on', p_on, 'pay', v_pay);
end $$;
revoke execute on function public.set_dec_sheet(bigint, boolean) from public, anon;
grant execute on function public.set_dec_sheet(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A manager's own rates, and their bonus plan
-- ---------------------------------------------------------------------------

alter table public.pay_profiles add column if not exists appointment_rate numeric(10,2);
alter table public.pay_profiles add column if not exists confirmation_rate numeric(10,2);
alter table public.pay_profiles add column if not exists bonus_plan text;
alter table public.pay_profiles drop constraint if exists pay_profiles_extras_check;
alter table public.pay_profiles add constraint pay_profiles_extras_check
  check ((appointment_rate is null or appointment_rate between 0 and 1000)
     and (confirmation_rate is null or confirmation_rate between 0 and 1000)
     and (bonus_plan is null or bonus_plan in ('lead', 'appointment')));
comment on column public.pay_profiles.appointment_rate is 'Their appointment pay on every project, in place of the project''s (null: the project''s)';
comment on column public.pay_profiles.confirmation_rate is 'Their confirmation pay on every project, in place of the project''s (null: the project''s)';
comment on column public.pay_profiles.bonus_plan is 'lead: the lead manager weekly units bonus; appointment: the appointment manager weekly and monthly bonuses';

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
  -- A manager's own appointment and confirmation rates, when they have them, in place of the project's.
  select case p_kind when 'lead' then pr.lead_rate
                     when 'appointment' then coalesce(pp.appointment_rate, pr.appointment_rate)
                     else coalesce(pp.confirmation_rate, pr.confirmation_rate) end
    into v_amount
    from public.projects pr left join public.pay_profiles pp on pp.user_id = p_user
   where pr.id = p_project;
  insert into public.pay_events (user_id, project_id, lead_id, appointment_id, call_record_id, kind, amount, note, created_by)
  values (p_user, p_project, p_lead, p_appointment, p_call, p_kind, coalesce(v_amount, 0), p_note, public.app_user_id())
  returning id into v_id;
  if p_kind = 'lead' then
    perform public.award_special_pay(p_user, p_project);
  end if;
  return jsonb_build_object('id', v_id, 'user_id', p_user, 'kind', p_kind, 'amount', coalesce(v_amount, 0));
end $$;
revoke execute on function public.pay(bigint, bigint, text, bigint, bigint, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Special Pay requests
-- ---------------------------------------------------------------------------

create table if not exists public.special_pay_requests (
  id              bigint generated always as identity primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  project_id      bigint references public.projects(id) on delete set null,
  user_id         bigint not null references public.users(id) on delete cascade,
  decider_id      bigint references public.users(id) on delete set null,
  amount          numeric(10,2) not null check (amount > 0 and amount <= 10000),
  reason          text not null check (length(reason) between 1 and 500),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  approved_amount numeric(10,2) check (approved_amount is null or (approved_amount > 0 and approved_amount <= 10000)),
  decision_note   text check (length(coalesce(decision_note, '')) <= 500),
  decided_by      bigint references public.users(id) on delete set null,
  decided_at      timestamptz,
  pay_event_id    bigint references public.pay_events(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists special_pay_requests_lead_idx on public.special_pay_requests (lead_id, created_at desc);
create index if not exists special_pay_requests_decider_idx on public.special_pay_requests (decider_id, status);
create index if not exists special_pay_requests_user_idx on public.special_pay_requests (user_id, created_at desc);

alter table public.special_pay_requests enable row level security;
revoke all on public.special_pay_requests from anon;
grant select on public.special_pay_requests to authenticated;
drop policy if exists special_pay_requests_read on public.special_pay_requests;
create policy special_pay_requests_read on public.special_pay_requests
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()) or decider_id = (select public.app_user_id()));

/** Ask for Special Pay on a lead: to the Sales Rep of its project's client, else the administrators. */
create or replace function public.request_special_pay(p_lead_id bigint, p_amount numeric, p_reason text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me     bigint := public.app_user_id();
  v_role   text   := public.app_role();
  l        public.leads;
  v_rep    bigint;
  v_id     bigint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to     bigint[];
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff ask for Special Pay' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'Enter the amount asked for, up to $10,000' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Say what the Special Pay is for' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = '22023';
  end if;
  select * into l from public.leads where id = p_lead_id and deleted_at is null;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select c.sales_rep_id into v_rep
    from public.projects pr join public.companies c on c.id = pr.company_id
    join public.users u on u.id = c.sales_rep_id and u.status = 'active' and u.deleted_at is null
   where pr.id = l.project_id;
  -- Nobody asks themselves: an administrator decides then.
  if v_rep = v_me then v_rep := null; end if;
  insert into public.special_pay_requests (lead_id, project_id, user_id, decider_id, amount, reason)
  values (l.id, l.project_id, v_me, v_rep, round(p_amount, 2), v_reason)
  returning id into v_id;
  v_to := case when v_rep is not null then array[v_rep]
               else (select array_agg(id) from public.users where role = 'admin' and status = 'active' and deleted_at is null and id <> v_me) end;
  if v_to is not null then
    perform public.notify_users(v_to, 'lead',
      'Special Pay asked for: ' || to_char(round(p_amount, 2), 'FM$999,990.00') || ' · ' || coalesce(l.company_name, 'a lead'),
      concat_ws(' · ', public.actor_name() || ' asks', v_reason), '/leads/' || l.id || '#special-pay');
  end if;
  return v_id;
end $$;
revoke execute on function public.request_special_pay(bigint, numeric, text) from public, anon;
grant execute on function public.request_special_pay(bigint, numeric, text) to authenticated;

/** A Special Pay request decided: approved (as asked, or the amount adjusted) and paid, or declined. */
create or replace function public.decide_special_pay(p_request_id bigint, p_approve boolean, p_amount numeric default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  q      public.special_pay_requests;
  v_amt  numeric(10,2);
  v_ev   bigint;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_co   text;
begin
  select * into q from public.special_pay_requests where id = p_request_id for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if v_me is null or not (public.is_admin() or q.decider_id = v_me) then
    raise exception 'Only the project''s Sales Rep or an administrator decides this request' using errcode = '42501';
  end if;
  if q.user_id = v_me and not public.is_admin() then
    raise exception 'Someone else decides your own request' using errcode = '42501';
  end if;
  if q.status <> 'pending' then
    raise exception 'This request has already been decided' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;
  select company_name into v_co from public.leads where id = q.lead_id;
  if p_approve then
    v_amt := round(coalesce(p_amount, q.amount), 2);
    if v_amt <= 0 or v_amt > 10000 then
      raise exception 'Enter the amount approved, up to $10,000' using errcode = '22023';
    end if;
    insert into public.pay_events (user_id, project_id, lead_id, kind, amount, note, created_by)
    values (q.user_id, q.project_id, q.lead_id, 'request', v_amt, concat_ws(' · ', 'Special Pay', q.reason), v_me)
    returning id into v_ev;
    update public.special_pay_requests
       set status = 'approved', approved_amount = v_amt, decision_note = v_note, decided_by = v_me, decided_at = now(), pay_event_id = v_ev
     where id = q.id;
    perform public.notify_users(array[q.user_id], 'lead',
      'Special Pay approved: ' || to_char(v_amt, 'FM$999,990.00') || ' · ' || coalesce(v_co, 'a lead'),
      concat_ws(' · ', case when v_amt <> q.amount then 'Adjusted from ' || to_char(q.amount, 'FM$999,990.00') end,
                'Added to this pay period by ' || public.actor_name(), v_note), '/leads/' || q.lead_id || '#special-pay');
  else
    update public.special_pay_requests
       set status = 'declined', decision_note = v_note, decided_by = v_me, decided_at = now()
     where id = q.id;
    perform public.notify_users(array[q.user_id], 'lead',
      'Special Pay declined · ' || coalesce(v_co, 'a lead'),
      concat_ws(' · ', 'Declined by ' || public.actor_name(), v_note), '/leads/' || q.lead_id || '#special-pay');
  end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end, 'amount', v_amt);
end $$;
revoke execute on function public.decide_special_pay(bigint, boolean, numeric, text) from public, anon;
grant execute on function public.decide_special_pay(bigint, boolean, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bonuses
-- ---------------------------------------------------------------------------

/**
 * The bonus plans, with the defaults filled in for any an administrator has not set (app_settings
 * 'bonus_plans'). Tiers: [{ at, amount }], the amount for reaching `at` (the highest reached counts).
 *   lead_weekly     units in each half of a pay period: lead 1, appointment 2, dec sheet 1
 *   appt_weekly     valid appointments set in each half, paid the period after
 *   appt_monthly    valid appointments set in a month; `total`: a higher tier's amount is the whole
 *                   bonus (the lower one's already paid comes off it), else each is paid in full
 *   first_days      the days of a period's first half (the rest are its second)
 */
create or replace function public.bonus_rules()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'first_days',   coalesce((r->>'first_days')::int, 5),
    'units',        coalesce(r->'units', '{"lead": 1, "appointment": 2, "dec_sheet": 1}'::jsonb),
    'lead_weekly',  coalesce(r->'lead_weekly', '[{"at": 50, "amount": 50}, {"at": 75, "amount": 75}]'::jsonb),
    'appt_weekly',  coalesce(r->'appt_weekly', '[]'::jsonb),
    'appt_monthly', coalesce(r->'appt_monthly', '[{"at": 100, "amount": 300}, {"at": 150, "amount": 500}]'::jsonb),
    'monthly_total', coalesce((r->>'monthly_total')::boolean, true))
  from (select coalesce((select s.value from public.app_settings s where s.key = 'bonus_plans'), '{}'::jsonb) as r) x;
$$;
revoke execute on function public.bonus_rules() from public, anon;
grant execute on function public.bonus_rules() to authenticated;

/** The highest tier's amount reached by `n`. */
create or replace function public.bonus_tier(p_tiers jsonb, p_n numeric)
returns numeric
language sql immutable set search_path = public as $$
  select coalesce(max((t->>'amount')::numeric), 0)
    from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) t
   where p_n >= (t->>'at')::numeric;
$$;

/** A lead manager's units on the business's days p_from..p_to. */
create or replace function public.bonus_units(p_user bigint, p_from date, p_to date)
returns numeric
language sql stable set search_path = public as $$
  with u as (select public.bonus_rules()->'units' as w)
  select coalesce(sum(case when pe.is_chargeback then -1 else 1 end * coalesce((u.w->>pe.kind)::numeric, 0)), 0)
    from public.pay_events pe, u
   where pe.user_id = p_user and pe.kind in ('lead', 'appointment', 'dec_sheet')
     and pe.created_at >= (p_from::timestamp at time zone public.business_tz())
     and pe.created_at <  ((p_to + 1)::timestamp at time zone public.business_tz());
$$;

/** An appointment manager's valid appointments set on the business's days p_from..p_to (not invalid, not failed QA). */
create or replace function public.bonus_appointments(p_user bigint, p_from date, p_to date)
returns bigint
language sql stable set search_path = public as $$
  select count(*)
    from public.appointments a
   where a.user_id = p_user and a.deleted_at is null and a.invalid_at is null
     and a.qa_status is distinct from 'failed'
     and a.created_at >= (p_from::timestamp at time zone public.business_tz())
     and a.created_at <  ((p_to + 1)::timestamp at time zone public.business_tz());
$$;

/**
 * The bonuses paid in the pay periods that end on p_from..p_to, one row each: whose, which plan, the
 * days counted, how many, the amount, and the pay period it is paid in.
 *   lead          each half of a period: units, paid that period
 *   appt_weekly   each half of a period: valid appointments set, paid the period after
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
  v_today  date  := (now() at time zone public.business_tz())::date;
  per      record;
  nxt      record;
  u        record;
  h        record;
  m        date;
  t        record;
  v_n      numeric;
  v_prev   numeric;
  v_at     date;
  v_paid   record;
begin
  for per in
    select distinct (public.pay_period_of(d::date)).starts_on as s, (public.pay_period_of(d::date)).ends_on as e
      from generate_series(p_from - 70, p_to, interval '1 day') d
     order by 1
  loop
    for h in
      select per.s as hs, least(per.s + v_first - 1, per.e) as he, 1 as half
      union all
      select per.s + v_first, per.e, 2 where per.s + v_first <= per.e
    loop
      -- A lead manager's units, paid the same period.
      if per.e between p_from and p_to then
        for u in select pp.user_id as uid from public.pay_profiles pp
                  where pp.bonus_plan = 'lead' and (p_user is null or pp.user_id = p_user) loop
          v_n := public.bonus_units(u.uid, h.hs, h.he);
          if public.bonus_tier(v_rules->'lead_weekly', v_n) > 0 then
            user_id := u.uid; plan := 'lead'; label := 'Units'; from_day := h.hs; to_day := h.he;
            counted := v_n; amount := public.bonus_tier(v_rules->'lead_weekly', v_n); paid_from := per.s; paid_to := per.e;
            return next;
          end if;
        end loop;
      end if;
      -- An appointment manager's week, paid the period after.
      select * into nxt from public.pay_period_of(per.e + 1);
      if nxt.ends_on between p_from and p_to and jsonb_array_length(v_rules->'appt_weekly') > 0 then
        for u in select pp.user_id as uid from public.pay_profiles pp
                  where pp.bonus_plan = 'appointment' and (p_user is null or pp.user_id = p_user) loop
          v_n := public.bonus_appointments(u.uid, h.hs, h.he);
          if public.bonus_tier(v_rules->'appt_weekly', v_n) > 0 then
            user_id := u.uid; plan := 'appt_weekly'; label := 'Valid appointments'; from_day := h.hs; to_day := h.he;
            counted := v_n; amount := public.bonus_tier(v_rules->'appt_weekly', v_n); paid_from := nxt.starts_on; paid_to := nxt.ends_on;
            return next;
          end if;
        end loop;
      end if;
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

-- Each tier a manager is told of once.
create table if not exists public.bonus_notices (
  user_id    bigint not null references public.users(id) on delete cascade,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.bonus_notices enable row level security;
revoke all on public.bonus_notices from anon, authenticated;

/** A tier just reached in this half of the pay period: its manager congratulated, once. */
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
begin
  select bonus_plan into v_plan from public.pay_profiles where user_id = p_user;
  if v_plan is null then return; end if;
  select * into per from public.pay_period_of(v_today);
  if v_today < per.starts_on + v_first then
    v_hs := per.starts_on; v_he := least(per.starts_on + v_first - 1, per.ends_on);
  else
    v_hs := per.starts_on + v_first; v_he := per.ends_on;
  end if;
  v_n := case v_plan when 'lead' then public.bonus_units(p_user, v_hs, v_he) else public.bonus_appointments(p_user, v_hs, v_he) end;
  for t in select (x->>'at')::numeric as at_n, (x->>'amount')::numeric as amt
             from jsonb_array_elements(case v_plan when 'lead' then v_rules->'lead_weekly' else v_rules->'appt_weekly' end) x
            order by 1 loop
    continue when v_n < t.at_n;
    insert into public.bonus_notices (user_id, key) values (p_user, v_plan || ':' || v_hs || ':' || t.at_n)
    on conflict do nothing returning true into v_new;
    if v_new then
      -- Written straight in: notify_users() leaves out whoever is acting, and here that is the manager themselves.
      insert into public.notifications (user_id, kind, title, body, link)
      values (p_user, 'system',
        'Congrats! You hit your ' || to_char(t.amt, 'FM$999,990') || ' bonus',
        case v_plan when 'lead'
          then t.at_n || ' units ' || to_char(v_hs, 'FMMM/FMDD') || '–' || to_char(v_he, 'FMMM/FMDD') || ' · on this pay period''s check'
          else t.at_n || ' valid appointments set ' || to_char(v_hs, 'FMMM/FMDD') || '–' || to_char(v_he, 'FMMM/FMDD') || ' · on next pay period''s check, if they stay valid' end,
        '/reports/pay');
    end if;
    v_new := null;
  end loop;
end $$;
revoke execute on function public.bonus_notify(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lead-Corrected pay: record_call_result() with the developer named when none is on record
-- ---------------------------------------------------------------------------

drop function if exists public.record_call_result(bigint, bigint, text, jsonb, date, date, text);
create or replace function public.record_call_result(p_lead_id bigint, p_result_id bigint, p_notes text DEFAULT NULL::text, p_appointment jsonb DEFAULT NULL::jsonb, p_corrected_xdate date DEFAULT NULL::date, p_ultimate_xdate date DEFAULT NULL::date, p_client_note text DEFAULT NULL::text, p_lead_manager bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me       bigint := public.app_user_id();
  v_role     text   := public.app_role();
  v_notes    text   := nullif(btrim(coalesce(p_notes, '')), '');
  l          public.leads;
  r          public.call_results;
  a_r        public.call_results;      -- the appointment-stage twin of a DBDev result
  p          public.projects;          -- the project the call is made on
  v_type     text;
  v_appt     public.appointments;
  v_open     public.appointments;      -- an appointment the name already holds, which this one moves
  v_call     bigint;
  v_status   bigint;
  v_rep      bigint;
  v_old_xdate date;
  v_pay      jsonb := '[]'::jsonb;
  v_date     date;
  v_time     text;
  v_dev      bigint;                   -- Lead-Corrected: the lead manager who developed it
  v_back     jsonb;
  v_amt      numeric(10,2);
begin
  if v_me is null or v_role not in ('admin', 'manager', 'agent') then
    raise exception 'Only staff can record call results' using errcode = '42501';
  end if;
  if length(coalesce(v_notes, '')) > 1000 then
    raise exception 'Keep call notes under 1,000 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_client_note, '')) > 2000 then
    raise exception 'Keep the note for the client under 2,000 characters' using errcode = '22023';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select * into r from public.call_results where id = p_result_id;
  if not found then
    raise exception 'Unknown call result' using errcode = '22023';
  end if;
  if r.applies_to = 'report' then
    raise exception '% is recorded automatically, not from a call', r.name using errcode = '22023';
  end if;

  select * into p from public.projects where id = l.project_id;
  if not found then
    raise exception 'This name is not in a project yet' using errcode = '22023';
  end if;
  v_type := public.project_type_code(p.id);

  -- An appointment follow-up acts on the name's open appointment, recorded
  -- against the stage that appointment was set at so each project counts it.
  if r.applies_to = 'appointment' then
    select * into v_appt from public.appointments
     where lead_id = l.id and invalid_at is null
     order by appt_create_date desc, id desc
     limit 1
     for update;
    if not found then
      raise exception 'This name has no appointment to %', case r.effect when 'confirm' then 'confirm' else 'mark invalid' end
        using errcode = '22023';
    end if;
    if r.effect = 'confirm' and v_appt.confirmed_at is not null then
      raise exception 'This appointment is already confirmed' using errcode = '22023';
    end if;
    select * into r from public.call_results
     where name = r.name and project_type = case coalesce(v_appt.set_stage, l.stage) when 'dbdev' then 'DBDV' else 'APPT' end;
  elsif r.project_type <> v_type then
    raise exception '% is not a result for % projects', r.name,
      case v_type when 'DBDV' then 'database-development' else 'appointment' end using errcode = '22023';
  end if;

  if v_role <> 'admin'
     and l.assigned_user_id is distinct from v_me
     and not exists (select 1 from public.project_assignments pa where pa.project_id = l.project_id and pa.ae_user_id = v_me)
     and not (r.applies_to = 'appointment' and coalesce(v_appt.follow_up_user_id, v_appt.user_id) = v_me) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;

  -- The call itself.
  insert into public.call_records (lead_id, project_id, user_id, call_result, notes, result_id, stage, call_date)
  values (l.id, l.project_id, v_me, r.name, v_notes, r.id, l.stage, now())
  returning id into v_call;

  select id into v_status from public.lead_statuses where code = r.status_code;

  update public.leads set
    result_id        = r.id,
    call_result_dbdv = case when r.project_type = 'DBDV' then r.name else call_result_dbdv end,
    call_result_appt = case when r.project_type = 'APPT' then r.name
                            when r.effect = 'appointment_invalid' and stage = 'appt' then r.name
                            else call_result_appt end,
    call_weight      = call_weight + case when r.applies_to = 'name' then 1 else 0 end,
    date_last_worked = now(),
    status_id        = coalesce(v_status, status_id),
    resolved_at      = case when r.viable then null else coalesce(resolved_at, now()) end,
    assigned_user_id = case when r.effect = 'pending' then null else assigned_user_id end
  where id = l.id;

  -- What the result does.
  if r.effect in ('promote', 'appointment') then
    -- A name becomes a Lead or an Appointment only with its renewal date
    -- confirmed: the Ultimate X-Date, entered (or corrected) with this result,
    -- or already on the record. A date on a policy line alone is a potential
    -- renewal the account manager has not confirmed yet.
    if p_ultimate_xdate is not null then
      update public.insurance_details set ultimate_xdate = p_ultimate_xdate where lead_id = l.id;
      if not found then
        insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_ultimate_xdate);
      end if;
    end if;
    if not exists (select 1 from public.insurance_details i where i.lead_id = l.id and i.ultimate_xdate is not null) then
      raise exception 'Enter the Ultimate X-Date: a name becomes a Lead or an Appointment only with its renewal date'
        using errcode = '22023';
    end if;

    -- What the client is told, with the lead sheet: written as the name is
    -- set (given empty, it is cleared). The call notes stay internal.
    if p_client_note is not null then
      update public.leads set client_note = nullif(btrim(p_client_note), '') where id = l.id;
    end if;

    if r.effect = 'appointment' then
      v_date := nullif(p_appointment->>'date', '')::date;
      v_time := nullif(btrim(coalesce(p_appointment->>'time', '')), '');
      if v_date is null then
        raise exception 'Choose the appointment date' using errcode = '22023';
      end if;
      if v_date < current_date - 1 then
        raise exception 'The appointment date has passed' using errcode = '22023';
      end if;
      if v_time is null then
        raise exception 'Choose the appointment time' using errcode = '22023';
      end if;
      if v_time !~* '^\d{1,2}:\d{2}\s?(AM|PM)$' then
        raise exception 'Give the time like 9:30 AM' using errcode = '22023';
      end if;
    end if;

    -- A name that already holds an appointment still to come, or still
    -- waiting for QA, has that one moved: one appointment, paid once.
    -- (Recording the result again is how a rep reschedules from the sheet.)
    -- One that failed QA does not count: the rep sets a real one instead.
    if r.effect = 'appointment' then
      select * into v_open from public.appointments
       where lead_id = l.id and invalid_at is null and qa_status is distinct from 'failed'
         and (qa_status = 'pending' or appt_date >= (now() at time zone public.business_tz())::date)
       order by appt_create_date desc, id desc
       limit 1
       for update;
    end if;

    if v_open.id is not null then
      update public.appointments set
        appt_date    = v_date,
        appt_time    = v_time,
        duration_min = coalesce(nullif(p_appointment->>'duration', '')::int, duration_min),
        rep_name     = coalesce(nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), rep_name),
        status_id    = case when status_id = (select id from public.appointment_statuses where name = 'Scheduled')
                             and (appt_date, coalesce(appt_time, '')) is distinct from (v_date, coalesce(v_time, ''))
                            then (select id from public.appointment_statuses where name = 'Rescheduled')
                            else status_id end,
        status_update_date = now()
      where id = v_open.id
      returning * into v_appt;
      -- "Moved" only when the day or the time changed.
      update public.call_records set
        appointment_id = v_appt.id,
        notes = case when (v_open.appt_date, coalesce(v_open.appt_time, '')) is distinct from (v_date, coalesce(v_time, ''))
                     then concat_ws(E'\n', notes, 'Appointment moved from ' || to_char(v_open.appt_date, 'Mon FMDD')
                            || coalesce(' ' || v_open.appt_time, '') || ' to ' || to_char(v_date, 'Mon FMDD') || coalesce(' ' || v_time, ''))
                     else notes end
      where id = v_call;
    else

      -- From DBDev, the name moves to the linked appointment project.
      if v_type = 'DBDV' then
        if p.appt_project_id is null then
          raise exception 'Link % to an appointment project before promoting its names', p.name using errcode = '22023';
        end if;
        select * into a_r from public.call_results
         where project_type = 'APPT' and name = case r.effect when 'promote' then 'Lead-No Contact' else r.name end;
        -- A new lead goes to the appointment manager with the fewest names; an
        -- appointment stays with the rep who set it, who confirms it.
        v_rep := case r.effect when 'promote' then public.least_loaded_rep(p.appt_project_id) else v_me end;
        update public.leads set
          stage             = 'appt',
          project_id        = p.appt_project_id,
          source_project_id = coalesce(source_project_id, l.project_id),
          dbdv_user_id      = v_me,
          assigned_user_id  = v_rep,
          result_id         = a_r.id,
          call_result_appt  = a_r.name,
          call_weight       = 0,
          promoted_at       = now(),
          resolved_at       = case when a_r.viable then null else now() end
        where id = l.id;
        -- Nobody is on the appointment project to take a new lead: the administrators
        -- hear of it, so a hot lead never waits unseen (Sean, Oct 2026).
        if r.effect = 'promote' and v_rep is null then
          perform public.notify_users(
            array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null),
            'lead',
            left(case when r.status_code = 'hot' then 'Hot lead waiting: ' else 'Lead waiting: ' end || coalesce(l.company_name, 'a lead'), 160),
            'Nobody is assigned to ' || coalesce((select pp.name from public.projects pp where pp.id = p.appt_project_id), 'its appointment project')
              || ' to take it. Add an appointment manager to that project, or send the lead to one.',
            '/leads/' || l.id,
            case when r.status_code = 'hot' then 'hot_lead' else 'lead_assigned' end);
        end if;
      end if;

      if r.effect = 'appointment' then
        insert into public.appointments
          (lead_id, user_id, rep_name, appt_date, appt_time, duration_min, status_id, list_source,
           call_result_dbdv, project_id, set_project_id, set_stage, call_record_id, qa_status)
        values
          (l.id, v_me, nullif(btrim(coalesce(p_appointment->>'rep_name', '')), ''), v_date, v_time,
           coalesce(nullif(p_appointment->>'duration', '')::int, 30),
           (select id from public.appointment_statuses where name = 'Scheduled'),
           l.list_source,
           case when v_type = 'DBDV' then r.name end,
           coalesce(p.appt_project_id, p.id), p.id, l.stage, v_call, 'pending')
        returning * into v_appt;
        update public.leads set appt_created_date = now() where id = l.id;
        update public.call_records set appointment_id = v_appt.id where id = v_call;
      end if;

      v_pay := v_pay || public.pay(v_me, p.id, r.pay_kind, l.id, v_appt.id, v_call);

    end if;

  elsif r.effect = 'confirm' then
    update public.appointments set
      status_id    = (select id from public.appointment_statuses where name = 'Confirmed'),
      confirmed_at = now(),
      confirmed_by = v_me,
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := v_pay || public.pay(v_me, coalesce(v_appt.set_project_id, p.id), 'confirmation', l.id, v_appt.id, v_call);
    -- The client hears now only if QA has already let them see it.
    if coalesce(v_appt.qa_status, 'passed') = 'passed' then
      perform public.notify_client_appointment(v_appt.id, true);
    end if;

  elsif r.effect = 'appointment_invalid' then
    update public.appointments set
      invalid_at = now(),
      status_id  = (select id from public.appointment_statuses where name = 'Invalid'),
      status_update_date = now()
    where id = v_appt.id;
    update public.call_records set appointment_id = v_appt.id where id = v_call;
    v_pay := public.charge_back(l.id, v_appt.id, array['appointment', 'confirmation'], v_call, 'Appointment invalid');

  elsif r.effect = 'lead_invalid' then
    update public.leads set call_result_dbdv = 'Lead-Invalid' where id = l.id and source_project_id is not null;
    v_pay := public.charge_back(l.id, null, array['lead'], v_call, 'Lead invalid');
    -- No record of the original payment (an older lead): charge the developer at today's rate.
    if jsonb_array_length(v_pay) = 0 and l.dbdv_user_id is not null and l.source_project_id is not null then
      insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
      select l.dbdv_user_id, l.source_project_id, l.id, v_call, 'lead', -sp.lead_rate, 'Lead invalid (no original payment on record)', v_me
        from public.projects sp where sp.id = l.source_project_id;
      v_pay := jsonb_build_array(jsonb_build_object('user_id', l.dbdv_user_id, 'kind', 'lead',
                 'amount', -(select lead_rate from public.projects where id = l.source_project_id)));
    end if;
    if l.dbdv_user_id is not null then
      perform public.notify_users(
        array[l.dbdv_user_id], 'lead', 'Lead marked invalid: ' || coalesce(l.company_name, 'a lead'),
        concat_ws(' · ', 'Charged back on your production report', 'marked by ' || public.actor_name()),
        '/leads/' || l.id, 'lead_invalid');
    end if;

  elsif r.effect = 'correct_xdate' then
    if p_corrected_xdate is null then
      raise exception 'Enter the corrected renewal date' using errcode = '22023';
    end if;
    v_old_xdate := public.lead_renewal_date(l.id);
    -- The corrected date becomes the lead's ultimate X-date, which is its
    -- renewal; the dates on the individual policy lines are left as recorded.
    update public.insurance_details set ultimate_xdate = p_corrected_xdate where lead_id = l.id;
    if not found then
      insert into public.insurance_details (lead_id, ultimate_xdate) values (l.id, p_corrected_xdate);
    end if;
    update public.leads set original_xdate = coalesce(original_xdate, v_old_xdate) where id = l.id;
    update public.call_records
       set notes = concat_ws(E'\n', notes, 'Renewal corrected from '
                   || coalesce(to_char(v_old_xdate, 'FMMonth YYYY'), 'none') || ' to ' || to_char(p_corrected_xdate, 'FMMonth YYYY'))
     where id = v_call;

    -- Lead-Corrected pay (Sean, Nov 2026): the lead pay of the lead manager who developed it moves to
    -- whoever corrected it, once a lead. A lead with no developer on record names one (p_lead_manager:
    -- the lead manager picked, kept as its developer; 0: nobody, a lead we didn't develop, so no pay moves).
    v_dev := coalesce(l.dbdv_user_id, nullif(p_lead_manager, 0));
    if l.dbdv_user_id is null and p_lead_manager is null then
      raise exception 'Choose the lead manager who developed this lead' using errcode = '22023';
    end if;
    if l.dbdv_user_id is null and v_dev is not null then
      if not exists (select 1 from public.users where id = v_dev and role in ('admin', 'manager', 'agent')) then
        raise exception 'Choose a lead manager from the list' using errcode = '22023';
      end if;
      update public.leads set dbdv_user_id = v_dev where id = l.id;
    end if;
    if v_dev is not null and v_dev <> v_me and not exists (
         select 1 from public.pay_events pe
          where pe.lead_id = l.id and pe.kind = 'corrected' and not pe.is_chargeback
            and not exists (select 1 from public.pay_events x where x.reverses_id = pe.id)) then
      v_back := public.charge_back(l.id, null, array['lead'], v_call, 'Lead corrected by ' || public.actor_name());
      v_amt := coalesce(-(select sum((e->>'amount')::numeric) from jsonb_array_elements(v_back) e where e->>'kind' = 'lead'), 0);
      -- No record of the original payment (an older or imported lead): the developer is charged the project's lead rate.
      if v_amt = 0 then
        select pr.lead_rate into v_amt from public.projects pr where pr.id = coalesce(l.source_project_id, l.project_id);
        v_amt := coalesce(v_amt, 0);
        if v_amt > 0 then
          insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
          values (v_dev, coalesce(l.source_project_id, l.project_id), l.id, v_call, 'lead', -v_amt, 'Lead corrected (no original payment on record)', v_me);
          v_back := v_back || jsonb_build_array(jsonb_build_object('user_id', v_dev, 'kind', 'lead', 'amount', -v_amt));
        end if;
      end if;
      if v_amt > 0 then
        insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, note, created_by)
        values (v_me, p.id, l.id, v_call, 'corrected', v_amt,
                'Lead corrected, developed by ' || coalesce((select nullif(concat_ws(' ', first_name, last_name), '') from public.users where id = v_dev), 'another manager'), v_me);
        v_pay := v_pay || v_back || jsonb_build_array(jsonb_build_object('user_id', v_me, 'kind', 'corrected', 'amount', v_amt));
        perform public.notify_users(
          array[v_dev], 'lead', 'Lead corrected: ' || coalesce(l.company_name, 'a lead'),
          concat_ws(' · ', 'Its lead pay moves to ' || public.actor_name() || ', who corrected it', 'see the call on its Conversation'),
          '/leads/' || l.id);
      end if;
    end if;
  end if;

  -- A bonus hit with this result: its manager congratulated (Sean, Nov 2026).
  perform public.bonus_notify(v_me);

  -- What was said on the call joins the lead's internal notes, their running
  -- history (as the old system kept them), stamped as the rep wrote it.
  if v_notes is not null then
    insert into public.lead_notes (lead_id, notes)
    select l.id, btrim(c.notes) from public.call_records c where c.id = v_call
    on conflict (lead_id) do update
      set notes = concat_ws(E'\n', nullif(btrim(public.lead_notes.notes), ''), excluded.notes);
  end if;

  select * into l from public.leads where id = l.id;
  return jsonb_build_object(
    'call_record_id', v_call,
    'lead_id',        l.id,
    'result',         r.name,
    'stage',          l.stage,
    'project_id',     l.project_id,
    'promoted',       l.project_id is distinct from p.id,
    'on_list',        (select viable and callable from public.call_results where id = l.result_id) and l.assigned_user_id is not null,
    'appointment_id', v_appt.id,
    'rescheduled',    v_open.id is not null,
    'pay',            v_pay);
end $function$;

revoke execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date, text, bigint) from public, anon;
grant execute on function public.record_call_result(bigint, bigint, text, jsonb, date, date, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- The pay report: + dec sheets, corrections, Special Pay requests, bonuses
-- ---------------------------------------------------------------------------

drop function if exists public.pay_report(date, date, bigint);
create or replace function public.pay_report(p_from date, p_to date, p_user bigint default null)
returns table (user_id bigint, first_name text, last_name text, email text, role text, pay_model text, hourly_rate numeric,
               worked_minutes integer, paid_minutes integer, hourly_pay numeric, commission numeric, pay numeric, calls bigint,
               leads bigint, appointments bigint, confirmations bigint, chargebacks bigint, specials bigint, special_goal_pay numeric,
               dec_sheets bigint, dec_sheet_pay numeric, corrected bigint, corrected_pay numeric, requests bigint, request_pay numeric,
               bonus numeric, bonus_plan text)
language plpgsql stable set search_path = public as $$
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
           sum(pe.amount) filter (where pe.kind = 'special') as special_amt,
           -- Dec sheets, corrections and Special Pay requests, net of any taken back.
           count(*) filter (where pe.kind = 'dec_sheet' and not pe.is_chargeback) - count(*) filter (where pe.kind = 'dec_sheet' and pe.is_chargeback) as decs,
           sum(pe.amount) filter (where pe.kind = 'dec_sheet') as dec_amt,
           count(*) filter (where pe.kind = 'corrected' and not pe.is_chargeback) - count(*) filter (where pe.kind = 'corrected' and pe.is_chargeback) as fixes,
           sum(pe.amount) filter (where pe.kind = 'corrected') as fix_amt,
           count(*) filter (where pe.kind = 'request' and not pe.is_chargeback) - count(*) filter (where pe.kind = 'request' and pe.is_chargeback) as reqs,
           sum(pe.amount) filter (where pe.kind = 'request') as req_amt
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
  ), b as (
    select pb.user_id as uid, sum(pb.amount) as bonus
      from public.pay_bonuses(p_from, p_to, v_user) pb
     group by 1
  ), people as (
    select u.id
      from public.users u
     where (v_user is null or u.id = v_user)
       and ((u.role in ('manager', 'agent') and u.status = 'active')
            or u.id in (select t.uid from t) or u.id in (select m.uid from m) or u.id in (select c.uid from c) or u.id in (select b.uid from b))
  ), figures as (
    select u.id, u.first_name, u.last_name, u.email, u.role,
           coalesce(pp.pay_model, 'commission') as model, pp.hourly_rate as rate,
           coalesce(t.worked, 0) as worked, coalesce(t.paid, 0) as paid,
           round(coalesce(t.paid, 0) / 60.0 * coalesce(pp.hourly_rate, 0), 2) as hourly,
           round(coalesce(m.commission, 0), 2) as commission,
           coalesce(c.n, 0) as calls, coalesce(m.leads, 0) as leads, coalesce(m.appts, 0) as appts,
           coalesce(m.confirms, 0) as confirms, coalesce(m.backs, 0) as backs,
           coalesce(m.specials, 0) as specials, round(coalesce(m.special_amt, 0), 2) as special_amt,
           coalesce(m.decs, 0) as decs, round(coalesce(m.dec_amt, 0), 2) as dec_amt,
           coalesce(m.fixes, 0) as fixes, round(coalesce(m.fix_amt, 0), 2) as fix_amt,
           coalesce(m.reqs, 0) as reqs, round(coalesce(m.req_amt, 0), 2) as req_amt,
           round(coalesce(b.bonus, 0), 2) as bonus, pp.bonus_plan as plan
      from people pl
      join public.users u on u.id = pl.id
      left join public.pay_profiles pp on pp.user_id = u.id
      left join t on t.uid = u.id
      left join m on m.uid = u.id
      left join c on c.uid = u.id
      left join b on b.uid = u.id
  )
  select f.id, f.first_name, f.last_name, f.email, f.role, f.model, f.rate::numeric,
         f.worked, f.paid, f.hourly, f.commission,
         -- A bonus is on top of the pay, a hybrid's too.
         (case when f.model = 'hybrid' then greatest(f.hourly, f.commission) else f.commission end) + f.bonus,
         f.calls, f.leads, f.appts, f.confirms, f.backs, f.specials, f.special_amt,
         f.decs, f.dec_amt, f.fixes, f.fix_amt, f.reqs, f.req_amt, f.bonus, f.plan
    from figures f
   order by f.first_name, f.last_name, f.id;
end $$;
revoke execute on function public.pay_report(date, date, bigint) from public, anon;
grant execute on function public.pay_report(date, date, bigint) to authenticated;

notify pgrst, 'reload schema';
