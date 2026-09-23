-- ---------------------------------------------------------------------------
-- Lighthouse CRM — retire IP lockdown, add activity logging
--
-- The legacy app pinned each user to an IP address, which broke whenever
-- somebody worked from a different desk and did nothing against a stolen
-- password. It is replaced by two-factor authentication (TOTP), which
-- Supabase Auth stores in the auth schema — so there is nothing to add here
-- beyond a way for administrators to see who has it switched on.
--
-- The activity log answers "how much is this account actually using the
-- system": every sign-in, and the record changes that matter.
-- ---------------------------------------------------------------------------

-- --- IP lockdown, removed -------------------------------------------------
drop policy if exists ip_whitelist_read on public.ip_whitelist;
drop policy if exists ip_whitelist_write on public.ip_whitelist;
drop table if exists public.ip_whitelist;
alter table public.users drop column if exists ip_locked;

-- --- Two-factor status ----------------------------------------------------
-- auth.mfa_factors is not exposed through the API, so this reads it on the
-- caller's behalf: administrators and managers see every account's status,
-- everyone else sees only their own.
create or replace function public.mfa_status()
returns table (user_id bigint, enabled boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id,
         exists (select 1 from auth.mfa_factors f
                  where f.user_id = u.auth_id and f.status = 'verified')
    from public.users u
   where public.is_manager() or u.auth_id = auth.uid();
$$;

grant execute on function public.mfa_status() to authenticated;

-- --- Activity log ---------------------------------------------------------
create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  user_id    bigint references public.users(id) on delete set null,
  action     text not null,                 -- sign_in, sign_out, lead.create, …
  entity     text,                          -- lead, project, user, …
  entity_id  bigint,
  detail     text,                          -- a short human-readable summary
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_created_idx on public.activity_log (user_id, created_at desc);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

-- Anyone may record their own activity; nobody may rewrite history.
create policy activity_log_insert_self on public.activity_log
  for insert to authenticated
  with check (user_id = public.app_user_id());

-- Staff leaders see everything, everyone else sees only their own trail.
create policy activity_log_read on public.activity_log
  for select to authenticated
  using (public.is_manager() or user_id = public.app_user_id());

grant select, insert on public.activity_log to authenticated;

/**
 * Per-user activity roll-up for the administration screen: sign-ins this
 * calendar month, sign-ins in the last 30 days, total recorded actions and
 * when the account was last seen.
 */
create or replace function public.activity_summary()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'last_active' desc nulls last), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'user_id',        u.id,
               'first_name',     u.first_name,
               'last_name',      u.last_name,
               'email',          u.email,
               'role',           u.role,
               'logins_month',   count(*) filter (where a.action = 'sign_in' and a.created_at >= date_trunc('month', now())),
               'logins_30d',     count(*) filter (where a.action = 'sign_in' and a.created_at >= now() - interval '30 days'),
               'actions_30d',    count(*) filter (where a.action <> 'sign_in' and a.created_at >= now() - interval '30 days'),
               'last_active',    max(a.created_at)
             ) as x
        from public.users u
        left join public.activity_log a on a.user_id = u.id
       group by u.id, u.first_name, u.last_name, u.email, u.role
    ) t;
$$;

grant execute on function public.activity_summary() to authenticated;
