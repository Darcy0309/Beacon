-- Reminders on the person's own clock (client, Nov 2026: a manager in California set a call-back
-- for 4:30 PM at 4:06 PM and was told it had passed: the time was read on the business's clock,
-- Arizona's, an hour ahead).
--
-- A reminder keeps the time zone it was set in (the browser's, e.g. America/Los_Angeles):
-- the time chosen is read there, the notification says the time there, and moving it keeps it
-- there. Without one (older reminders, the appointment confirmation reminders), the business's.
-- A lead sent to someone with a time to call is read on the sender's clock the same way.
--
-- Safe to run again.

alter table public.reminders add column if not exists time_zone text;
comment on column public.reminders.time_zone is 'The clock the reminder was set on (IANA, the browser''s); null: the business''s.';

-- A time zone's name when Postgres knows it, else null.
create or replace function public.known_tz(p_tz text)
returns text
language plpgsql stable set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_tz, '')), '') is null or length(p_tz) > 64 then
    return null;
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return null;
end $$;
grant execute on function public.known_tz(text) to authenticated;

drop function if exists public.set_reminder(bigint, date, text, text);
create or replace function public.set_reminder(p_lead_id bigint, p_date date, p_time text, p_note text default null, p_tz text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_tz   text := coalesce(public.known_tz(p_tz), public.business_tz());
  v_time time;
  v_at   timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  r      public.reminders;
begin
  if v_me is null or not (public.can_work_lead(p_lead_id)
       or (public.app_role() = 'client' and exists (select 1 from public.leads l where l.id = p_lead_id and l.deleted_at is null
             and (l.project_id in (select public.client_project_ids()) or l.source_project_id in (select public.client_project_ids()))))) then
    raise exception 'This name is not on your call list' using errcode = '42501';
  end if;
  begin
    v_time := to_timestamp(upper(btrim(p_time)), 'HH12:MI AM')::time;
  exception when others then
    raise exception 'Choose a time like 2:00 PM' using errcode = '22023';
  end;
  if p_date is null or v_time is null then
    raise exception 'Choose the day and time to be reminded' using errcode = '22023';
  end if;
  v_at := (p_date + v_time) at time zone v_tz;
  if v_at < now() - interval '1 minute' then
    raise exception 'That time has already passed' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;
  insert into public.reminders (lead_id, user_id, remind_at, note, time_zone)
  values (p_lead_id, v_me, v_at, v_note, public.known_tz(p_tz))
  returning * into r;
  return jsonb_build_object('id', r.id, 'remind_at', r.remind_at);
end $$;
revoke execute on function public.set_reminder(bigint, date, text, text, text) from public, anon;
grant execute on function public.set_reminder(bigint, date, text, text, text) to authenticated;

-- Moved on the dashboard: the new day and time on the reminder's own clock.
create or replace function public.move_reminder(p_id bigint, p_date date, p_time text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
  r    public.reminders;
begin
  if p_date is null then
    raise exception 'Choose the day to be reminded' using errcode = '22023';
  end if;
  select * into r from public.reminders where id = p_id and user_id = public.app_user_id() for update;
  if r.id is null then
    raise exception 'This is not one of your reminders' using errcode = '42501';
  end if;
  v_at := (p_date + public.parse_clock_time(p_time)) at time zone coalesce(public.known_tz(r.time_zone), public.business_tz());
  if v_at < now() - interval '1 minute' then
    raise exception 'That time has already passed' using errcode = '22023';
  end if;
  if r.sent_at is not null then
    raise exception 'This reminder has already gone off' using errcode = '22023';
  end if;
  update public.reminders set remind_at = v_at where id = r.id returning * into r;
  return jsonb_build_object('id', r.id, 'remind_at', r.remind_at);
end $$;

-- "Reminder for 4:30 PM": on the reminder's own clock.
create or replace function public.deliver_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_id  bigint;
  n     integer := 0;
begin
  for r in
    select m.id, m.user_id, m.lead_id, m.note, m.remind_at, m.appointment_id, l.company_name, u.role,
           coalesce(public.known_tz(m.time_zone), public.business_tz()) as tz
      from public.reminders m
      join public.leads l on l.id = m.lead_id and l.deleted_at is null
      left join public.users u on u.id = m.user_id
     where m.sent_at is null and m.remind_at <= now()
     order by m.remind_at
     for update of m skip locked
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      r.user_id, 'reminder',
      left(case when r.appointment_id is not null then 'Confirm tomorrow''s appointment: '
                when r.role = 'client' then 'Reminder: ' else 'Call back: ' end
           || coalesce(r.company_name, 'a lead'), 120),
      left(case when r.appointment_id is not null then coalesce(r.note, '')
                else concat_ws(' · ', 'Reminder for ' || to_char(r.remind_at at time zone r.tz, 'FMHH12:MI AM'), r.note) end, 1000),
      '/leads/' || r.lead_id
    )
    returning id into v_id;
    update public.reminders set sent_at = now(), notification_id = v_id where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.deliver_reminders() from public, anon, authenticated;

-- A lead sent with a time to call: the time on the sender's clock (p_tz), kept with the reminder.
drop function if exists public.send_lead(bigint, bigint, text, date, text, boolean);
create or replace function public.send_lead(p_lead bigint, p_to bigint, p_note text default null, p_date date default null, p_time text default null, p_assign boolean default true, p_tz text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_lead public.leads;
  v_to   public.users;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_own  text := public.known_tz(p_tz);
  v_tz   text := coalesce(public.known_tz(p_tz), public.business_tz());
  v_time time;
  v_at   timestamptz;
begin
  if v_me is null or public.app_role() not in ('admin', 'manager') then
    raise exception 'Only administrators and managers send a lead to someone' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead and deleted_at is null;
  if v_lead.id is null then
    raise exception 'That lead is no longer there' using errcode = 'P0002';
  end if;
  select * into v_to from public.users
   where id = p_to and status = 'active' and deleted_at is null and role in ('admin', 'manager', 'agent');
  if v_to.id is null then
    raise exception 'Choose someone on the team to send it to' using errcode = '22023';
  end if;
  if v_to.id = v_me then
    raise exception 'Choose someone other than yourself' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters' using errcode = '22023';
  end if;
  -- A time to call, on the sender's clock, as a call-back reminder reads one.
  if p_date is not null or nullif(btrim(coalesce(p_time, '')), '') is not null then
    begin
      v_time := to_timestamp(upper(btrim(p_time)), 'HH12:MI AM')::time;
    exception when others then
      raise exception 'Choose a time like 2:00 PM' using errcode = '22023';
    end;
    if p_date is null or v_time is null then
      raise exception 'Choose both the day and the time to call' using errcode = '22023';
    end if;
    v_at := (p_date + v_time) at time zone v_tz;
    if v_at < now() - interval '1 minute' then
      raise exception 'That time has already passed' using errcode = '22023';
    end if;
  end if;

  if p_assign and v_lead.assigned_user_id is distinct from v_to.id then
    perform set_config('lighthouse.quiet_assign', 'on', true);
    update public.leads set assigned_user_id = v_to.id where id = v_lead.id;
    perform set_config('lighthouse.quiet_assign', 'off', true);
  end if;
  if v_at is not null then
    insert into public.reminders (lead_id, user_id, remind_at, note, time_zone)
    values (v_lead.id, v_to.id, v_at, left(coalesce(v_note, 'Sent by ' || coalesce(public.actor_name(), 'a manager')), 300), v_own);
  end if;
  perform public.notify_users(
    array[v_to.id], 'lead',
    left('Lead to call: ' || coalesce(v_lead.company_name, 'a lead'), 160),
    left(concat_ws(' · ',
      'From ' || coalesce(public.actor_name(), 'a manager'),
      case when p_assign then 'It is yours to work' end,
      case when v_at is not null then 'Call ' || to_char(v_at at time zone v_tz, 'Dy MM/DD/YYYY FMHH12:MI AM') end,
      v_note), 1000),
    '/leads/' || v_lead.id,
    'lead_assigned');
  return jsonb_build_object('lead', v_lead.id, 'to', v_to.id, 'assigned', p_assign, 'remind_at', v_at);
end $$;
revoke execute on function public.send_lead(bigint, bigint, text, date, text, boolean, text) from public, anon;
grant execute on function public.send_lead(bigint, bigint, text, date, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
