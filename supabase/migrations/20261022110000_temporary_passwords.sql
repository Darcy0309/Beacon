-- ---------------------------------------------------------------------------
-- Lighthouse CRM — temporary passwords (Sean, Oct 2026)
--
-- An administrator can create an account with a temporary password, or give
-- an existing one a new temporary password, instead of an emailed link.
-- Passwords themselves are never stored readable (Supabase keeps a one-way
-- hash): nobody can look one up. What is stored is that the password is
-- temporary, so the person is taken to set their own at their next sign-in.
--
--   users.must_change_password   set by an administrator with a temporary
--                                password; cleared when the person sets
--                                their own (clear_temporary_password()).
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists must_change_password boolean not null default false;

-- The guard on what people may change in their own row: as before, and the
-- temporary-password flag too (only an administrator sets it; the person
-- clears it by setting a password, through clear_temporary_password()).
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
  if (new.role, new.status, new.company_id, new.auth_id, new.email, new.user_type_id, new.must_change_password)
     is distinct from
     (old.role, old.status, old.company_id, old.auth_id, old.email, old.user_type_id, old.must_change_password) then
    raise exception 'Only an administrator can change a user''s role, status, client account or sign-in identity'
      using errcode = '42501';
  end if;
  return new;
end $$;

/** The signed-in person has set their own password: their temporary one is gone. */
create or replace function public.clear_temporary_password()
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update public.users set must_change_password = false, updated_at = now()
   where auth_id = auth.uid() and must_change_password;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke execute on function public.clear_temporary_password() from public, anon;
grant execute on function public.clear_temporary_password() to authenticated;
