-- ---------------------------------------------------------------------------
-- Lighthouse CRM — the account manager's dashboard (Sean, Oct 2026)
--
--   daily_goals               the leads and appointments a manager means to
--                             develop today, set as they start their day; the
--                             dashboard tracks the % reached.
--   project_assignment_log    each project assignment made or removed, so
--                             "Active Projects" can say what changed in the
--                             last 30 days (assignments carry no dates).
--   daily_production(day)     per person and day: when they started using
--                             Lighthouse, their calls, leads and appointments
--                             (as the production report counts them), the
--                             minutes worked, and their goals. Everyone for an
--                             administrator; anyone else, themselves.
-- ---------------------------------------------------------------------------

create table if not exists public.daily_goals (
  user_id     bigint not null references public.users(id) on delete cascade,
  day         date not null,
  leads_goal  int check (leads_goal between 0 and 1000),
  appts_goal  int check (appts_goal between 0 and 1000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_goals enable row level security;

drop policy if exists daily_goals_read on public.daily_goals;
create policy daily_goals_read on public.daily_goals
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists daily_goals_write on public.daily_goals;
create policy daily_goals_write on public.daily_goals
  for all to authenticated
  using (user_id = (select public.app_user_id()) and (select public.is_staff()))
  with check (user_id = (select public.app_user_id()) and (select public.is_staff()));
drop policy if exists mfa_required on public.daily_goals;
create policy mfa_required on public.daily_goals as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.daily_goals;
create policy active_account_required on public.daily_goals as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.daily_goals from anon;
grant select, insert, update, delete on public.daily_goals to authenticated;
grant all on public.daily_goals to service_role;

-- Each assignment made (+1) or removed (-1), for whom and when.
create table if not exists public.project_assignment_log (
  id          bigint generated always as identity primary key,
  user_id     bigint not null,
  project_id  bigint not null,
  change      smallint not null check (change in (-1, 1)),
  at          timestamptz not null default now()
);
create index if not exists project_assignment_log_user on public.project_assignment_log (user_id, at desc);
alter table public.project_assignment_log enable row level security;
drop policy if exists project_assignment_log_read on public.project_assignment_log;
create policy project_assignment_log_read on public.project_assignment_log
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists mfa_required on public.project_assignment_log;
create policy mfa_required on public.project_assignment_log as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on public.project_assignment_log from anon;
revoke insert, update, delete on public.project_assignment_log from authenticated;
grant select on public.project_assignment_log to authenticated;
grant all on public.project_assignment_log to service_role;

create or replace function public.tg_log_project_assignment()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.ae_user_id is not null
     and (tg_op = 'DELETE' or old.ae_user_id is distinct from new.ae_user_id or old.project_id is distinct from new.project_id) then
    insert into public.project_assignment_log (user_id, project_id, change) values (old.ae_user_id, old.project_id, -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.ae_user_id is not null
     and (tg_op = 'INSERT' or old.ae_user_id is distinct from new.ae_user_id or old.project_id is distinct from new.project_id) then
    insert into public.project_assignment_log (user_id, project_id, change) values (new.ae_user_id, new.project_id, 1);
  end if;
  return null;
end $$;
drop trigger if exists project_assignments_log on public.project_assignments;
create trigger project_assignments_log
  after insert or update or delete on public.project_assignments
  for each row execute function public.tg_log_project_assignment();

/**
 * One day's production per person (the business's day; today by default):
 * account managers, and agents who worked that day. When they first used
 * Lighthouse, their calls, leads and appointments (the production report's
 * counts), minutes worked and paid (Pay & Hours'), and the goals they set.
 * Row Level Security decides whose: everyone's for an administrator.
 */
create or replace function public.daily_production(p_day date default null)
returns table (
  user_id bigint, first_name text, last_name text, role text,
  started_at timestamptz, calls bigint, leads bigint, appointments bigint,
  worked_minutes int, paid_minutes int, leads_goal int, appts_goal int
)
language sql stable security invoker set search_path = public as $$
  with d as (
    select coalesce(p_day, (now() at time zone public.business_tz())::date) as day, public.business_tz() as tz
  ), pr as (
    select p.user_id, sum(p.calls) as calls, sum(p.leads) as leads, sum(p.appointments) as appts
      from d, public.production_report(d.day, d.day) p
     group by 1
  ), wd as (
    select w.user_id, w.worked, w.paid from d, public.work_days(d.day, d.day) w
  ), st as (
    select a.user_id, min(a.minute) as started
      from public.work_activity a, d
     where a.minute >= (d.day::timestamp at time zone d.tz) and a.minute < ((d.day + 1)::timestamp at time zone d.tz)
     group by 1
  ), people as (
    select u.id, u.first_name, u.last_name, u.role
      from public.users u
     where u.status = 'active'
       and (public.is_admin() or u.id = public.app_user_id())
       and (u.role = 'manager'
            or u.id in (select st.user_id from st) or u.id in (select pr.user_id from pr))
  )
  select p.id, p.first_name, p.last_name, p.role, st.started,
         coalesce(pr.calls, 0), coalesce(pr.leads, 0), coalesce(pr.appts, 0),
         coalesce(wd.worked, 0), coalesce(wd.paid, 0), g.leads_goal, g.appts_goal
    from people p
    cross join d
    left join pr on pr.user_id = p.id
    left join wd on wd.user_id = p.id
    left join st on st.user_id = p.id
    left join public.daily_goals g on g.user_id = p.id and g.day = d.day
   order by p.first_name, p.last_name, p.id;
$$;
revoke execute on function public.daily_production(date) from public, anon;
grant execute on function public.daily_production(date) to authenticated;
