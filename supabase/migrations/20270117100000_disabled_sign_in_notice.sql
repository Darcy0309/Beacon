-- Signing in to a disabled account (Nov 2026): say the account is disabled, rather than that
-- the email and password don't match. Supabase refuses a disabled (banned) sign-in before it
-- checks the password, so the server checks it here first: only someone who knows the right
-- password learns the account is disabled; anyone else still gets "don't match".
--
-- The server's (service role) alone.
--
-- Safe to run again.

create or replace function public.disabled_account_password(p_email text, p_password text)
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
      from auth.users a
      join public.users u on u.auth_id = a.id
     where lower(a.email) = lower(btrim(p_email))
       and u.status = 'disabled'
       and a.encrypted_password is not null and a.encrypted_password <> ''
       and a.encrypted_password = extensions.crypt(p_password, a.encrypted_password)
  );
$$;
revoke execute on function public.disabled_account_password(text, text) from public, anon, authenticated;
grant execute on function public.disabled_account_password(text, text) to service_role;
