-- ---------------------------------------------------------------------------
-- Lighthouse CRM — appointment updates on the lead for the client too, and by email (Sean, Oct 2026)
--
--   lead_client_updates(lead)   every update made to a lead's appointments,
--                               with who and when: the lead page's Appointment
--                               Updates tab, for administrators and managers and
--                               now the client's people too
--   email_outbox                emails for the app to send (and say how each
--                               went): appointment updates to the
--                               administrators and the manager who set it, and
--                               the reminders to update to the client's people
--                               and the project's agent (its Project Info)
--   update_appointment_status() and nudge_appointment_updates(): by email too
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

create table if not exists public.email_outbox (
  id          bigint generated always as identity primary key,
  kind        text not null,
  user_id     bigint references public.users(id) on delete cascade,
  email       text not null,
  subject     text not null,
  body        text not null,
  link        text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  error       text
);
create index if not exists email_outbox_unsent on public.email_outbox (created_at) where sent_at is null and error is null;
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
grant all on public.email_outbox to service_role;

-- The reminders queued before, not yet sent, go out from here.
insert into public.email_outbox (kind, user_id, email, subject, body, link, created_at)
select 'appointment_nudge', n.user_id, n.email, n.subject, n.body, n.link, n.created_at
  from public.appointment_nudges n
 where n.sent_at is null and n.error is null
   and not exists (select 1 from public.email_outbox o where o.kind = 'appointment_nudge' and o.email = n.email and o.link = n.link);
update public.appointment_nudges set error = 'Moved to email_outbox' where sent_at is null and error is null;

/**
 * Appointment Updates on a lead's page: every update made to its appointments, newest first, with who
 * made it (and whether a client), the appointment's day and time, the status and the one before,
 * the note and the premium. Staff read any lead's; a client's people, their own company's.
 */
create or replace function public.lead_client_updates(p_lead_id bigint)
returns table (id bigint, appointment_id bigint, status text, previous_status text, note text,
  potential_premium numeric, sold_lines jsonb, total_premium numeric, created_at timestamptz,
  by_name text, by_client boolean, appt_date date, appt_time text)
language sql stable security definer set search_path = public as $$
  select x.id, x.appointment_id, x.status, x.previous_status, x.note, x.potential_premium, x.sold_lines, x.total_premium, x.created_at,
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.role = 'client', a.appt_date, a.appt_time
    from public.appointment_updates x
    left join public.users u on u.id = x.created_by
    left join public.appointments a on a.id = x.appointment_id
   where x.lead_id = p_lead_id
     and public.app_user_id() is not null
     and (public.is_staff() or x.company_id = public.app_company_id())
   order by x.created_at desc, x.id desc
   limit 300;
$$;
revoke execute on function public.lead_client_updates(bigint) from public, anon;
grant execute on function public.lead_client_updates(bigint) to authenticated;

