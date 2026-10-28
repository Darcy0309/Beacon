-- Each client's removal list (Oct 2026): the names a client doesn't want,
-- kept for the lists they pull later, so a new list comes in already
-- cleaned of them and the client doesn't scrub the same names again.
--
--   client_removals            one row per business taken off, for a client
--                              (companies.id), with why:
--                                deletion          the client doesn't want it, or
--                                                  a duplicate left off an import
--                                dont_call         do not call
--                                current_customer  already the client's customer
--   call_results.client_removal  the results that put a name on the list:
--                              Removed / Lead-Removed (deletion), DoNotCall /
--                              Lead-DoNotCall, Client / Lead-CurrentClient.
--                              However the result is given (a call, Result
--                              Change, the client's own marking, an import of
--                              an old list), the trigger remembers it; a name
--                              given another result is forgotten again.
--   mark_names(ids, reason, note)  a client's people (or staff) taking names
--                              off: the result for the reason, a note on each.
--
-- A name marked Removed because it was moved to another project of the same
-- client (move_names) is not a removal: it is still being called there.
--
-- Leads already on those results are put on their client's list once, here.
-- Safe to run more than once.

alter table public.call_results add column if not exists client_removal text
  check (client_removal in ('deletion', 'dont_call', 'current_customer'));
update public.call_results set client_removal = case
    when name in ('Removed', 'Lead-Removed') then 'deletion'
    when name in ('DoNotCall', 'Lead-DoNotCall') then 'dont_call'
    when name in ('Client', 'Lead-CurrentClient') then 'current_customer'
  end
 where applies_to = 'name' and name in ('Removed', 'Lead-Removed', 'DoNotCall', 'Lead-DoNotCall', 'Client', 'Lead-CurrentClient');

