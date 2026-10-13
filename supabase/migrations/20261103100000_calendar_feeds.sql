-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a personal calendar's busy times on a project's calendar
-- (Sean, Oct 2026)
--
-- A client, agent or manager connects their own calendar (Google, Outlook
-- or iCloud, by its private link) to a project's calendar. The app reads
-- when they are busy, and nothing else, and keeps it as blocked time
-- there: shown on the calendar, and warned about when a manager books over
-- it, like time blocked out by hand.
--
--   calendar_feeds            the calendar a person connected to a
--                             project's calendar: its link (theirs alone to
--                             read), when it was last read, how it went
--   calendar_blocks.feed_id   blocked time that came from one; it goes when
--                             the calendar is disconnected
--
-- The link gives whoever holds it the person's calendar, so nobody but its
-- owner can read it, an administrator included. The server reads the link
-- itself (the service role), never a browser: when it is connected, when
-- its owner asks, and when the project's calendar is opened and the last
-- read is more than fifteen minutes old.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_feeds (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references public.users(id) on delete cascade,
  project_id      bigint not null references public.projects(id) on delete cascade,
  url             text not null check (url ~ '^https://' and length(url) <= 1000),
  provider        text not null check (length(provider) <= 40),
  busy_count      int not null default 0,
  last_synced_at  timestamptz,
  last_error      text check (length(last_error) <= 300),
  created_at      timestamptz not null default now(),
  unique (user_id, project_id)
);
create index if not exists calendar_feeds_project on public.calendar_feeds (project_id);

-- Kept on the calendar's own project, and its owner's.
create or replace function public.tg_calendar_feeds_place()
returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.project_id := coalesce(public.calendar_project(new.project_id), new.project_id);
  end if;
  if current_user = 'authenticated' then
    new.user_id := public.app_user_id();
    if tg_op = 'UPDATE' then
      new.project_id := old.project_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists calendar_feeds_place on public.calendar_feeds;
create trigger calendar_feeds_place
  before insert or update on public.calendar_feeds
  for each row execute function public.tg_calendar_feeds_place();

alter table public.calendar_feeds enable row level security;
-- One's own, on a calendar one can see: nobody else reads the link.
drop policy if exists calendar_feeds_own on public.calendar_feeds;
create policy calendar_feeds_own on public.calendar_feeds
  for all to authenticated
  using (user_id = (select public.app_user_id()))
  with check (user_id = (select public.app_user_id())
              and ((select public.is_staff()) or project_id in (select public.client_project_ids())));
drop policy if exists mfa_required on public.calendar_feeds;
create policy mfa_required on public.calendar_feeds as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.calendar_feeds;
create policy active_account_required on public.calendar_feeds as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.calendar_feeds from anon;
grant select, insert, update, delete on public.calendar_feeds to authenticated;
grant all on public.calendar_feeds to service_role;

-- Blocked time read from a connected calendar. It is the server's to write:
-- a block added by hand never carries one.
alter table public.calendar_blocks add column if not exists feed_id bigint references public.calendar_feeds(id) on delete cascade;
create index if not exists calendar_blocks_feed on public.calendar_blocks (feed_id) where feed_id is not null;

create or replace function public.tg_calendar_blocks_place()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.project_id := coalesce(public.calendar_project(new.project_id), new.project_id);
  if current_user = 'authenticated' then
    new.created_by := public.app_user_id();
    new.created_at := now();
    new.feed_id := null;
  end if;
  return new;
end $$;

-- A connected calendar's busy times go with the calendar, not one by one.
drop policy if exists calendar_blocks_synced_kept on public.calendar_blocks;
create policy calendar_blocks_synced_kept on public.calendar_blocks as restrictive
  for delete to authenticated
  using (feed_id is null);

-- The server writes synced busy times with the service role, and placing a
-- block asks which calendar a project's is.
grant execute on function public.calendar_project(bigint) to service_role;
