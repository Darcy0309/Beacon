-- Taking a session over was started and abandoned (Oct 2026): its migration
-- was never part of the app, but where it was run it left pieces behind that
-- break things. The worst: a second link from the activity log to users,
-- which made "whose activity is this" ambiguous to the API, so My Security
-- (where a temporary password or an invitation sends people) would not open.
--
-- This removes every piece and puts back the three functions it replaced,
-- exactly as migrations 20260929100000 and 20261006100000 define them. Where
-- that migration was never run, this changes nothing.
--
-- Safe to run again.

-- --- The activity log: one link to users, and its stamp as it was -----------
alter table public.activity_log drop column if exists acting_admin_id;

create or replace function public.tg_activity_log_stamp()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.user_id := public.app_user_id();
    new.created_at := now();
  end if;
  return new;
end $$;

-- --- Two-factor: satisfied by a second factor, or by having none enrolled ---
create or replace function public.mfa_satisfied()
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- --- Time worked: recorded for the person signed in -------------------------
create or replace function public.track_activity(p_kind text default 'use', p_lead bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();   -- null for an inactive account or one short of two-factor
  v_lead bigint;
begin
  if v_me is null or public.app_role() not in ('admin', 'manager', 'agent') then
    return;
  end if;
  if p_kind = 'call' and p_lead is not null then
    select l.id into v_lead from public.leads l where l.id = p_lead;
  end if;
  if v_lead is not null then
    insert into public.work_activity (user_id, minute, kind, lead_id)
    values (v_me, date_trunc('minute', now()), 'call', v_lead)
    on conflict do nothing;
  end if;
  insert into public.work_activity (user_id, minute, kind)
  values (v_me, date_trunc('minute', now()), 'use')
  on conflict do nothing;
end $$;
revoke execute on function public.track_activity(text, bigint) from public, anon;
grant execute on function public.track_activity(text, bigint) to authenticated;

-- --- What it added ----------------------------------------------------------
drop function if exists public.request_takeover(bigint, int, text);
drop function if exists public.answer_takeover(bigint, boolean);
drop function if exists public.takeover_details(bigint);
drop function if exists public.prepare_takeover(bigint);
drop function if exists public.start_takeover(bigint, bigint, uuid);
drop function if exists public.end_takeover(bigint, text);
drop function if exists public.my_takeover();
drop function if exists public.user_display_name(bigint);
drop function if exists public.jwt_session_id();
drop table if exists public.session_takeovers;

-- The API reads the tables' links from its cache: have it read them again.
notify pgrst, 'reload schema';
