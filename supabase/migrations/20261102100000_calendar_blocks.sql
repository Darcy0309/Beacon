-- ---------------------------------------------------------------------------
-- Lighthouse CRM — time blocked out on a project's calendar (Sean, Oct 2026)
--
-- A client or agent blocks out whole days, or a time of day (10 AM – 1 PM),
-- on a project's calendar: when they are not available for appointments.
-- Blocked time shows on the calendar, and a manager booking over it is
-- warned (not stopped). Managers, agents, administrators and the client's
-- own people can all add and remove it.
--
-- A project's calendar is its appointment project's: a DB dev project's
-- appointments are kept on the project it promotes to, so blocked time
-- added from a DB dev project goes there too (one calendar for the pair).
--
--   calendar_blocks                 from a day to a day, all day or between
--                                   two times each day, with a note
--   calendar_project(project)       the project whose calendar it is
-- ---------------------------------------------------------------------------

create or replace function public.calendar_project(p_project_id bigint)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(p.appt_project_id, p.id) from public.projects p where p.id = p_project_id;
$$;
revoke execute on function public.calendar_project(bigint) from public, anon;
grant execute on function public.calendar_project(bigint) to authenticated;

create table if not exists public.calendar_blocks (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects(id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  start_time  time,
  end_time    time,
  note        text check (length(note) <= 200),
  created_by  bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366),
  -- All day (no times), or both times with the end after the start.
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time))
);
create index if not exists calendar_blocks_project on public.calendar_blocks (project_id, starts_on, ends_on);

-- Kept on the calendar's own project, and signed by whoever added it.
create or replace function public.tg_calendar_blocks_place()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.project_id := coalesce(public.calendar_project(new.project_id), new.project_id);
  if current_user = 'authenticated' then
    new.created_by := public.app_user_id();
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists calendar_blocks_place on public.calendar_blocks;
create trigger calendar_blocks_place
  before insert on public.calendar_blocks
  for each row execute function public.tg_calendar_blocks_place();

alter table public.calendar_blocks enable row level security;
-- Staff, and a client's people for their own projects: to see it, add it and take it off.
drop policy if exists calendar_blocks_all on public.calendar_blocks;
create policy calendar_blocks_all on public.calendar_blocks
  for all to authenticated
  using ((select public.is_staff()) or project_id in (select public.client_project_ids()))
  with check ((select public.is_staff())
              or (project_id in (select public.client_project_ids())
                  and public.calendar_project(project_id) in (select public.client_project_ids())));
drop policy if exists mfa_required on public.calendar_blocks;
create policy mfa_required on public.calendar_blocks as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.calendar_blocks;
create policy active_account_required on public.calendar_blocks as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.calendar_blocks from anon;
grant select, insert, delete on public.calendar_blocks to authenticated;
grant all on public.calendar_blocks to service_role;