create table if not exists public.client_removals (
  id            bigint generated always as identity primary key,
  company_id    bigint not null references public.companies(id) on delete cascade,
  reason        text not null check (reason in ('deletion', 'dont_call', 'current_customer')),
  -- lead: a name on one of the client's lists given the result; import: a duplicate left off a list.
  source        text not null default 'lead' check (source in ('lead', 'import')),
  lead_id       bigint references public.leads(id) on delete set null,
  -- The business as it was, to know it again on a new list.
  company_name  text not null,
  contact_name  text,
  phone         text,
  ein           text,
  address       text,
  city          text,
  state         text,
  zip           text,
  note          text,
  removed_by    bigint references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists client_removals_lead on public.client_removals (lead_id) where lead_id is not null;
create index if not exists client_removals_company on public.client_removals (company_id, created_at desc);

alter table public.client_removals enable row level security;
-- Staff read every client's list; a client's people read their own.
drop policy if exists client_removals_read on public.client_removals;
create policy client_removals_read on public.client_removals for select
  using ((select public.is_staff()) or company_id = (select public.app_company_id()));
-- Administrators add duplicates left off an import, and take names off a list.
drop policy if exists client_removals_admin on public.client_removals;
create policy client_removals_admin on public.client_removals for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.client_removals to authenticated;

-- An import says what it left off.
alter table public.import_batches add column if not exists duplicate_count int not null default 0;
alter table public.import_batches add column if not exists removed_count int not null default 0;

/**
 * Whether a lead given a Deletion result was only moved: the same business
 * (phone) still being called on another project of the same client.
 */
create or replace function public.moved_within_client(p_lead public.leads, p_company bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.phone_key(p_lead.phone) is not null and exists (
    select 1
      from public.leads x
      join public.projects p on p.id = x.project_id and p.deleted_at is null
      join public.call_results r on r.id = x.result_id
     where public.phone_key(x.phone) = public.phone_key(p_lead.phone)
       and x.deleted_at is null and x.id <> p_lead.id and x.project_id is distinct from p_lead.project_id
       and p.company_id = p_company and r.viable)
$$;
revoke execute on function public.moved_within_client(public.leads, bigint) from public, anon, authenticated;

/** A lead's result put it on (or took it off) its client's removal list. */
create or replace function public.remember_removal()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason  text;
  v_company bigint;
begin
  if tg_op = 'UPDATE' and new.result_id is not distinct from old.result_id and new.project_id is not distinct from old.project_id then
    return null;
  end if;
  select client_removal into v_reason from public.call_results where id = new.result_id;
  select company_id into v_company from public.projects where id = new.project_id;
  if v_reason is null or v_company is null or new.company_name is null
     or (v_reason = 'deletion' and public.moved_within_client(new, v_company)) then
    -- Given another result (a mistake put right): no longer a removal.
    if tg_op = 'UPDATE' then
      delete from public.client_removals where lead_id = new.id and source = 'lead';
    end if;
    return null;
  end if;
  insert into public.client_removals (company_id, reason, source, lead_id, company_name, contact_name, phone, ein, address, city, state, zip, removed_by)
  values (v_company, v_reason, 'lead', new.id, new.company_name, new.contact_name, new.phone, new.ein, new.address, new.city, new.state, new.zip,
          public.app_user_id())
  on conflict (lead_id) where lead_id is not null do update
    set company_id = excluded.company_id, reason = excluded.reason, company_name = excluded.company_name,
        contact_name = excluded.contact_name, phone = excluded.phone, ein = excluded.ein, address = excluded.address,
        city = excluded.city, state = excluded.state, zip = excluded.zip,
        removed_by = coalesce(excluded.removed_by, public.client_removals.removed_by), created_at = now();
  return null;
end $$;
revoke execute on function public.remember_removal() from public, anon, authenticated;

drop trigger if exists remember_removal on public.leads;
create trigger remember_removal after insert or update of result_id, project_id on public.leads
  for each row execute function public.remember_removal();

/**
 * Names taken off a client's lists, with why: a client's people for their
 * own projects' names (they can't record calls), staff for any. Each takes
 * the result for the reason on its kind of project; a note on each says who
 * and why, and the note given is kept on the list. Names with an appointment
 * or made a lead (promoted) are left as they are and counted: those go
 * through the people who set them.
 */
create or replace function public.mark_names(p_ids bigint[], p_reason text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := public.app_role();
  v_company bigint := public.app_company_id();
  v_me      bigint := public.app_user_id();
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_label   text := case p_reason when 'deletion' then 'Deletion' when 'dont_call' then 'Don''t call' else 'Current customer' end;
  v_stamp   text := public.note_stamp();
  v_by      text;
  r         public.call_results;
  l         record;
  v_marked  int := 0;
  v_kept    int := 0;
begin
  if v_me is null or v_role not in ('admin', 'manager', 'client') then
    raise exception 'Only a client''s people, administrators and account managers can take names off' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('deletion', 'dont_call', 'current_customer') then
    raise exception 'Choose why these names come off' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Choose the names to take off' using errcode = '22023';
  end if;
  if array_length(p_ids, 1) > 5000 then
    raise exception 'Take off up to 5,000 names at a time' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), email) into v_by from public.users where id = v_me;

  for l in
    select x.id, x.project_id, x.result_id, p.company_id, public.project_type_code(x.project_id) as kind, cr.effect
      from public.leads x
      join public.projects p on p.id = x.project_id
      join public.call_results cr on cr.id = x.result_id
     where x.id = any(p_ids) and x.deleted_at is null
     order by x.id
       for update of x
  loop
    if v_role = 'client' and l.company_id is distinct from v_company then
      raise exception 'Those names are not on your lists' using errcode = '42501';
    end if;
    if l.effect not in ('none', 'pending') then
      v_kept := v_kept + 1;
      continue;
    end if;
    select * into r from public.call_results
     where project_type = l.kind and applies_to = 'name' and client_removal = p_reason
     order by sort_order limit 1;
    if not found then
      raise exception 'No call result to mark these names with' using errcode = 'P0002';
    end if;
    if l.result_id is distinct from r.id then
      update public.leads
         set result_id = r.id,
             status_id = coalesce((select s.id from public.lead_statuses s where s.code = r.status_code), status_id),
             resolved_at = coalesce(resolved_at, now())
       where id = l.id;
    end if;
    perform public.add_name_note(l.id, v_stamp || ' Taken off the list by ' || coalesce(v_by, 'the client') || ': ' || v_label
                                      || coalesce(' (' || v_note || ')', '') || '.');
    update public.client_removals
       set reason = p_reason, note = coalesce(v_note, note), removed_by = v_me
     where lead_id = l.id;
    v_marked := v_marked + 1;
  end loop;
  return jsonb_build_object('marked', v_marked, 'kept', v_kept, 'reason', v_label);
end $$;
revoke execute on function public.mark_names(bigint[], text, text) from public, anon;
grant execute on function public.mark_names(bigint[], text, text) to authenticated;

-- The names already on those results, onto their client's list (Sean's client, Oct 2026: "Perfect!").
insert into public.client_removals (company_id, reason, source, lead_id, company_name, contact_name, phone, ein, address, city, state, zip, created_at)
select p.company_id, r.client_removal, 'lead', l.id, l.company_name, l.contact_name, l.phone, l.ein, l.address, l.city, l.state, l.zip,
       coalesce(l.resolved_at, l.updated_at, now())
  from public.leads l
  join public.projects p on p.id = l.project_id
  join public.call_results r on r.id = l.result_id
 where r.client_removal is not null and p.company_id is not null and l.company_name is not null and l.deleted_at is null
   and not (r.client_removal = 'deletion' and public.moved_within_client(l, p.company_id))
on conflict (lead_id) where lead_id is not null do nothing;
