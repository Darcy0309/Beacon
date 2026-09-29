-- ---------------------------------------------------------------------------
-- Lighthouse CRM — security hardening
--
-- An audit found four holes in the database's own defences:
--
--   1. Any signed-in user could change their own row in public.users — role,
--      company, status — and become an administrator with one REST call.
--   2. Setting an account to "disabled" changed nothing: the helper functions
--      the policies rely on only ever read the role, never the status.
--   3. Two-factor was enforced only by the web app. A password alone yields a
--      token the REST API accepts, so an attacker with a stolen password and
--      no authenticator had full data access.
--   4. Account managers could switch off the organisation's alert rules, and
--      a direct message's link check could be slipped past with a tab.
--
-- A review of the first draft added: two-factor must also bind the elevated
-- (security definer) functions, not just table reads; a disabled account must
-- lose even the reference tables; and the password-change notice must not be
-- something a user can fire at will or put their own words into.
--
-- Everything here runs inside the database, so it holds for the app, the
-- REST API, Realtime and anything else that presents a user's token.
-- ---------------------------------------------------------------------------

-- --- 3. Two-factor holds at the database ------------------------------------
-- True when the caller has cleared two-factor, or has never set it up. Reads
-- auth.mfa_factors on the caller's behalf, so no grant on the auth schema is
-- needed. The assurance level is a claim in the token PostgREST presents.
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

-- --- 2. No role without an active account and a satisfied second factor --
-- Every policy — and every role check inside the elevated functions such as
-- send_notification() — goes through these helpers. So a disabled or invited
-- account, or a session that has not yet entered its two-factor code, has no
-- identity, no role and no company anywhere at once. Invited accounts become
-- active when they set their password (activate_invited_account below).
create or replace function public.app_user_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.users
   where auth_id = auth.uid() and status = 'active' and public.mfa_satisfied()
   limit 1;
$$;

create or replace function public.app_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.users
   where auth_id = auth.uid() and status = 'active' and public.mfa_satisfied()
   limit 1;
$$;

create or replace function public.app_company_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select company_id from public.users
   where auth_id = auth.uid() and status = 'active' and public.mfa_satisfied()
   limit 1;
$$;

-- --- 1. Nobody promotes themselves -----------------------------------------
-- Row Level Security cannot limit which columns a policy lets through, so a
-- trigger holds the line: only an administrator may change the columns that
-- decide what an account is. The check is skipped for the database owner and
-- the service role (migrations, seeds, admin API), which never carry a user.
-- Runs as the invoker on purpose: inside a security-definer function
-- current_user would be the owner, never 'authenticated'.
create or replace function public.tg_users_guard_protected_columns()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if (new.role, new.status, new.company_id, new.auth_id, new.email, new.user_type_id)
     is distinct from
     (old.role, old.status, old.company_id, old.auth_id, old.email, old.user_type_id) then
    raise exception 'Only an administrator can change a user''s role, status, client account or sign-in identity'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists users_guard_protected_columns on public.users;
create trigger users_guard_protected_columns
  before update on public.users
  for each row execute function public.tg_users_guard_protected_columns();

-- Restrictive policies are ANDed with every permissive one, whatever a
-- table's own policies say:
--   mfa_required             — an enrolled account that has not entered its
--                              code reads and writes nothing (every table);
--   active_account_required  — a disabled or invited account reads and writes
--                              nothing, reference tables included (every table
--                              but users, where reading your own row is how
--                              the app knows to show "account disabled").
-- The checks sit in sub-selects so Postgres runs them once per query rather
-- than once per row. Re-running this is safe and covers tables added later.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public' and rowsecurity
  loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated
         using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', t);
    execute format('drop policy if exists active_account_required on public.%I', t);
    if t <> 'users' then
      execute format(
        'create policy active_account_required on public.%I as restrictive for all to authenticated
           using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null)', t);
    end if;
  end loop;
end $$;

-- A disabled or invited account may still read its own row, but not edit it.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (auth_id = auth.uid() and (select public.app_user_id()) is not null)
  with check (auth_id = auth.uid());

