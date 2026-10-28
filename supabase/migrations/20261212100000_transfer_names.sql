-- Giving a lead to another client, and moving names between projects
-- (Sean, Oct 2026). Before, a lead a client couldn't use was typed over a
-- spare record on another client's list, and names were moved by exporting
-- them and importing them again.
--
--   transfer_lead(lead, project, into)  one lead to another client's Appt
--     project: a copy of it there as Lead-No Contact (or, `into`, a record of
--     the same business already on that list, put back on it), the client
--     notes of the original in its internal notes; the original marked
--     Lead-Removed (Removed for a DB dev name). No pay: a transferred lead is
--     not a new lead.
--   move_names(ids, project, result)    many names to another project of the
--     same kind: copies there with the result chosen, shared out evenly among
--     its reps; the originals marked Removed / Lead-Removed, so the first
--     client's reports stay as they were. A name whose phone is already on
--     that project is left where it is (counted).
--
-- Administrators and account managers. Safe to run more than once.

/** Ten digits of a phone, to tell the same business by: "(480) 555-0142" and "480.555.0142" are one. */
create or replace function public.phone_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

/** A copy of a name on another project: its details, coverage and notes. The new record's id. */
create or replace function public.copy_name(p_lead bigint, p_project bigint, p_result bigint, p_rep bigint, p_note text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id   bigint;
  v_type text := public.project_type_code(p_project);
begin
  insert into public.leads (
    project_id, result_id, assigned_user_id, status_id, call_weight, promoted_at,
    agency_id, dbdv_user_id, company_name, contact_name, contact_title, decision_maker, phone, email, website, address, city,
    state, zip, county, territory, sic_code, description, list_source, producer_name, broker, employees, covered_employees,
    autos, sales_volume, years_in_business, estimated_annual_premium, reason_to_change, dec_sheet_received, location,
    lead_date, import_date, shopping_date, fax, dm_title, professionals, source_project_id, original_xdate, contact_mobile,
    dm_phone, dm_mobile, dm_email, contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email, ein,
    location_ownership, building_age, building_stories, building_acres, employees_full_time, employees_part_time,
    subcontractors_pct, auto_types, travel_radius, annual_payroll, dot_number, cargo, claims_3yrs, drivers, xmod)
  select
    p_project, p_result, p_rep,
    coalesce((select s.id from public.lead_statuses s join public.call_results r on r.status_code = s.code where r.id = p_result), l.status_id),
    0, case when v_type = 'APPT' then now() end,
    agency_id, dbdv_user_id, company_name, contact_name, contact_title, decision_maker, phone, email, website, address, city,
    state, zip, county, territory, sic_code, description, list_source, producer_name, broker, employees, covered_employees,
    autos, sales_volume, years_in_business, estimated_annual_premium, reason_to_change, dec_sheet_received, location,
    lead_date, import_date, shopping_date, fax, dm_title, professionals, source_project_id, original_xdate, contact_mobile,
    dm_phone, dm_mobile, dm_email, contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email, ein,
    location_ownership, building_age, building_stories, building_acres, employees_full_time, employees_part_time,
    subcontractors_pct, auto_types, travel_radius, annual_payroll, dot_number, cargo, claims_3yrs, drivers, xmod
    from public.leads l where l.id = p_lead
  returning id into v_id;

  -- Its coverage and X-dates (the latest sheet of them).
  insert into public.insurance_details (
    lead_id, agency_name, ultimate_xdate, pkg_xdate, pkg_carrier, wc_xdate, wc_carrier, auto_xdate, auto_carrier, health_xdate,
    health_carrier, dental_xdate, dental_provider, vision_xdate, vision_provider, prof_liab_xdate, prof_liab_carrier, do_xdate,
    do_carrier, eo_xdate, eo_carrier, homeowner_xdate, homeowner_carrier, personal_auto_xdate, personal_auto_carrier,
    inception_401k, participants_401k, covered_employees, autos, personal_lines_xdate, personal_lines_carrier, agency_years)
  select v_id, agency_name, ultimate_xdate, pkg_xdate, pkg_carrier, wc_xdate, wc_carrier, auto_xdate, auto_carrier, health_xdate,
    health_carrier, dental_xdate, dental_provider, vision_xdate, vision_provider, prof_liab_xdate, prof_liab_carrier, do_xdate,
    do_carrier, eo_xdate, eo_carrier, homeowner_xdate, homeowner_carrier, personal_auto_xdate, personal_auto_carrier,
    inception_401k, participants_401k, covered_employees, autos, personal_lines_xdate, personal_lines_carrier, agency_years
    from public.insurance_details where lead_id = p_lead order by id desc limit 1;

  -- Its internal notes: where it came from, the original's own, and the client notes it had (to write
  -- the new client's afresh, in the client notes box).
  insert into public.lead_notes (lead_id, notes)
  select v_id, concat_ws(E'\n\n', p_note, nullif(btrim(n.notes), ''),
                         case when nullif(btrim(l.client_note), '') is not null then 'Client notes from that record:' || E'\n' || btrim(l.client_note) end)
    from public.leads l left join public.lead_notes n on n.lead_id = l.id
   where l.id = p_lead;
  return v_id;
end $$;
revoke execute on function public.copy_name(bigint, bigint, bigint, bigint, text) from public, anon, authenticated;

/** A line added to a name's internal notes. */
create or replace function public.add_name_note(p_lead bigint, p_line text)
returns void
language sql security definer set search_path = public as $$
  insert into public.lead_notes (lead_id, notes) values (p_lead, p_line)
  on conflict (lead_id) do update
    set notes = case when nullif(btrim(public.lead_notes.notes), '') is null then excluded.notes
                     else rtrim(public.lead_notes.notes) || E'\n' || excluded.notes end;
$$;
revoke execute on function public.add_name_note(bigint, text) from public, anon, authenticated;

/** The note stamp the note boxes write ("10/27/26 seanf:"). */
create or replace function public.note_stamp() returns text
language sql stable set search_path = public as $$
  select to_char((now() at time zone public.business_tz())::date, 'FMMM/FMDD/YY') || ' ' ||
         lower(regexp_replace(coalesce(nullif(u.username, ''), coalesce(u.first_name, '') || left(coalesce(u.last_name, ''), 1), 'me'), '\s+', '', 'g')) || ':'
    from public.users u where u.id = public.app_user_id()
$$;

/** "Client · Project", to name a project in a note. */
create or replace function public.project_label(p_project bigint) returns text
language sql stable set search_path = public as $$
  select concat_ws(' · ', nullif(btrim(c.name), ''), p.name) from public.projects p left join public.companies c on c.id = p.company_id where p.id = p_project
$$;

/** The rep on a project to give a name to: the one who asked, when they are on it; else whoever has fewest names to call. */
create or replace function public.rep_for_name(p_project bigint) returns bigint
language sql stable set search_path = public as $$
  select coalesce(
    (select pa.ae_user_id from public.project_assignments pa where pa.project_id = p_project and pa.ae_user_id = public.app_user_id()),
    (select pa.ae_user_id from public.project_assignments pa join public.users u on u.id = pa.ae_user_id and u.status = 'active'
      where pa.project_id = p_project
      order by (select count(*) from public.leads l join public.call_results r on r.id = l.result_id
                 where l.project_id = p_project and l.assigned_user_id = pa.ae_user_id and l.deleted_at is null and r.viable and r.callable),
               pa.ae_user_id
      limit 1))
$$;

create or replace function public.transfer_lead(p_lead bigint, p_project bigint, p_into bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lead    public.leads;
  v_into    public.leads;
  v_target  public.projects;
  v_new     bigint;
  v_contact bigint := public.call_result_from_text('APPT', 'Lead-No Contact');
  v_stamp   text := public.note_stamp();
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can transfer a lead' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead and deleted_at is null for update;
  if not found then
    raise exception 'That lead no longer exists' using errcode = 'P0002';
  end if;
  select * into v_target from public.projects where id = p_project and deleted_at is null;
  if not found or public.project_type_code(p_project) is distinct from 'APPT' then
    raise exception 'Choose an appointment project to give the lead to' using errcode = '22023';
  end if;
  if v_target.status_id is distinct from (select id from public.project_statuses where name = 'Active') then
    raise exception 'That project is not active' using errcode = '22023';
  end if;
  if p_project = v_lead.project_id then
    raise exception 'The lead is already on that project' using errcode = '22023';
  end if;

  if p_into is not null then
    -- The same business already on that client's list: put back on it.
    select * into v_into from public.leads where id = p_into and project_id = p_project and deleted_at is null for update;
    if not found then
      raise exception 'That record is no longer on that project' using errcode = 'P0002';
    end if;
    update public.leads
       set result_id = v_contact, resolved_at = null,
           assigned_user_id = coalesce(case when assigned_user_id in (select ae_user_id from public.project_assignments where project_id = p_project)
                                            then assigned_user_id end, public.rep_for_name(p_project))
     where id = p_into;
    perform public.add_name_note(p_into, concat_ws(E'\n', v_stamp || ' Transferred here from ' || public.project_label(v_lead.project_id) || '.',
      case when nullif(btrim(v_lead.client_note), '') is not null then 'Client notes from that record:' || E'\n' || btrim(v_lead.client_note) end));
    v_new := p_into;
  else
    if exists (select 1 from public.leads where project_id = p_project and deleted_at is null
                and public.phone_key(phone) is not null and public.phone_key(phone) = public.phone_key(v_lead.phone)) then
      raise exception 'That business is already on that project''s list: choose it from the matches' using errcode = '23505';
    end if;
    v_new := public.copy_name(p_lead, p_project, v_contact, public.rep_for_name(p_project),
      v_stamp || ' Transferred here from ' || public.project_label(v_lead.project_id) || '.');
  end if;

  update public.leads
     set result_id = public.call_result_from_text(case v_lead.stage when 'appt' then 'APPT' else 'DBDV' end,
                                                  case v_lead.stage when 'appt' then 'Lead-Removed' else 'Removed' end),
         resolved_at = now()
   where id = p_lead;
  perform public.add_name_note(p_lead, v_stamp || ' Transferred to ' || public.project_label(p_project) || '.');
  return jsonb_build_object('id', v_new, 'project_id', p_project, 'from', p_lead, 'existing', p_into is not null);
end $$;
revoke execute on function public.transfer_lead(bigint, bigint, bigint) from public, anon;
grant execute on function public.transfer_lead(bigint, bigint, bigint) to authenticated;

create or replace function public.move_names(p_ids bigint[], p_project bigint, p_result bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_type    text := public.project_type_code(p_project);
  v_target  public.projects;
  v_result  public.call_results;
  v_removed bigint;
  v_stamp   text := public.note_stamp();
  v_label   text := public.project_label(p_project);
  l         public.leads;
  v_moved   int := 0;
  v_skipped int := 0;
  v_have    text[];
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can move names' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Choose the names to move' using errcode = '22023';
  end if;
  if array_length(p_ids, 1) > 5000 then
    raise exception 'Move up to 5,000 names at a time' using errcode = '22023';
  end if;
  select * into v_target from public.projects where id = p_project and deleted_at is null;
  if not found then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;
  if v_target.status_id is distinct from (select id from public.project_statuses where name = 'Active') then
    raise exception 'That project is not active' using errcode = '22023';
  end if;
  select * into v_result from public.call_results where id = p_result;
  if not found or v_result.project_type is distinct from v_type or v_result.applies_to is distinct from 'name' then
    raise exception 'Choose a call result of that project''s kind' using errcode = '22023';
  end if;
  v_removed := public.call_result_from_text(v_type, case v_type when 'APPT' then 'Lead-Removed' else 'Removed' end);

  -- The phones already on that project: a name there already isn't put there twice.
  select coalesce(array_agg(distinct public.phone_key(phone)) filter (where public.phone_key(phone) is not null), '{}') into v_have
    from public.leads where project_id = p_project and deleted_at is null;

  for l in select * from public.leads where id = any(p_ids) and deleted_at is null order by id for update loop
    if l.project_id = p_project then
      continue;
    end if;
    if public.project_type_code(l.project_id) is distinct from v_type then
      raise exception '% is on a different kind of project: move viable names to a DB dev project, leads to an appointment project', l.company_name
        using errcode = '22023';
    end if;
    if public.phone_key(l.phone) is not null and public.phone_key(l.phone) = any(v_have) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public.copy_name(l.id, p_project, p_result, null, v_stamp || ' Moved here from ' || public.project_label(l.project_id) || '.');
    update public.leads set result_id = v_removed, resolved_at = now() where id = l.id;
    perform public.add_name_note(l.id, v_stamp || ' Moved to ' || v_label || '.');
    if public.phone_key(l.phone) is not null then
      v_have := v_have || public.phone_key(l.phone);
    end if;
    v_moved := v_moved + 1;
  end loop;

  -- Shared out evenly among that project's reps, as an import is.
  if v_moved > 0 then
    perform public.distribute_names(p_project);
  end if;
  return jsonb_build_object('moved', v_moved, 'skipped', v_skipped, 'project_id', p_project);
end $$;
revoke execute on function public.move_names(bigint[], bigint, bigint) from public, anon;
grant execute on function public.move_names(bigint[], bigint, bigint) to authenticated;

/**
 * The same business on another active client's appointment list, for a
 * transfer: the same phone, or the same name in the same ZIP or city.
 */
create or replace function public.transfer_matches(p_lead bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lead public.leads;
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can transfer a lead' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead and deleted_at is null;
  if not found then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'company', m.company_name, 'city', m.city, 'state', m.state, 'phone', m.phone,
                                        'project_id', m.project_id, 'project', public.project_label(m.project_id), 'result', r.name,
                                        'by', case when public.phone_key(m.phone) = public.phone_key(v_lead.phone) then 'phone' else 'name' end)
                     order by public.project_label(m.project_id), m.id)
      from (select * from public.leads x
             where x.deleted_at is null and x.id <> v_lead.id and x.project_id is distinct from v_lead.project_id
               and ((public.phone_key(v_lead.phone) is not null and public.phone_key(x.phone) = public.phone_key(v_lead.phone))
                 or (lower(btrim(x.company_name)) = lower(btrim(v_lead.company_name))
                     and (left(btrim(x.zip), 5) = left(btrim(v_lead.zip), 5) or lower(btrim(x.city)) = lower(btrim(v_lead.city)))))
             limit 50) m
      join public.projects p on p.id = m.project_id and p.deleted_at is null
                            and p.status_id = (select id from public.project_statuses where name = 'Active')
      join public.call_results r on r.id = m.result_id
     where public.project_type_code(m.project_id) = 'APPT'), '[]'::jsonb);
end $$;
revoke execute on function public.transfer_matches(bigint) from public, anon;
grant execute on function public.transfer_matches(bigint) to authenticated;

/** Every active project of a kind, to give names to: its name, its client's, and the office ZIP and city (the project's, else its client's). */
create or replace function public.transfer_projects(p_type text default 'APPT')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can transfer a lead' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'client', c.name,
                                        'zip', left(btrim(coalesce(nullif(btrim(p.zip), ''), c.zip)), 5),
                                        'city', coalesce(nullif(btrim(p.city), ''), c.city), 'state', coalesce(nullif(btrim(p.state), ''), c.state))
                     order by c.name, p.name)
      from public.projects p left join public.companies c on c.id = p.company_id
     where p.deleted_at is null and public.project_type_code(p.id) = p_type
       and p.status_id = (select id from public.project_statuses where name = 'Active')), '[]'::jsonb);
end $$;
revoke execute on function public.transfer_projects(text) from public, anon;
grant execute on function public.transfer_projects(text) to authenticated;

-- Finding a business on other lists by its phone, quickly.
create index if not exists leads_phone_key on public.leads (public.phone_key(phone)) where deleted_at is null;
