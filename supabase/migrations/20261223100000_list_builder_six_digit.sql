-- List Builder: the 6-digit codes (Sean, Oct 2026). The SIC list now holds
-- the client's 6-digit sheet; the List Builder's tree opens each industry
-- (4 digits) into its 6-digit codes from it, for clients, staff and the
-- prospects who fill in a request from a link (no sign-in). One call, read
-- after the page is up.
--
--   sic_details()   [[code, description], …]: every 6-digit code in the SIC list
--
-- Safe to run more than once.

create or replace function public.sic_details()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(s.code, btrim(s.description)) order by s.code), '[]'::jsonb)
    from public.sic_codes s
   where s.code ~ '^\d{6}$' and nullif(btrim(s.description), '') is not null;
$$;
revoke execute on function public.sic_details() from public;
grant execute on function public.sic_details() to anon, authenticated;
