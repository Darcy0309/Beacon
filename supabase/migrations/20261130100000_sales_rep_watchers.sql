-- ---------------------------------------------------------------------------
-- Lighthouse CRM — a client's Sales Rep, and who hears about the client (Sean, Oct 2026)
--
--   companies.sales_rep_id    the administrator or manager who owns the client
--                             (and so all its projects)
--   client_watchers           who gets the notifications about a client and its
--                             projects, each by notification alone or by email
--                             too; with nobody chosen, its Sales Rep (notification)
--   client_watchers_of(company)              the people, as above
--   notify_client_watchers(company, …)       tell them (and queue the emails)
--   appointments set, the client's appointment updates (update_appointment_status),
--   client feedback and files the client adds: their watchers are told too
--   email_outbox             an insert asks the app to send at once (through
--                            pg_net, as push notifications are), not on the hour
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

alter table public.companies add column if not exists sales_rep_id bigint references public.users(id) on delete set null;
create index if not exists companies_sales_rep on public.companies (sales_rep_id);

create table if not exists public.client_watchers (
  company_id  bigint not null references public.companies(id) on delete cascade,
  user_id     bigint not null references public.users(id) on delete cascade,
  by_email    boolean not null default false,
  primary key (company_id, user_id)
);
alter table public.client_watchers enable row level security;
drop policy if exists client_watchers_read on public.client_watchers;
create policy client_watchers_read on public.client_watchers for select to authenticated using ((select public.is_staff()));
drop policy if exists client_watchers_write on public.client_watchers;
create policy client_watchers_write on public.client_watchers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mfa_required on public.client_watchers;
create policy mfa_required on public.client_watchers as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.client_watchers;
create policy active_account_required on public.client_watchers as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.client_watchers from anon;
grant select, insert, update, delete on public.client_watchers to authenticated;
grant all on public.client_watchers to service_role;

/** Who hears about a client: those chosen (active), or with nobody chosen its Sales Rep, by notification. */
create or replace function public.client_watchers_of(p_company_id bigint)
returns table (user_id bigint, by_email boolean)
language sql stable security definer set search_path = public as $$
  with chosen as (
    select w.user_id, w.by_email from public.client_watchers w
      join public.users u on u.id = w.user_id and u.status = 'active' and u.deleted_at is null
     where w.company_id = p_company_id
  )
  select * from chosen
  union all
  select c.sales_rep_id, false from public.companies c
    join public.users u on u.id = c.sales_rep_id and u.status = 'active' and u.deleted_at is null
   where c.id = p_company_id and not exists (select 1 from chosen);
$$;
revoke execute on function public.client_watchers_of(bigint) from public, anon, authenticated;
grant execute on function public.client_watchers_of(bigint) to service_role;

/**
 * Tell a client's watchers: a notification to each not in `p_already` (told already by the event's
 * own rules), and an email to each who takes them by email.
 */
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
  insert into public.email_outbox (kind, user_id, email, subject, body, link)
  select 'client_' || p_kind, u.id, u.email, left(p_title, 200), left(coalesce(p_body, ''), 2000), p_link
    from public.client_watchers_of(p_company_id) w join public.users u on u.id = w.user_id
   where w.by_email and w.user_id is distinct from p_sender and nullif(btrim(u.email), '') is not null;
end $$;
revoke execute on function public.notify_client_watchers(bigint, text, text, text, text, bigint[], bigint) from public, anon, authenticated;
grant execute on function public.notify_client_watchers(bigint, text, text, text, text, bigint[], bigint) to service_role;

-- --- Appointments set: the client's watchers too ---------------------------------------
create or replace function public.tg_notify_appointments()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_to bigint[];
  v_title text;
  v_body text;
  v_link text;
begin
  for r in
    select p.company_id,
           min(co.name) as company,
           count(*) as n,
           min(a.appt_date) as first_date,
           max(a.appt_date) as last_date,
           array_agg(distinct p.id) filter (where p.id is not null) as project_ids,
           array_agg(distinct l.assigned_user_id) filter (where l.assigned_user_id is not null) as reps,
           (array_agg(l.company_name order by a.appt_date, a.id))[1] as lead_name,
           (array_agg(a.appt_time order by a.appt_date, a.id))[1] as first_time,
           (array_agg(a.id order by a.appt_date, a.id))[1] as first_id,
           bool_or(coalesce(a.qa_status, 'passed') = 'passed') as client_may_know
      from new_rows a
      left join public.leads l     on l.id  = a.lead_id
      left join public.projects p  on p.id  = l.project_id
      left join public.companies co on co.id = p.company_id
     group by p.company_id
  loop
    v_to := array(
      select id from public.users where role = 'admin'
      union
      select pa.ae_user_id from public.project_assignments pa
       where pa.project_id = any(r.project_ids) and pa.ae_user_id is not null
      union
      select u.id from public.users u
       where r.client_may_know and u.role = 'client' and r.company_id is not null and u.company_id = r.company_id
      union
      select unnest(r.reps)
    );
    v_title := case when r.n = 1 then 'Appointment set: ' || coalesce(r.lead_name, 'a lead')
                    else r.n || ' appointments set' || coalesce(' for ' || r.company, '') end;
    v_body := case when r.n = 1
                   then concat_ws(' · ', to_char(r.first_date, 'Dy Mon FMDD') || coalesce(' at ' || r.first_time, ''), r.company, 'set by ' || public.actor_name())
                   else concat_ws(' · ', to_char(r.first_date, 'Mon FMDD') || ' – ' || to_char(r.last_date, 'Mon FMDD'), 'set by ' || public.actor_name()) end;
    v_link := '/calendar?view=' || case when r.n = 1 then 'day' else 'month' end
        || '&d=' || coalesce(r.first_date, current_date)::text
        || case when r.n = 1 then '&a=' || r.first_id else '' end;
    perform public.notify_users(v_to, 'appointment', v_title, v_body, v_link, 'appt_created');
    -- The client's watchers (Sales Rep, or those chosen; Sean, Oct 2026), by email too when they asked.
    perform public.notify_client_watchers(r.company_id, 'appointment', v_title, v_body, v_link, v_to);
  end loop;
  return null;
