-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a pay period schedule (Sean, Oct 2026)
--
-- The business plans its pay periods for the year, staggered (9/30–10/13,
-- 10/14–10/28, …), each with its pay date and the days it is closed or
-- optional. An administrator enters them in Settings; with "Custom schedule"
-- chosen as the pay period, Pay & Hours follows them, and every account
-- manager sees the year's schedule there.
--
--   pay_periods   one row a period: its first and last day, when it is paid,
--                 the closed days (not counted as work days) and the optional
--                 ones, each set with what it is ("New Years", "MLK Day").
--                 Periods never overlap.
-- ---------------------------------------------------------------------------

create table if not exists public.pay_periods (
  id              bigint generated always as identity primary key,
  starts_on       date not null,
  ends_on         date not null,
  pay_date        date,
  closed_dates    date[] not null default '{}',
  closed_label    text,
  optional_dates  date[] not null default '{}',
  optional_label  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pay_periods_in_order check (ends_on >= starts_on and ends_on - starts_on <= 62),
  constraint pay_periods_labels check (length(coalesce(closed_label, '')) <= 80 and length(coalesce(optional_label, '')) <= 80),
  constraint pay_periods_no_overlap exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
create index if not exists pay_periods_starts on public.pay_periods (starts_on);

alter table public.pay_periods enable row level security;

drop policy if exists pay_periods_read on public.pay_periods;
create policy pay_periods_read on public.pay_periods
  for select to authenticated using ((select public.is_staff()));
drop policy if exists pay_periods_write on public.pay_periods;
create policy pay_periods_write on public.pay_periods
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.pay_periods;
create policy mfa_required on public.pay_periods as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.pay_periods;
create policy active_account_required on public.pay_periods as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

revoke all on public.pay_periods from anon;
grant select, insert, update, delete on public.pay_periods to authenticated;
grant all on public.pay_periods to service_role;