-- --- 4. Organisation-wide settings belong to administrators ------------------
drop policy if exists alert_rules_write on public.alert_rules;
create policy alert_rules_write on public.alert_rules
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The alert log is written by notify_users() (security definer); nobody
-- writes it by hand.
drop policy if exists alert_log_write on public.alert_log;
create policy alert_log_write on public.alert_log
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Direct-message links: inside the app only, and no whitespace or control
-- characters that could smuggle a second URL past the check.
create or replace function public.send_notification(
  p_user_ids bigint[],
  p_roles    text[],
  p_title    text,
  p_body     text,
  p_link     text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_sent  int;
  v_title text := btrim(coalesce(p_title, ''));
  v_link  text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can send notifications'
      using errcode = '42501';
  end if;
  if length(v_title) = 0 then
    raise exception 'A title is required' using errcode = '22023';
  end if;
  if v_link is not null and v_link !~ '^/([^/\\[:space:][:cntrl:]][^[:space:][:cntrl:]]*)?$' then
    raise exception 'Links must point inside Lighthouse, like /leads/123' using errcode = '22023';
  end if;

  v_sent := public.notify_users(
    array(select id from public.users
           where id = any(coalesce(p_user_ids, '{}'))
              or role = any(coalesce(p_roles, '{}'))),
    'message', v_title, nullif(btrim(coalesce(p_body, '')), ''), v_link, null, v_batch);

  return jsonb_build_object('batch', v_batch, 'sent', v_sent);
end $$;

-- --- The activity trail records who really acted, and when --------------------
-- Rows written through the API get the caller's identity and the current
-- time stamped on, so nobody can log actions as someone else or backdate.
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

drop trigger if exists activity_log_stamp on public.activity_log;
create trigger activity_log_stamp
  before insert on public.activity_log
  for each row execute function public.tg_activity_log_stamp();

-- --- Invitations and passwords -------------------------------------------------
-- An invited person who has just set their password turns their own account
-- on. This is the one status change a user may make for themselves, and it
-- only goes one way.
create or replace function public.activate_invited_account()
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update public.users set status = 'active', updated_at = now()
   where auth_id = auth.uid() and status = 'invited';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke execute on function public.activate_invited_account() from public, anon;
grant execute on function public.activate_invited_account() to authenticated;

-- When someone other than an administrator sets or changes their password,
-- the administrators hear about it (the client asked to be told when a client
-- account does this). Hardened so it cannot be abused as a messaging channel:
--   * only the server raises it — with the service key, right after the
--     password really changed — so a user can neither fire it at will nor
--     choose its wording;
--   * the wording is fixed and names the account by its email, which only an
--     administrator can change — nothing the user typed reaches the title;
--   * at most one notice per account per quarter hour.
drop function if exists public.notify_password_changed();
drop function if exists public.notify_password_changed(boolean);
create or replace function public.notify_password_changed(p_auth_id uuid, p_first_time boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_me    public.users%rowtype;
  v_link  text;
begin
  select * into v_me from public.users where auth_id = p_auth_id and status = 'active';
  if v_me.id is null or v_me.role = 'admin' then
    return 0;
  end if;

  v_link := '/users?q=' || replace(replace(replace(replace(replace(
              v_me.email, '%', '%25'), '+', '%2B'), '&', '%26'), '#', '%23'), ' ', '%20');
  if exists (select 1 from public.notifications
              where kind = 'system' and link = v_link and created_at > now() - interval '15 minutes') then
    return 0;
  end if;

  return public.notify_users(
    array(select id from public.users where role = 'admin'),
    'system',
    case when p_first_time then 'Invitation accepted: ' else 'Password changed: ' end || v_me.email,
    'Role: ' || v_me.role || coalesce(' · ' || (select name from public.companies where id = v_me.company_id), ''),
    v_link,
    null, null);
end $$;
revoke execute on function public.notify_password_changed(uuid, boolean) from public, anon, authenticated;
grant execute on function public.notify_password_changed(uuid, boolean) to service_role;

-- --- Exact email lookup ---------------------------------------------------------
-- Case-insensitive and exact. The invite form needs this: through the API,
-- LIKE patterns treat both "_" and "*" as wildcards, so a pattern match could
-- attach a new invitation to someone else's directory row. Runs as the caller.
create index if not exists users_email_lower_idx on public.users (lower(email));

create or replace function public.user_by_email(p_email text)
returns table (id bigint, auth_id uuid, status text)
language sql stable security invoker set search_path = public as $$
  select u.id, u.auth_id, u.status
    from public.users u
   where lower(u.email) = lower(btrim(p_email))
   order by u.id
   limit 1;
$$;
revoke execute on function public.user_by_email(text) from public, anon;
grant execute on function public.user_by_email(text) to authenticated;

-- --- Role checks run once per query, not once per row ----------------------------
-- The role helpers now also check two-factor, which made every policy that
-- calls them bare (is_staff(), app_company_id(), …) pay that cost for every
-- row — about 3x slower, enough to push the Lead Explorer past the statement
-- timeout at around 20,000 leads. Wrapping each call in a sub-select lets
-- Postgres evaluate it once per query (an InitPlan). Rewrites the existing
-- policies in place; calls already wrapped are left alone, so this is safe to
-- run again and picks up policies added later.
do $$
declare
  p record;
  v_re constant text := '(?<!SELECT )\m(public\.)?(is_staff|is_manager|is_admin|app_user_id|app_role|app_company_id)\(\)';
  v_qual  text;
  v_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and policyname not in ('mfa_required', 'active_account_required')
  loop
    v_qual  := regexp_replace(p.qual,       v_re, '(select public.\2())', 'g');
    v_check := regexp_replace(p.with_check, v_re, '(select public.\2())', 'g');
    if v_qual is distinct from p.qual then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, v_qual);
    end if;
    if v_check is distinct from p.with_check then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, v_check);
    end if;
  end loop;
end $$;
