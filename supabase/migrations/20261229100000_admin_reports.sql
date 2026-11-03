-- The administrators' Reports (Sean, Nov 2026): the leads and appointments of
-- a period (the current month, or the last three or six), by project, client,
-- Sales Rep and manager; and a billing listing for a date range, each figure
-- opening the names behind it.
--
--   projects.bill_lead_rate, bill_appointment_rate   what the client is billed
--                     for each lead and each appointment (the pay rates,
--                     lead_rate and appointment_rate, are what a manager is paid)
--
--   A lead counts in the month it was developed (promoted_at), on the project
--   that developed it, to the manager who did; invalid once marked Lead-Invalid.
--   An appointment counts in the month it was set, on the project that set it,
--   to the manager who set it: confirmed, or pending (neither confirmed nor
--   invalid), or invalid; rescheduled when moved.
--
--   report_counts(from, to)   by month, project and manager: leads (not
--                     invalid), invalid leads, appointments (not invalid),
--                     confirmed, pending, invalid, rescheduled
--   billing_report(from, to, sales rep)   each project of the active clients:
--                     those, the names called, and the cost (the managers' pay
--                     on it, chargebacks taken off), with the billing rates
--   report_items(from, to, project, kind)   the names behind one of those figures
--
-- Administrators only. Safe to run more than once.

