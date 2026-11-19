-- Signature Select (Sean, Nov 2026): the fee a client pays for Lighthouse, exclusivity on the leads we call for
-- them and appointment confirmations, one fee for all their projects, monthly or yearly. Kept term by term:
--
--   select_terms   a client's terms: monthly (an amount a month from its start; runs until an end date is put
--                  in, when they stop) or annual (an amount a year, for its start to its end). A renewal or a
--                  new rate is a new term; the earlier ones stay, for what has come in.
--
--   select_access_ended(company)   a client on Signature Select whose last term has ended and that has none
--                  now: its people's access to Lighthouse stops (client_project_ids() gives them nothing; the
--                  app says why). A client never on it is as before.
--   my_select()    a client's own: the term now and when it ends, for their renewal notice.
--   select_charges(from, to, company)   what is charged in a time: each month of a monthly term (on its start
--                  day), each annual term (on its start): the Signature Select report. Administrators.
--   send_select_reminders(day)     the Sales Rep (else the administrators) told two weeks before a term ends,
--                  once, unless a later term follows it already. Daily, with the other alerts.
--
-- Administrators and the client's Sales Rep see and change its terms. Safe to run more than once.

create table if not exists public.select_terms (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references public.companies(id) on delete cascade,
  plan        text not null check (plan in ('monthly', 'annual')),
  amount      numeric(10, 2) not null check (amount > 0 and amount < 1000000),
  starts_on   date not null,
  ends_on     date,
  note        text check (length(note) <= 500),
  reminded_at timestamptz,
  created_by  bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint select_terms_annual_end check (plan = 'monthly' or ends_on is not null),
  constraint select_terms_dates check (ends_on is null or ends_on >= starts_on)
);
create index if not exists select_terms_company on public.select_terms (company_id, starts_on desc);

alter table public.select_terms enable row level security;
drop policy if exists select_terms_rw on public.select_terms;
create policy select_terms_rw on public.select_terms for all to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.companies c where c.id = company_id and c.sales_rep_id = (select public.app_user_id())))
  with check ((select public.is_admin()) or exists (select 1 from public.companies c where c.id = company_id and c.sales_rep_id = (select public.app_user_id())));
grant select, insert, update, delete on public.select_terms to authenticated;

create or replace function public.select_access_ended(p_company bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.select_terms t where t.company_id = p_company)
     and not exists (select 1 from public.select_terms t where t.company_id = p_company
                      and (t.ends_on is null or t.ends_on >= public.business_today()));
$$;
grant execute on function public.select_access_ended(bigint) to authenticated;

-- A client's people see their projects only while their Signature Select is on (or they were never on it).
create or replace function public.client_project_ids()
 returns setof bigint
 language sql stable security definer set search_path = public as $$
  select p.id from public.projects p
  where p.company_id = public.app_company_id() and p.deleted_at is null
    and not public.select_access_ended(p.company_id)
  union
  select pa.project_id from public.project_assignments pa
  where pa.cl_user_id = public.app_user_id()
    and exists (select 1 from public.projects p where p.id = pa.project_id and p.deleted_at is null
                 and not public.select_access_ended(p.company_id));
$$;

create or replace function public.my_select()
returns table (plan text, starts_on date, ends_on date, ended boolean)
language sql stable security definer set search_path = public as $$
  with mine as (select public.app_company_id() as company)
  select t.plan, t.starts_on, t.ends_on, public.select_access_ended(mine.company)
    from mine
    left join lateral (
      -- The term on now, else the last one.
      select * from public.select_terms t where t.company_id = mine.company
       order by (t.starts_on <= public.business_today() and (t.ends_on is null or t.ends_on >= public.business_today())) desc,
                t.starts_on desc limit 1
    ) t on true
   where mine.company is not null and t.plan is not null;
$$;
grant execute on function public.my_select() to authenticated;

create or replace function public.select_charges(p_from date, p_to date, p_company bigint default null)
returns table (term_id bigint, company_id bigint, client text, plan text, charged_on date, amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'The Signature Select report is for administrators' using errcode = '42501';
  end if;
  return query
  select t.id, t.company_id, c.name, t.plan, d.day::date, t.amount
    from public.select_terms t
    join public.companies c on c.id = t.company_id
    cross join lateral (
      select (t.starts_on + make_interval(months => m))::date as day
        from generate_series(0, case when t.plan = 'monthly' then 600 else 0 end) m
    ) d
   where (p_company is null or t.company_id = p_company)
     and d.day between p_from and p_to
     and d.day <= coalesce(t.ends_on, d.day)
     and d.day <= public.business_today()
   order by d.day, c.name;
end $$;
revoke execute on function public.select_charges(date, date, bigint) from public, anon;
grant execute on function public.select_charges(date, date, bigint) to authenticated;

create or replace function public.send_select_reminders(p_day date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_to bigint[];
  r record;
begin
  for r in
    select t.id, t.plan, t.amount, t.ends_on, c.id as company_id, c.name as client, c.sales_rep_id
      from public.select_terms t join public.companies c on c.id = t.company_id and c.deleted_at is null
     where t.reminded_at is null and t.ends_on between p_day and p_day + 14
       and not exists (select 1 from public.select_terms n where n.company_id = t.company_id and n.id <> t.id and n.starts_on > t.starts_on)
     for update of t skip locked
  loop
    v_to := case when r.sales_rep_id is not null then array[r.sales_rep_id]
                 else array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null) end;
    perform public.notify_users(
      v_to, 'system',
      left(format('Signature Select ends %s: %s', to_char(r.ends_on, 'FMMon FMDD'), r.client), 160),
      left(format('%s · %s. Their access to Lighthouse stops after %s unless it is renewed.',
        initcap(r.plan), to_char(r.amount, 'FM$999,999,990.00') || case when r.plan = 'monthly' then ' a month' else ' a year' end,
        to_char(r.ends_on, 'FMMonth FMDD, YYYY')), 1000),
      '/payments#select', 'payment_due');
    update public.select_terms set reminded_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.run_daily_alerts()
 returns integer
 language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone public.business_tz();
begin
  if extract(hour from v_now) < 7 then
    return 0;
  end if;
  return public.send_xdate_warnings(v_now::date) + public.send_appointment_reminders(v_now::date)
       + public.send_celebrations(v_now::date)
       + public.bill_project_months(v_now::date) + public.send_payment_reminders(v_now::date)
       + public.send_select_reminders(v_now::date);
end $$;

notify pgrst, 'reload schema';
