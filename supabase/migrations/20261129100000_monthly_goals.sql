-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a project's goals per month (Sean, Oct 2026)
--
-- A client wants, say, 5 appointments a month: the project keeps that as
-- its monthly goal, its overall goal following from it (5 × 12 = 60) unless
-- one is set. Project pages and Project Goals show the project's average per
-- month against it, and this month's so far.
--
--   projects.lead_goal_month, appt_goal_month   the goals per month
--   project_month_counts(projects)   this month's leads and appointments
--                                    developed on each (business time)
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists lead_goal_month int;
alter table public.projects add column if not exists appt_goal_month int;
alter table public.projects drop constraint if exists projects_lead_goal_month_check;
alter table public.projects add constraint projects_lead_goal_month_check check (lead_goal_month is null or lead_goal_month between 0 and 100000);
alter table public.projects drop constraint if exists projects_appt_goal_month_check;
alter table public.projects add constraint projects_appt_goal_month_check check (appt_goal_month is null or appt_goal_month between 0 and 100000);

/** This month's leads and appointments developed on each project asked for (administrators and managers). */
create or replace function public.project_month_counts(p_project_ids bigint[])
returns table (project_id bigint, leads bigint, appointments bigint)
language sql stable security definer set search_path = public as $$
  select e.project_id, count(*) filter (where e.kind = 'lead'), count(*) filter (where e.kind = 'appointment')
    from public.pay_events e
   where public.is_manager()
     and e.project_id = any(p_project_ids) and not e.is_chargeback and e.kind in ('lead', 'appointment')
     and e.created_at >= (date_trunc('month', now() at time zone public.business_tz()) at time zone public.business_tz())
   group by 1;
$$;
revoke execute on function public.project_month_counts(bigint[]) from public, anon;
grant execute on function public.project_month_counts(bigint[]) to authenticated;

notify pgrst, 'reload schema';