end $$;

-- --- Client feedback: the client's watchers too -------------------------------------------
create or replace function public.tg_notify_feedback()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company text;
  v_company_id bigint;
  v_admins bigint[] := array(select id from public.users where role = 'admin');
  v_title text;
  v_body text;
begin
  select co.name, co.id into v_company, v_company_id
    from public.leads l
    join public.projects p   on p.id  = l.project_id
    join public.companies co on co.id = p.company_id
   where l.id = new.lead_id;
  v_title := 'New client feedback' || coalesce(' from ' || v_company, '');
  v_body := concat_ws(' · ', case when new.rating is not null then repeat('★', new.rating) || repeat('☆', 5 - new.rating) end, left(new.content, 140));
  perform public.notify_users(v_admins, 'feedback', v_title, v_body, '/feedback', 'feedback_new');
  perform public.notify_client_watchers(v_company_id, 'feedback', v_title, v_body, '/feedback', v_admins);
  return null;
end $$;

-- --- Files the client adds: the client's watchers too ---------------------------------------
create or replace function public.tg_documents_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l       public.leads;
  a       public.appointments;
  v_role  text;
  v_to    bigint[];
  v_company bigint;
begin
  if new.lead_id is null then
    return null;
  end if;
  select * into l from public.leads where id = new.lead_id;
  select * into a from public.appointments
   where lead_id = new.lead_id and invalid_at is null and deleted_at is null
   order by appt_create_date desc, id desc limit 1;
  select role into v_role from public.users where id = new.uploaded_by;

  if v_role = 'client' then
    v_to := array_remove(array[l.assigned_user_id, a.user_id], null);
    perform public.notify_users(v_to, 'lead',
      left('Policy file added: ' || coalesce(l.company_name, 'a lead'), 160),
      left(new.name || ' · from ' || coalesce(public.actor_name(), 'the client'), 1000),
      '/leads/' || l.id || '?tab=files', null);
    select company_id into v_company from public.projects where id = l.project_id;
    perform public.notify_client_watchers(v_company, 'lead',
      left('Policy file added: ' || coalesce(l.company_name, 'a lead'), 160),
      left(new.name || ' · from ' || coalesce(public.actor_name(), 'the client'), 1000),
      '/leads/' || l.id || '?tab=files', v_to, new.uploaded_by);
  elsif a.id is not null and coalesce(a.qa_status, 'passed') = 'passed' then
    select array_agg(u.id) into v_to from public.users u join public.projects p on p.company_id = u.company_id
     where p.id = l.project_id and u.role = 'client' and u.status = 'active' and u.deleted_at is null;
    perform public.notify_users(coalesce(v_to, '{}'), 'appointment',
      left('Policy file added: ' || coalesce(l.company_name, 'an appointment'), 160),
      left(new.name || ' · for the appointment on ' || to_char(a.appt_date, 'Dy MM/DD/YYYY') || coalesce(' ' || a.appt_time, ''), 1000),
      '/calendar?view=day&d=' || a.appt_date || '&a=' || a.id, null);
  end if;
  return null;
end $$;

-- --- The client's appointment updates: its watchers too ---------------------------------------
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
  -- The client's watchers (its Sales Rep, or those chosen; Sean, Oct 2026), by email too when they asked.
  perform public.notify_client_watchers(v_company,  'appointment',
    left('Appointment update: ' || v_label || ' · ' || coalesce(l.company_name, 'an appointment'), 160),
    coalesce(v_text, ''), '/leads/' || a.lead_id || '?tab=updates', coalesce(v_to, '{}'), v_me.id);
  return jsonb_build_object('id', v_id, 'status', p_status, 'label', v_label, 'total', v_total);
end $$;
revoke execute on function public.update_appointment_status(bigint, text, text, numeric, jsonb) from public, anon;
grant execute on function public.update_appointment_status(bigint, text, text, numeric, jsonb) to authenticated;

-- --- Emails go at once ---------------------------------------------------------------------
-- Whatever queues an email asks the app to send it now (the same call the hourly job makes).
create or replace function public.tg_email_outbox_send()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
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
  return null;
exception when others then
  raise warning 'email outbox: % (%)', sqlerrm, sqlstate;
  return null;
end $$;
revoke execute on function public.tg_email_outbox_send() from public, anon, authenticated;
drop trigger if exists email_outbox_send on public.email_outbox;
create trigger email_outbox_send after insert on public.email_outbox
  for each statement execute function public.tg_email_outbox_send();

notify pgrst, 'reload schema';
