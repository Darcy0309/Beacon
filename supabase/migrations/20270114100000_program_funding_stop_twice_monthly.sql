-- Program Funding, the client's follow-ups (Nov 2026):
--
--   A client stopping their program: its upcoming payments removed, one at a time
--   (set_payment_removed()) or all at once with the program marked stopped
--   (stop_project_funding()), which bills nothing more. A removed payment is kept,
--   struck through, out of what is owed and with no reminders; it can be put back.
--
--   Billed twice a month (the 1st and the 15th): project_funding.billing. On the 15th, for
--   the 1st to the 14th; on the 1st, for the 15th to the month's end; each due the day it is
--   billed. Once a month, as before: on the 1st for the month before, due on the due day.
--
-- Safe to run again.

alter table public.project_payments
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by bigint references public.users(id) on delete set null;
comment on column public.project_payments.removed_at is 'Not owed after all (the client stopped their program): kept, out of the totals and reminders.';

alter table public.project_funding
  add column if not exists billing text not null default 'monthly',
  add column if not exists stopped_at timestamptz,
  add column if not exists stopped_by bigint references public.users(id) on delete set null;
alter table public.project_funding drop constraint if exists project_funding_billing_check;
alter table public.project_funding add constraint project_funding_billing_check check (billing in ('monthly', 'semimonthly'));
comment on column public.project_funding.billing is 'What is billed for what was produced: monthly (on the 1st) or semimonthly (the 1st and the 15th).';
comment on column public.project_funding.stopped_at is 'The client stopped their program: nothing more is billed.';

drop index if exists public.project_payments_due;
create index if not exists project_payments_due on public.project_payments (due_date) where paid_at is null and removed_at is null;

-- The plan and its installments, as before, with how often production is billed; payments paid
-- or removed stay as they were.
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

  insert into public.project_funding as f (project_id, plan, leads, appts, appts_included, setup_fee, list_fee, payments, first_leads, first_due, due_day, billing, updated_at, updated_by)
  values (p_project, coalesce(p_funding->>'plan', 'monthly'), coalesce((p_funding->>'leads')::int, 0), coalesce((p_funding->>'appts')::int, 0),
          coalesce((p_funding->>'appts_included')::boolean, false), coalesce((p_funding->>'setup_fee')::numeric, 0), coalesce((p_funding->>'list_fee')::numeric, 0),
          coalesce((p_funding->>'payments')::int, 1), (p_funding->>'first_leads')::int, (p_funding->>'first_due')::date, (p_funding->>'due_day')::int,
          case when p_funding->>'billing' = 'semimonthly' then 'semimonthly' else 'monthly' end, now(), v_me)
  on conflict (project_id) do update set
    plan = excluded.plan, leads = excluded.leads, appts = excluded.appts, appts_included = excluded.appts_included,
    setup_fee = excluded.setup_fee, list_fee = excluded.list_fee, payments = excluded.payments, first_leads = excluded.first_leads,
    first_due = excluded.first_due, due_day = excluded.due_day, billing = excluded.billing, updated_at = now(), updated_by = v_me;

  for r in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into public.project_payments as p (project_id, kind, seq, label, due_date, amount, leads, appts, fees)
    values (p_project, 'installment', (r->>'seq')::int, left(coalesce(r->>'label', 'Payment'), 80), (r->>'due')::date,
            (r->>'amount')::numeric, coalesce((r->>'leads')::int, 0), coalesce((r->>'appts')::int, 0), coalesce((r->>'fees')::numeric, 0))
    on conflict (project_id, seq) where kind = 'installment' do update set
      label = excluded.label, due_date = excluded.due_date, amount = excluded.amount, leads = excluded.leads,
      appts = excluded.appts, fees = excluded.fees,
      rep_reminded_at = case when p.due_date is not distinct from excluded.due_date and p.amount = excluded.amount then p.rep_reminded_at end,
      client_reminded_at = case when p.due_date is not distinct from excluded.due_date and p.amount = excluded.amount then p.client_reminded_at end
    where p.paid_at is null and p.removed_at is null;
    v_count := v_count + 1;
  end loop;
  delete from public.project_payments
   where project_id = p_project and kind = 'installment' and paid_at is null and removed_at is null
     and seq not in (select (x->>'seq')::int from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) x);
  return v_count;