create or replace function public.update_appointment_status(p_appointment_id bigint, p_status text, p_note text default null,
  p_potential_premium numeric default null, p_sold_lines jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me      public.users;
  a         public.appointments;
  l         public.leads;
  v_company bigint;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_lines   jsonb := '[]'::jsonb;
  v_total   numeric := null;
  v_line    jsonb;
  v_prem    numeric;
  v_carrier text;
  v_prev    text;
  v_label   text;
  v_to      bigint[];
  v_id      bigint;
  v_subject text;
  v_text    text;
begin
  select * into v_me from public.users where id = public.app_user_id();
  if v_me.id is null then
    raise exception 'Sign in to update an appointment' using errcode = '42501';
  end if;
  select * into a from public.appointments where id = p_appointment_id and deleted_at is null;
  if a.id is null then
    raise exception 'That appointment is no longer there' using errcode = '22023';
  end if;
  select company_id into v_company from public.projects where id = coalesce(a.project_id, a.set_project_id);
  if not (public.is_admin()
          or (v_me.role = 'client' and coalesce(a.project_id, a.set_project_id) in (select public.client_project_ids())
              and coalesce(a.qa_status, 'passed') = 'passed')) then
    raise exception 'That appointment is not yours to update' using errcode = '42501';
  end if;
  if p_status not in ('pending_appointment', 'no_status', 'valid', 'valid_quoting', 'valid_not_quoting',
                      'quoted_not_sold', 'sold', 'invalid', 'reschedule') then
    raise exception 'Choose one of the statuses' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 2000 then
    raise exception 'Keep the note under 2,000 characters' using errcode = '22023';
  end if;
  if p_status = 'valid_quoting' and p_potential_premium is not null and (p_potential_premium < 0 or p_potential_premium > 999999999) then
    raise exception 'Enter the potential premium as an amount' using errcode = '22023';
  end if;
  if p_status = 'sold' then
    if p_sold_lines is null or jsonb_typeof(p_sold_lines) <> 'array' then
      raise exception 'Enter the premium on each policy line sold' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_sold_lines) loop
      if coalesce(v_line->>'line', '') not in ('liability', 'work_comp', 'auto', 'umbrella', 'eo', 'personal', 'health') then
        raise exception 'That is not one of the policy lines' using errcode = '22023';
      end if;
      begin
        v_prem := nullif(v_line->>'premium', '')::numeric;
      exception when others then
        raise exception 'Enter each premium as an amount' using errcode = '22023';
      end;
      continue when v_prem is null or v_prem = 0;
      if v_prem < 0 or v_prem > 999999999 then
        raise exception 'Enter each premium as an amount' using errcode = '22023';
      end if;
      v_carrier := nullif(btrim(coalesce(v_line->>'carrier', '')), '');
      if v_carrier is null then
        raise exception 'Choose the carrier each line was placed with' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('line', v_line->>'line', 'premium', round(v_prem, 2), 'carrier', left(v_carrier, 120)));
      v_total := coalesce(v_total, 0) + round(v_prem, 2);
    end loop;
    if v_total is null then
      raise exception 'Enter the premium on at least one policy line' using errcode = '22023';
    end if;
  end if;

  v_prev := public.appointment_update_status(a.client_result, a.appt_date, a.appt_time);
  update public.appointments set
    client_result = p_status,
    client_result_at = now(),
    client_result_by = v_me.id,
    quoted_premium = case when p_status = 'valid_quoting' then round(p_potential_premium, 2) else quoted_premium end,
    sold_lines = case when p_status = 'sold' then v_lines else null end,
    written_premium = case when p_status = 'sold' then v_total else null end
  where id = a.id;
  insert into public.appointment_updates (appointment_id, lead_id, project_id, company_id, status, previous_status, note,
    potential_premium, sold_lines, total_premium, created_by)
  values (a.id, a.lead_id, coalesce(a.project_id, a.set_project_id), v_company, p_status, v_prev, v_note,
    case when p_status = 'valid_quoting' then round(p_potential_premium, 2) end,
    case when p_status = 'sold' then v_lines end, v_total, v_me.id)
  returning id into v_id;

  -- The administrators, and the manager who set it, hear of it.
  select * into l from public.leads where id = a.lead_id;
  v_label := public.appointment_update_label(p_status);
  select array_agg(distinct u.id) into v_to from public.users u
   where u.status = 'active' and u.id <> v_me.id and (u.role = 'admin' or u.id = a.user_id);
  if v_to is not null then
    v_subject := left('Appointment update: ' || v_label || ' · ' || coalesce(l.company_name, 'an appointment'), 160);
    v_text := left(concat_ws(' · ',
        coalesce(nullif(btrim(concat_ws(' ', v_me.first_name, v_me.last_name)), ''), v_me.email),
        'Appointment ' || to_char(a.appt_date, 'FMMM/FMDD/YYYY'),
        case when p_status = 'valid_quoting' and p_potential_premium is not null then 'Potential premium $' || to_char(p_potential_premium, 'FM999,999,999,990.00') end,
        case when p_status = 'sold' then 'Total premium $' || to_char(v_total, 'FM999,999,999,990.00') end,
        v_note), 1000);
    perform public.notify_users(v_to, 'appointment', v_subject, v_text,
      '/leads/' || a.lead_id || '?tab=updates', null, gen_random_uuid(), v_me.id);
    -- And by email (Sean, Oct 2026): to each of them who takes alerts, for the app to send.
    insert into public.email_outbox (kind, user_id, email, subject, body, link)
    select 'appointment_update', u.id, u.email, v_subject, v_text, '/leads/' || a.lead_id || '?tab=updates'
      from public.users u
     where u.id = any(v_to) and coalesce(u.alerts_enabled, true) and nullif(btrim(u.email), '') is not null;
  end if;
  return jsonb_build_object('id', v_id, 'status', p_status, 'label', v_label, 'total', v_total);
end $$;

revoke execute on function public.update_appointment_status(bigint, text, text, numeric, jsonb) from public, anon;
grant execute on function public.update_appointment_status(bigint, text, text, numeric, jsonb) to authenticated;

