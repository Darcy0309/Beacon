-- A customizable dashboard (Sean, Nov 2026: "Is it possible to make the dashboard customizable … so each person can
-- set it up how they like?"). Each person's layout of their dashboard (its sections' order, which are hidden or
-- collapsed, and where each sits: full width, left or right), and an administrator's default for each kind of
-- dashboard (user_id null), which a person's own starts from.
--
--   kind: 'admin', 'manager', 'client', 'agent' (whose dashboard it is: an administrator's, an account manager's…).
--   layout: { order: [section…], hidden: [section…], collapsed: [section…], place: { section: 'full'|'left'|'right' } }.
--
-- A person reads and keeps their own; everyone reads the defaults; administrators set the defaults (and read anyone's,
-- to see a manager's dashboard as they do). Safe to run more than once.

create table if not exists public.dashboard_layouts (
  id bigint generated always as identity primary key,
  user_id bigint references public.users(id) on delete cascade,
  kind text not null check (kind in ('admin', 'manager', 'client', 'agent')),
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_layouts_one unique nulls not distinct (user_id, kind)
);

alter table public.dashboard_layouts enable row level security;
drop policy if exists dashboard_layouts_read on public.dashboard_layouts;
create policy dashboard_layouts_read on public.dashboard_layouts for select to authenticated
  using (user_id is null or user_id = public.app_user_id() or public.is_admin());
drop policy if exists dashboard_layouts_write on public.dashboard_layouts;
create policy dashboard_layouts_write on public.dashboard_layouts for all to authenticated
  using ((user_id is not null and user_id = public.app_user_id()) or (user_id is null and public.is_admin()))
  with check ((user_id is not null and user_id = public.app_user_id()) or (user_id is null and public.is_admin()));
grant select, insert, update, delete on public.dashboard_layouts to authenticated;
grant all on public.dashboard_layouts to service_role;

notify pgrst, 'reload schema';