end $$;
revoke execute on function public.save_project_funding(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_funding(bigint, jsonb, jsonb) to authenticated;

-- Paid, or not after all (a removed one paid after all is put back).
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
         paid_by = case when p_paid then coalesce(paid_by, public.app_user_id()) end,
         removed_at = case when p_paid then null else removed_at end,
         removed_by = case when p_paid then null else removed_by end
   where id = p_payment
  returning * into v;
  return jsonb_build_object('id', v.id, 'paid_at', v.paid_at);
end $$;
revoke execute on function public.set_payment_paid(bigint, boolean) from public, anon;
grant execute on function public.set_payment_paid(bigint, boolean) to authenticated;

-- An unpaid payment removed (not owed after all), or put back: an administrator or the client's Sales Rep.
create or replace function public.set_payment_removed(p_payment bigint, p_removed boolean)
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
    raise exception 'Only an administrator or the client''s Sales Rep removes a payment' using errcode = '42501';
  end if;
  if p_removed and v.paid_at is not null then
    raise exception 'That payment is paid: mark it unpaid first' using errcode = '22023';
  end if;
  update public.project_payments
     set removed_at = case when p_removed then coalesce(removed_at, now()) end,
         removed_by = case when p_removed then coalesce(removed_by, public.app_user_id()) end
   where id = p_payment
  returning * into v;
  return jsonb_build_object('id', v.id, 'removed_at', v.removed_at);
end $$;
revoke execute on function public.set_payment_removed(bigint, boolean) from public, anon;
grant execute on function public.set_payment_removed(bigint, boolean) to authenticated;

-- The client stopped their program: every payment not yet paid removed, and nothing more billed.
-- Or started again: billing goes on (the removed payments stay removed, each can be put back).
-- An administrator or the client's Sales Rep; how many payments were removed.
create or replace function public.stop_project_funding(p_project bigint, p_stop boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
  v_count integer := 0;
begin
  if not public.sees_project_funding(p_project) then
    raise exception 'Only an administrator or the client''s Sales Rep stops a program' using errcode = '42501';
  end if;
  update public.project_funding
     set stopped_at = case when p_stop then coalesce(stopped_at, now()) end,
         stopped_by = case when p_stop then coalesce(stopped_by, v_me) end
   where project_id = p_project;
  if not found then
    raise exception 'That project has no funding plan' using errcode = 'P0002';
  end if;
  if p_stop then
    update public.project_payments set removed_at = now(), removed_by = v_me
     where project_id = p_project and paid_at is null and removed_at is null;
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end $$;
revoke execute on function public.stop_project_funding(bigint, boolean) from public, anon;
grant execute on function public.stop_project_funding(bigint, boolean) to authenticated;

-- A payment's details for a reminder to the client, as before, with whether it was removed.
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
           'id', v.id, 'label', v.label, 'amount', v.amount, 'due', v.due_date, 'paid', v.paid_at is not null, 'removed', v.removed_at is not null,
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

-- The bills for what was produced: once a month (on the 1st, for the month before, due on the
-- plan's due day) or twice (on the 15th for the 1st to the 14th, on the 1st for the 15th to the
-- month's end, each due that day). Not for a stopped program. Otherwise as before.
create or replace function public.bill_project_months(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_day)::date;
  v_late boolean := extract(day from p_day) >= 15;
  m_from date := (date_trunc('month', p_day) - interval '1 month')::date;
  m_to date := (date_trunc('month', p_day) - interval '1 day')::date;
  s_from date := case when v_late then v_month else m_from + 14 end;
  s_to date := case when v_late then v_month + 13 else m_to end;
  s_due date := case when v_late then v_month + 14 else v_month end;
  v_count integer := 0;
  r record;
begin
  for r in
    with ev as (
      select 'monthly'::text as billing, e.project_id,
             count(*) filter (where e.kind = 'lead' and e.invalid is not true) as leads,
             count(*) filter (where e.kind = 'appointment' and e.invalid is not true) as appts
        from public.report_events(m_from, m_to) e group by e.project_id
      union all
      select 'semimonthly', e.project_id,
             count(*) filter (where e.kind = 'lead' and e.invalid is not true),
             count(*) filter (where e.kind = 'appointment' and e.invalid is not true)
        from public.report_events(s_from, s_to) e
       where exists (select 1 from public.project_funding x where x.billing = 'semimonthly' and x.stopped_at is null)
       group by e.project_id
    ), plans as (
      select f.*, p.start_date, p.end_date,
             coalesce(p.bill_lead_rate, 0) as lead_rate, coalesce(p.bill_appointment_rate, 0) as appt_rate,
             case when f.billing = 'semimonthly' then s_from else m_from end as period_from
        from public.project_funding f
        join public.projects p on p.id = f.project_id and p.deleted_at is null
       where f.stopped_at is null
    )
    select pl.project_id, pl.billing, pl.period_from, pl.due_day, pl.first_due, pl.lead_rate, pl.appt_rate,
           case when pl.plan = 'monthly' then coalesce(ev.leads, 0) else 0 end as leads,
           case when pl.plan = 'monthly' or not pl.appts_included then coalesce(ev.appts, 0) else 0 end as appts
      from plans pl
      left join ev on ev.project_id = pl.project_id and ev.billing = pl.billing
     where pl.period_from >= date_trunc('month', coalesce(pl.first_due, pl.start_date, pl.period_from))::date
       and (pl.end_date is null or pl.period_from <= pl.end_date)
  loop
    continue when r.leads * r.lead_rate + r.appts * r.appt_rate <= 0;
    insert into public.project_payments (project_id, kind, period, label, due_date, amount, leads, appts)
    values (r.project_id, 'monthly', r.period_from,
            case when r.billing = 'semimonthly' then format('%s–%s', to_char(s_from, 'FMMon FMDD'), to_char(s_to, 'FMDD, YYYY'))
                 else to_char(m_from, 'FMMonth YYYY') end,
            case when r.billing = 'semimonthly' then s_due
                 else make_date(extract(year from p_day)::int, extract(month from p_day)::int, coalesce(r.due_day, extract(day from r.first_due)::int, 15)) end,
            r.leads * r.lead_rate + r.appts * r.appt_rate, r.leads, r.appts)
    on conflict (project_id, period) where kind = 'monthly' do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.bill_project_months(date) from public, anon, authenticated;

-- The Sales Rep's 5 days' notice, as before, not for a removed payment.
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
     where pp.paid_at is null and pp.removed_at is null and pp.rep_reminded_at is null
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