alter table public.projects add column if not exists bill_lead_rate numeric(10, 2);
alter table public.projects add column if not exists bill_appointment_rate numeric(10, 2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_bill_rates_check') then
    alter table public.projects add constraint projects_bill_rates_check
      check (coalesce(bill_lead_rate, 0) >= 0 and coalesce(bill_appointment_rate, 0) >= 0);
  end if;
end $$;

-- The leads developed and the appointments set from `p_from` to `p_to`, a row each, with what each became.
create or replace function public.report_events(p_from date, p_to date)
returns table (kind text, at date, project_id bigint, user_id bigint, lead_id bigint, appointment_id bigint,
               invalid boolean, confirmed boolean, rescheduled boolean)
language sql stable security definer set search_path = public as $$
  with z as (select public.business_tz() as tz)
  select 'lead', (l.promoted_at at time zone z.tz)::date, coalesce(l.source_project_id, l.project_id), l.dbdv_user_id, l.id, null::bigint,
         (l.call_result_dbdv = 'Lead-Invalid' or r.effect = 'lead_invalid'), false, false
    from public.leads l
    cross join z
    left join public.call_results r on r.id = l.result_id
   where l.deleted_at is null and l.promoted_at is not null
     and l.promoted_at >= (p_from::timestamp at time zone z.tz) and l.promoted_at < ((p_to + 1)::timestamp at time zone z.tz)
  union all
  select 'appointment', (coalesce(a.appt_create_date, a.created_at) at time zone z.tz)::date, coalesce(a.set_project_id, a.project_id), a.user_id, a.lead_id, a.id,
         a.invalid_at is not null, a.confirmed_at is not null and a.invalid_at is null,
         a.invalid_at is null and s.name = 'Rescheduled'
    from public.appointments a
    cross join z
    join public.leads l on l.id = a.lead_id and l.deleted_at is null
    left join public.appointment_statuses s on s.id = a.status_id
   where a.deleted_at is null
     and coalesce(a.appt_create_date, a.created_at) >= (p_from::timestamp at time zone z.tz)
     and coalesce(a.appt_create_date, a.created_at) < ((p_to + 1)::timestamp at time zone z.tz);
$$;
revoke execute on function public.report_events(date, date) from public, anon, authenticated;

create or replace function public.report_counts(p_from date, p_to date)
returns table (ym text, project_id bigint, user_id bigint, leads bigint, invalid_leads bigint, appts bigint,
               confirmed bigint, pending bigint, invalid_appts bigint, rescheduled bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Reports are for administrators' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;
  return query
  select to_char(e.at, 'YYYY-MM'), e.project_id, e.user_id,
         count(*) filter (where e.kind = 'lead' and not e.invalid),
         count(*) filter (where e.kind = 'lead' and e.invalid),
         count(*) filter (where e.kind = 'appointment' and not e.invalid),
         count(*) filter (where e.kind = 'appointment' and e.confirmed),
         count(*) filter (where e.kind = 'appointment' and not e.invalid and not e.confirmed),
         count(*) filter (where e.kind = 'appointment' and e.invalid),
         count(*) filter (where e.kind = 'appointment' and e.rescheduled)
    from public.report_events(p_from, p_to) e
   group by 1, 2, 3;
end $$;
revoke execute on function public.report_counts(date, date) from public, anon;
grant execute on function public.report_counts(date, date) to authenticated;

create or replace function public.billing_report(p_from date, p_to date, p_rep bigint default null)
returns table (company_id bigint, client text, sales_rep text, project_id bigint, project text, project_type text,
               leads bigint, invalid_leads bigint, appts bigint, confirmed bigint, pending bigint, invalid_appts bigint,
               names_called bigint, cost numeric, bill_lead_rate numeric, bill_appointment_rate numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.business_tz();
begin
  if not public.is_admin() then
    raise exception 'Reports are for administrators' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;
  return query
  with e as (
    select e.project_id,
           count(*) filter (where e.kind = 'lead' and not e.invalid) as leads,
           count(*) filter (where e.kind = 'lead' and e.invalid) as invalid_leads,
           count(*) filter (where e.kind = 'appointment' and not e.invalid) as appts,
           count(*) filter (where e.kind = 'appointment' and e.confirmed) as confirmed,
           count(*) filter (where e.kind = 'appointment' and not e.invalid and not e.confirmed) as pending,
           count(*) filter (where e.kind = 'appointment' and e.invalid) as invalid_appts
      from public.report_events(p_from, p_to) e group by 1
  ), c as (
    select cr.project_id, count(distinct cr.lead_id) as n
      from public.call_records cr
     where cr.call_date >= (p_from::timestamp at time zone v_tz) and cr.call_date < ((p_to + 1)::timestamp at time zone v_tz)
     group by 1
  ), pay as (
    select pe.project_id, sum(pe.amount) as amount
      from public.pay_events pe
     where pe.created_at >= (p_from::timestamp at time zone v_tz) and pe.created_at < ((p_to + 1)::timestamp at time zone v_tz)
     group by 1
  )
  select co.id, co.name, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), p.id, p.name, t.code,
         coalesce(e.leads, 0), coalesce(e.invalid_leads, 0), coalesce(e.appts, 0), coalesce(e.confirmed, 0),
         coalesce(e.pending, 0), coalesce(e.invalid_appts, 0), coalesce(c.n, 0), coalesce(pay.amount, 0)::numeric,
         p.bill_lead_rate, p.bill_appointment_rate
    from public.projects p
    join public.companies co on co.id = p.company_id and co.deleted_at is null and co.status = 'active'
    left join public.project_types t on t.id = p.project_type_id
    left join public.project_statuses ps on ps.id = p.status_id
    left join public.users u on u.id = co.sales_rep_id
    left join e on e.project_id = p.id
    left join c on c.project_id = p.id
    left join pay on pay.project_id = p.id
   where p.deleted_at is null
     and (p_rep is null or co.sales_rep_id = p_rep)
     -- Its active projects, and any other with something in the range.
     and (ps.name = 'Active' or e.project_id is not null or c.project_id is not null or pay.project_id is not null)
   order by co.name, p.name;
end $$;
revoke execute on function public.billing_report(date, date, bigint) from public, anon;
grant execute on function public.billing_report(date, date, bigint) to authenticated;

create or replace function public.report_items(p_from date, p_to date, p_project bigint, p_kind text)
returns table (lead_id bigint, appointment_id bigint, company text, at date, appt_date date, appt_time text,
               manager text, cost numeric, sales_rep text, project text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Reports are for administrators' using errcode = '42501';
  end if;
  if p_kind not in ('leads', 'invalid_leads', 'appts', 'confirmed', 'pending', 'invalid_appts') then
    raise exception 'Unknown figure' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a range of a year or less' using errcode = '22023';
  end if;
  return query
  select e.lead_id, e.appointment_id, l.company_name, e.at, a.appt_date, a.appt_time,
         nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), ''),
         -- What the manager was paid for it (chargebacks taken off): the lead's lead pay, or the appointment's own.
         coalesce((select sum(pe.amount) from public.pay_events pe
                    where pe.lead_id = e.lead_id
                      and (case when e.kind = 'lead' then pe.kind = 'lead' and pe.appointment_id is null else pe.appointment_id = e.appointment_id end)), 0)::numeric,
         nullif(btrim(concat_ws(' ', r.first_name, r.last_name)), ''), p.name,
         case when e.kind = 'lead' then case when e.invalid then 'Invalid' else 'Developed' end
              when e.invalid then 'Invalid' when e.confirmed then 'Confirmed' else 'Pending' end
    from public.report_events(p_from, p_to) e
    join public.leads l on l.id = e.lead_id
    join public.projects p on p.id = e.project_id
    left join public.companies co on co.id = p.company_id
    left join public.users r on r.id = co.sales_rep_id
    left join public.users m on m.id = e.user_id
    left join public.appointments a on a.id = e.appointment_id
   where e.project_id = p_project
     and case p_kind
           when 'leads' then e.kind = 'lead' and not e.invalid
           when 'invalid_leads' then e.kind = 'lead' and e.invalid
           when 'appts' then e.kind = 'appointment' and not e.invalid
           when 'confirmed' then e.kind = 'appointment' and e.confirmed
           when 'pending' then e.kind = 'appointment' and not e.invalid and not e.confirmed
           else e.kind = 'appointment' and e.invalid
         end
   order by e.at, l.company_name;
end $$;
revoke execute on function public.report_items(date, date, bigint, text) from public, anon;
grant execute on function public.report_items(date, date, bigint, text) to authenticated;
