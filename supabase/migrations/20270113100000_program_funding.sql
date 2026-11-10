-- Program Funding (client, Nov 2026): how a client pays for a project's program,
-- and the payments it makes: kept here, recorded in QuickBooks apart (for now).
--
--   project_funding   the plan (lib/funding.js): billed monthly for what we produce,
--                     installments (the first the first block of leads with the setup and
--                     list fees, the rest split evenly), or paid in advance; the leads and
--                     appointments bought, the fees, the payments and their day
--   project_payments  its payments: the installments (worked out by the app from the plan,
--                     saved with save_project_funding()), and each month's bill for what was
--                     produced (bill_project_months(), on the 1st: the month's leads and valid
--                     appointments at the project's rates, where the plan bills them monthly)
--
-- Seen by the administrators and the client's Sales Rep, who marks a payment paid
-- (set_payment_paid()). The Sales Rep is told 5 days before a payment is due, with how the
-- project is doing (send_payment_reminders(), with the daily alerts); the client is sent a
-- reminder only by them, and only when the client has payment reminders on
-- (companies.payment_reminders).
--
-- Safe to run again.

alter table public.companies
  add column if not exists payment_reminders boolean not null default false;
comment on column public.companies.payment_reminders is 'The Sales Rep may email this client reminders of payments due (Program Funding).';

create table if not exists public.project_funding (
  project_id     bigint primary key references public.projects(id) on delete cascade,
  plan           text not null default 'monthly' check (plan in ('monthly', 'installments', 'advance')),
  leads          integer not null default 0 check (leads between 0 and 10000000),
  appts          integer not null default 0 check (appts between 0 and 10000000),
  appts_included boolean not null default false,
  setup_fee      numeric(12, 2) not null default 0 check (setup_fee between 0 and 10000000),
  list_fee       numeric(12, 2) not null default 0 check (list_fee between 0 and 10000000),
  payments       integer not null default 1 check (payments between 1 and 36),
  first_leads    integer check (first_leads between 0 and 10000000),
  first_due      date,
  due_day        integer check (due_day between 1 and 28),
  updated_at     timestamptz not null default now(),
  updated_by     bigint references public.users(id) on delete set null
);

create table if not exists public.project_payments (
  id                 bigint generated always as identity primary key,
  project_id         bigint not null references public.projects(id) on delete cascade,
  kind               text not null check (kind in ('installment', 'monthly')),
  seq                integer,          -- an installment's place
  period             date,             -- a monthly bill's month (its first day)
  label              text not null,
  due_date           date,
  amount             numeric(12, 2) not null check (amount >= 0),
  leads              integer not null default 0,
  appts              integer not null default 0,
  fees               numeric(12, 2) not null default 0,
  paid_at            timestamptz,
  paid_by            bigint references public.users(id) on delete set null,
  rep_reminded_at    timestamptz,
  client_reminded_at timestamptz,
  created_at         timestamptz not null default now(),
  check ((kind = 'installment' and seq is not null) or (kind = 'monthly' and period is not null))
);
create unique index if not exists project_payments_installment on public.project_payments (project_id, seq) where kind = 'installment';
create unique index if not exists project_payments_month on public.project_payments (project_id, period) where kind = 'monthly';
create index if not exists project_payments_due on public.project_payments (due_date) where paid_at is null;

-- Who sees a project's funding: the administrators, and its client's Sales Rep.
create or replace function public.sees_project_funding(p_project bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.projects p join public.companies c on c.id = p.company_id
     where p.id = p_project and c.sales_rep_id is not null and c.sales_rep_id = public.app_user_id());
$$;
revoke execute on function public.sees_project_funding(bigint) from public, anon;
grant execute on function public.sees_project_funding(bigint) to authenticated;

alter table public.project_funding enable row level security;
drop policy if exists project_funding_read on public.project_funding;
create policy project_funding_read on public.project_funding for select to authenticated using (public.sees_project_funding(project_id));
grant select on public.project_funding to authenticated;

alter table public.project_payments enable row level security;
drop policy if exists project_payments_read on public.project_payments;
create policy project_payments_read on public.project_payments for select to authenticated using (public.sees_project_funding(project_id));
grant select on public.project_payments to authenticated;

-- An administrator saves a project's plan and its installments (worked out by the app). Payments
-- already paid stay as they were; the rest take the new schedule (a reminder already sent kept
-- while the date and amount are the same); installments past the new count, unpaid, go.
create or replace function public.save_project_funding(p_project bigint, p_funding jsonb, p_payments jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
  v_count integer := 0;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator sets a program''s funding' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project) then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;

  insert into public.project_funding as f (project_id, plan, leads, appts, appts_included, setup_fee, list_fee, payments, first_leads, first_due, due_day, updated_at, updated_by)
  values (p_project, coalesce(p_funding->>'plan', 'monthly'), coalesce((p_funding->>'leads')::int, 0), coalesce((p_funding->>'appts')::int, 0),
          coalesce((p_funding->>'appts_included')::boolean, false), coalesce((p_funding->>'setup_fee')::numeric, 0), coalesce((p_funding->>'list_fee')::numeric, 0),
          coalesce((p_funding->>'payments')::int, 1), (p_funding->>'first_leads')::int, (p_funding->>'first_due')::date, (p_funding->>'due_day')::int, now(), v_me)
  on conflict (project_id) do update set
    plan = excluded.plan, leads = excluded.leads, appts = excluded.appts, appts_included = excluded.appts_included,
    setup_fee = excluded.setup_fee, list_fee = excluded.list_fee, payments = excluded.payments, first_leads = excluded.first_leads,
    first_due = excluded.first_due, due_day = excluded.due_day, updated_at = now(), updated_by = v_me;

  for r in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into public.project_payments as p (project_id, kind, seq, label, due_date, amount, leads, appts, fees)
    values (p_project, 'installment', (r->>'seq')::int, left(coalesce(r->>'label', 'Payment'), 80), (r->>'due')::date,
            (r->>'amount')::numeric, coalesce((r->>'leads')::int, 0), coalesce((r->>'appts')::int, 0), coalesce((r->>'fees')::numeric, 0))
    on conflict (project_id, seq) where kind = 'installment' do update set
      label = excluded.label, due_date = excluded.due_date, amount = excluded.amount, leads = excluded.leads,
      appts = excluded.appts, fees = excluded.fees,
      rep_reminded_at = case when p.due_date is not distinct from excluded.due_date and p.amount = excluded.amount then p.rep_reminded_at end,
      client_reminded_at = case when p.due_date is not distinct from excluded.due_date and p.amount = excluded.amount then p.client_reminded_at end
    where p.paid_at is null;
    v_count := v_count + 1;
  end loop;
  delete from public.project_payments
   where project_id = p_project and kind = 'installment' and paid_at is null
     and seq not in (select (x->>'seq')::int from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) x);
  return v_count;
end $$;
revoke execute on function public.save_project_funding(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_funding(bigint, jsonb, jsonb) to authenticated;

-- Paid, or not after all: an administrator or the client's Sales Rep.
create or replace function public.set_payment_paid(p_payment bigint, p_paid boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.project_payments;
begin
  select * into v from public.project_payments where id = p_payment for update;
  if not found then
    raise exception 'That payment no longer exists' using errcode = 'P0002';
  end if;
  if not public.sees_project_funding(v.project_id) then
    raise exception 'Only an administrator or the client''s Sales Rep marks a payment paid' using errcode = '42501';
  end if;
  update public.project_payments
     set paid_at = case when p_paid then coalesce(paid_at, now()) end,
         paid_by = case when p_paid then coalesce(paid_by, public.app_user_id()) end
   where id = p_payment
  returning * into v;
  return jsonb_build_object('id', v.id, 'paid_at', v.paid_at);
end $$;
revoke execute on function public.set_payment_paid(bigint, boolean) from public, anon;
grant execute on function public.set_payment_paid(bigint, boolean) to authenticated;

-- A payment's details for a reminder to the client (its people's addresses), by an administrator
-- or the Sales Rep, only for a client with payment reminders on; and, once sent, marked so.
create or replace function public.payment_reminder(p_payment bigint, p_sent boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.project_payments;
  v_out jsonb;
begin
  select * into v from public.project_payments where id = p_payment;
  if not found then
    raise exception 'That payment no longer exists' using errcode = 'P0002';
  end if;
  if not public.sees_project_funding(v.project_id) then
    raise exception 'Only an administrator or the client''s Sales Rep sends a payment reminder' using errcode = '42501';
  end if;
  if p_sent then
    update public.project_payments set client_reminded_at = now() where id = p_payment;
    return jsonb_build_object('id', p_payment);
  end if;
  select jsonb_build_object(
           'id', v.id, 'label', v.label, 'amount', v.amount, 'due', v.due_date, 'paid', v.paid_at is not null,
           'project', p.name, 'client', c.name, 'on', c.payment_reminders,
           'to', coalesce((select jsonb_agg(jsonb_build_object('name', nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'email', u.email) order by u.id)
                             from public.users u
                            where u.company_id = c.id and u.role = 'client' and u.status = 'active' and u.deleted_at is null and u.email is not null), '[]'::jsonb))
    into v_out
    from public.projects p join public.companies c on c.id = p.company_id
   where p.id = v.project_id;
  return v_out;
end $$;
revoke execute on function public.payment_reminder(bigint, boolean) from public, anon;
grant execute on function public.payment_reminder(bigint, boolean) to authenticated;

-- What a project has delivered so far: its leads (not invalid) and valid appointments, counted as the billing report counts them.
create or replace function public.project_delivered(p_project bigint)
returns table (leads bigint, appts bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.leads l left join public.call_results r on r.id = l.result_id
      where coalesce(l.source_project_id, l.project_id) = p_project and l.deleted_at is null and l.promoted_at is not null
        and not (coalesce(l.call_result_dbdv = 'Lead-Invalid', false) or coalesce(r.effect = 'lead_invalid', false))),
    (select count(*) from public.appointments a join public.leads l on l.id = a.lead_id and l.deleted_at is null
      where coalesce(a.set_project_id, a.project_id) = p_project and a.deleted_at is null and a.invalid_at is null);
$$;
revoke execute on function public.project_delivered(bigint) from public, anon, authenticated;

-- Each month's bill for what was produced (on the 1st, for the month just ended): its leads and
-- valid appointments at the project's rates, where the plan bills them monthly (all of a monthly
-- plan; the appointments of one that leaves them out of its installments). From the month the
-- program starts to the one it ends; nothing billed, no bill. Due on its due day this month.
create or replace function public.bill_project_months(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_from date := (date_trunc('month', p_day) - interval '1 month')::date;
  v_to date := (date_trunc('month', p_day) - interval '1 day')::date;
  v_count integer := 0;
  r record;
begin
  for r in
    with ev as (
      select e.project_id, count(*) filter (where e.kind = 'lead' and e.invalid is not true) as leads,
             count(*) filter (where e.kind = 'appointment' and e.invalid is not true) as appts
        from public.report_events(v_from, v_to) e group by e.project_id
    )
    select f.project_id, f.plan, f.appts_included, f.due_day, f.first_due,
           coalesce(p.bill_lead_rate, 0) as lead_rate, coalesce(p.bill_appointment_rate, 0) as appt_rate,
           case when f.plan = 'monthly' then coalesce(ev.leads, 0) else 0 end as leads,
           case when f.plan = 'monthly' or not f.appts_included then coalesce(ev.appts, 0) else 0 end as appts
      from public.project_funding f
      join public.projects p on p.id = f.project_id and p.deleted_at is null
      left join ev on ev.project_id = f.project_id
     where v_from >= date_trunc('month', coalesce(f.first_due, p.start_date, v_from))::date
       and (p.end_date is null or v_from <= p.end_date)
  loop
    continue when r.leads * r.lead_rate + r.appts * r.appt_rate <= 0;
    insert into public.project_payments (project_id, kind, period, label, due_date, amount, leads, appts)
    values (r.project_id, 'monthly', v_from, to_char(v_from, 'FMMonth YYYY'),
            make_date(extract(year from p_day)::int, extract(month from p_day)::int, coalesce(r.due_day, extract(day from r.first_due)::int, 15)),
            r.leads * r.lead_rate + r.appts * r.appt_rate, r.leads, r.appts)
    on conflict (project_id, period) where kind = 'monthly' do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.bill_project_months(date) from public, anon, authenticated;

-- 5 days before a payment is due (and not yet paid), its client's Sales Rep is told, with how the
-- project is doing; the administrators when the client has no Sales Rep. Once for each payment.
insert into public.alert_rules (name, trigger, channel)
select 'Payment due in 5 days', 'payment_due', 'inapp'
 where not exists (select 1 from public.alert_rules r where r.trigger = 'payment_due');

create or replace function public.send_payment_reminders(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_to bigint[];
  v_done record;
  r record;
begin
  for r in
    select pp.id, pp.label, pp.amount, pp.due_date, pp.project_id, p.name as project, c.name as client, c.sales_rep_id,
           f.leads as bought_leads, f.appts as bought_appts
      from public.project_payments pp
      join public.projects p on p.id = pp.project_id and p.deleted_at is null
      join public.companies c on c.id = p.company_id
      left join public.project_funding f on f.project_id = pp.project_id
     where pp.paid_at is null and pp.rep_reminded_at is null
       and pp.due_date between p_day and p_day + 5
     for update of pp skip locked
  loop
    v_to := case when r.sales_rep_id is not null then array[r.sales_rep_id]
                 else array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null) end;
    select * into v_done from public.project_delivered(r.project_id);
    perform public.notify_users(
      v_to, 'system',
      left(format('Payment due %s: %s · %s', to_char(r.due_date, 'FMMon FMDD'), r.client, to_char(r.amount, 'FM$999,999,990.00')), 160),
      left(concat_ws(' · ', r.project, r.label,
        format('Leads %s%s delivered', v_done.leads, case when coalesce(r.bought_leads, 0) > 0 then format(' of %s', r.bought_leads) else '' end),
        format('appointments %s%s', v_done.appts, case when coalesce(r.bought_appts, 0) > 0 then format(' of %s', r.bought_appts) else '' end)), 1000),
      '/payments', 'payment_due');
    update public.project_payments set rep_reminded_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.send_payment_reminders(date) from public, anon, authenticated;

-- The daily alerts, with the month's bills and the payment reminders.
create or replace function public.run_daily_alerts()
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  v_now timestamp := now() at time zone public.business_tz();
begin
  if extract(hour from v_now) < 7 then
    return 0;
  end if;
  return public.send_xdate_warnings(v_now::date) + public.send_appointment_reminders(v_now::date)
       + public.send_celebrations(v_now::date)
       + public.bill_project_months(v_now::date) + public.send_payment_reminders(v_now::date);
end $function$;
revoke execute on function public.run_daily_alerts() from public, anon, authenticated;
