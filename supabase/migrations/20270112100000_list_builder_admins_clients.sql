-- List Builder for administrators and clients only (client, Nov 2026): account
-- managers (and agents, who never had the page) no longer read, make or change
-- list requests, nor make the links prospects fill in. A client still reads and
-- makes its own; a prospect's link still works (through its own function).
--
-- A request's Sales Rep is told of it only when they are an administrator: a
-- manager could not open it. The administrators are told, as before.
--
-- Safe to run again.

drop policy if exists list_requests_read on public.list_requests;
create policy list_requests_read on public.list_requests for select to authenticated
  using (public.is_admin() or (company_id is not null and company_id = public.app_company_id()));
drop policy if exists list_requests_insert on public.list_requests;
create policy list_requests_insert on public.list_requests for insert to authenticated
  with check (public.is_admin() or (source = 'client' and company_id = public.app_company_id()));
drop policy if exists list_requests_update on public.list_requests;
create policy list_requests_update on public.list_requests for update to authenticated
  using (public.is_admin() or (company_id = public.app_company_id() and status = 'new'))
  with check (public.is_admin() or (company_id = public.app_company_id() and status = 'new'));

drop policy if exists list_request_links_staff on public.list_request_links;
create policy list_request_links_staff on public.list_request_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.tg_list_requests_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_who text := coalesce(
    (select c.name from public.companies c where c.id = new.company_id),
    nullif(btrim(concat_ws(' · ', new.prospect->>'company', new.prospect->>'name')), ''),
    'A prospect');
  -- The administrators (a Sales Rep among them told with them); a manager Sales Rep is not, having no List Builder.
  v_to bigint[] := array(select u.id from public.users u where u.role = 'admin' and u.status = 'active' and u.deleted_at is null);
begin
  perform public.notify_users(
    v_to,
    'system',
    left(format('List request: %s', v_who), 160),
    concat_ws(' · ', coalesce(new.title, 'Industries and territory to target'),
      case new.source when 'prospect' then 'from a prospect''s link' when 'client' then 'from the client' else null end),
    '/list-builder/' || new.id,
    'list_request');
  return new;
end $$;
