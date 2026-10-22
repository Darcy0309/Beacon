-- ---------------------------------------------------------------------------
-- Lighthouse CRM — one email per person per event (Sean, Oct 2026)
--
-- An administrator who also watches a client (by email) got a client's
-- appointment update twice: once as an administrator, once as a watcher.
-- The notification was told once already; now the email is too: a watcher's
-- email is not queued when the same one (same person, subject and link) was
-- queued a moment before.
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

create or replace function public.notify_client_watchers(p_company_id bigint, p_kind text, p_title text, p_body text,
  p_link text, p_already bigint[] default '{}', p_sender bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_to bigint[];
begin
  if p_company_id is null then return; end if;
  select array_agg(w.user_id) into v_to from public.client_watchers_of(p_company_id) w
   where not (w.user_id = any(coalesce(p_already, '{}'))) and w.user_id is distinct from p_sender;
  if v_to is not null then
    perform public.notify_users(v_to, p_kind, p_title, p_body, p_link, null, gen_random_uuid(), p_sender);
  end if;
  -- By email to those who asked, unless the event has emailed them the same already.
  insert into public.email_outbox (kind, user_id, email, subject, body, link)
  select 'client_' || p_kind, u.id, u.email, left(p_title, 200), left(coalesce(p_body, ''), 2000), p_link
    from public.client_watchers_of(p_company_id) w join public.users u on u.id = w.user_id
   where w.by_email and w.user_id is distinct from p_sender and nullif(btrim(u.email), '') is not null
     and not exists (select 1 from public.email_outbox o
                      where o.user_id = u.id and o.subject = left(p_title, 200) and o.link is not distinct from p_link
                        and o.created_at > now() - interval '5 minutes');
end $$;
revoke execute on function public.notify_client_watchers(bigint, text, text, text, text, bigint[], bigint) from public, anon, authenticated;
grant execute on function public.notify_client_watchers(bigint, text, text, text, text, bigint[], bigint) to service_role;

notify pgrst, 'reload schema';