create or replace function public.nudge_appointment_updates(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tz     text := public.business_tz();
  v_today  date := (p_now at time zone v_tz)::date;
  v_hour   int := extract(hour from p_now at time zone v_tz)::int;
  r        record;
  v_n      int;
  v_title  text;
  v_body   text;
  v_link   text;
  v_to     bigint[];
  v_count  int := 0;
  v_url    text;
  v_secret text;
begin
  if extract(isodow from v_today) > 5 or v_hour < 8 or v_hour >= 18 then
    return 0;
  end if;
  for r in
    select a.id, a.lead_id, a.appt_date, a.update_nudge_1_at, a.update_nudge_2_at, l.company_name, p.company_id, p.id as project_id
      from public.appointments a
      join public.leads l on l.id = a.lead_id and l.deleted_at is null
      join public.projects p on p.id = coalesce(a.project_id, a.set_project_id) and p.deleted_at is null
     where a.deleted_at is null and a.invalid_at is null and coalesce(a.qa_status, 'passed') = 'passed'
       and public.appointment_update_status(a.client_result, a.appt_date, a.appt_time) = 'no_status'
       and a.appt_date >= v_today - 30
       and (a.update_nudge_2_at is null)
       and v_today >= public.business_days_after(a.appt_date, 2)
     for update of a skip locked
  loop
    v_n := case when v_today >= public.business_days_after(r.appt_date, 4) then 2
                when r.update_nudge_1_at is null then 1 else null end;
    continue when v_n is null;
    v_link := '/appointments?update=' || r.id;
    if v_n = 1 then
      v_title := left('How did your appointment with ' || coalesce(r.company_name, 'the business') || ' go?', 160);
      v_body := 'How did your Appointment with ' || coalesce(r.company_name, 'the business') || ' work out on '
        || to_char(r.appt_date, 'FMMM/FMDD/YYYY') || '? Please update the status of the Appointment in Lighthouse so we can let our team know how they did.';
    else
      v_title := left('Reminder: update your appointment with ' || coalesce(r.company_name, 'the business'), 160);
      v_body := 'Reminder to update the status of your Appointment with ' || coalesce(r.company_name, 'the business') || ' that was on '
        || to_char(r.appt_date, 'FMMM/FMDD/YYYY') || ' by tomorrow in order to receive credit if it was invalid.';
    end if;
    select array_agg(u.id) into v_to from public.users u
     where u.company_id = r.company_id and u.role = 'client' and u.status = 'active' and u.deleted_at is null;
    if v_to is not null then
      perform public.notify_users(v_to, 'appointment', v_title, v_body, v_link, null, gen_random_uuid(), null);
    end if;
    -- By email too (Sean, Oct 2026): the client's people, and the project's agent (its Project Info), once each.
    insert into public.email_outbox (kind, user_id, email, subject, body, link)
    select distinct on (lower(btrim(x.email))) 'appointment_nudge', x.user_id, btrim(x.email), v_title, v_body, v_link
      from (
        select u.id as user_id, u.email from public.users u where u.id = any(coalesce(v_to, '{}'))
        union all
        select null, pp.agent_email from public.project_profiles pp where pp.project_id = r.project_id
      ) x
     where x.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     order by lower(btrim(x.email)), x.user_id nulls last;
    -- The 4th day's reminder stands for the 2nd too, when the first went unsent (the job was off).
    update public.appointments set update_nudge_1_at = coalesce(update_nudge_1_at, now()),
                                   update_nudge_2_at = case when v_n = 2 then now() else update_nudge_2_at end
     where id = r.id;
    v_count := v_count + 1;
  end loop;

  -- The emails go from the app: ask it, as the hourly deliveries are asked.
  if exists (select 1 from public.email_outbox where sent_at is null and error is null) then
    begin
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
      if v_url like '%/api/push/deliver' and v_secret is not null then
        perform net.http_post(
          url := replace(v_url, '/api/push/deliver', '/api/appointments/nudge'),
          body := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
          timeout_milliseconds := 60000);
      end if;
    exception when others then
      raise warning 'appointment nudges: % (%)', sqlerrm, sqlstate;
    end;
  end if;
  return v_count;
end $$;

revoke execute on function public.nudge_appointment_updates(timestamptz) from public, anon, authenticated;
grant execute on function public.nudge_appointment_updates(timestamptz) to service_role;

notify pgrst, 'reload schema';
