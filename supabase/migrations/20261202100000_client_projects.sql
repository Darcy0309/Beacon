-- ---------------------------------------------------------------------------
-- Lighthouse CRM — clients see their own projects (Sean, Oct 2026)
--
-- A client's people open Projects for their own projects. The project's
-- figures count its calls, which they cannot read one by one: they get the
-- times of the calls on their own projects (no caller, no lead), enough for
-- Calls This Month and its last two weeks.
--
--   project_call_dates(project)   when each call on it was made (staff: any
--                                 project; a client: their own)
--   project_overview()            counts the calls through it
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

create or replace function public.project_call_dates(p_project_id bigint)
returns table (call_date timestamptz)
language sql stable security definer set search_path = public as $$
  select c.call_date from public.call_records c
   where c.project_id = p_project_id
     and public.app_user_id() is not null
     and (public.is_staff() or p_project_id in (select public.client_project_ids()));
$$;
revoke execute on function public.project_call_dates(bigint) from public, anon;
grant execute on function public.project_call_dates(bigint) to authenticated;

create or replace function public.project_overview(p_project_id bigint)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with b as (select * from public.business_bounds()),
  l as (
    select l.assigned_user_id, r.viable, r.callable
      from public.leads l join public.call_results r on r.id = l.result_id
     where l.project_id = p_project_id
  ),
  a as (
    select a.qa_status, a.appt_create_date from public.appointments a
     where (a.project_id = p_project_id or a.set_project_id = p_project_id) and a.invalid_at is null
  ),
  -- Through project_call_dates(): a client's people may count the calls on their own project too.
  c as (select c.call_date from public.project_call_dates(p_project_id) c),
  days as (
    select generate_series(0, 13) as ago
  )
  select jsonb_build_object(
    'leads',        (select count(*) from l),
    'viable_left',  (select count(*) from l where viable and callable),
    'unassigned',   (select count(*) from l where viable and callable and assigned_user_id is null),
    'pending',      (select count(*) from l where viable and not callable),
    'off_list',     (select count(*) from l where not viable),
    'appointments', (select count(*) from a),
    'appts_month',  (select count(*) from a, b where a.appt_create_date >= b.month_start),
    'qa_pending',   (select count(*) from a where a.qa_status = 'pending'),
    'calls_today',  (select count(*) from c, b where c.call_date >= b.day_start),
    'calls_month',  (select count(*) from c, b where c.call_date >= b.month_start),
    'last_worked',  (select max(c.call_date) from c),
    -- Calls per day for the last two weeks, oldest first (the tile sparkline).
    'calls_14d',    (select coalesce(jsonb_agg(n order by ago desc), '[]'::jsonb)
                       from (select d.ago, (select count(*) from c, b
                                             where c.call_date >= b.day_start - make_interval(days => d.ago)
                                               and c.call_date <  b.day_start - make_interval(days => d.ago - 1)) as n
                               from days d) t)
  );
$$;
revoke execute on function public.project_overview(bigint) from public, anon;
grant execute on function public.project_overview(bigint) to authenticated;

notify pgrst, 'reload schema';
