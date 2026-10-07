-- ---------------------------------------------------------------------------
-- Lighthouse CRM — call-back reminders
--
-- As the client asked: on a lead sheet, before moving on, an account
-- manager sets a reminder ("call him back at 2 pm"). At that time a
-- notification arrives (the bell, and the desktop pop-up or push) linking
-- straight to the lead, and the reminder shows in the lead's call history.
--
--   reminders            who, which name, when (the business's clock), a note
--   set_reminder()       for whoever may work the name (can_work_lead())
--   cancel_reminder()    one's own, not yet sent
--   deliver_reminders()  turns each reminder that is due into a notification;
--                        pg_cron runs it every minute
--   notifications.kind   'reminder' added
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['message', 'appointment', 'lead', 'feedback', 'import', 'bulletin', 'system', 'reminder']));

create table if not exists public.reminders (
  id               bigint generated always as identity primary key,
  lead_id          bigint not null references public.leads(id) on delete cascade,
  user_id          bigint not null references public.users(id) on delete cascade,
  remind_at        timestamptz not null,
  note             text check (length(note) <= 300),
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  notification_id  bigint references public.notifications(id) on delete set null
);
create index if not exists reminders_due_idx on public.reminders (remind_at) where sent_at is null;
create index if not exists reminders_lead_idx on public.reminders (lead_id, created_at desc);

alter table public.reminders enable row level security;

-- Someone's reminders are their own; an administrator sees everyone's.
drop policy if exists reminders_read on public.reminders;
create policy reminders_read on public.reminders
  for select to authenticated
  using (user_id = (select public.app_user_id()) or (select public.is_admin()));
drop policy if exists mfa_required on public.reminders;
create policy mfa_required on public.reminders as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Written only through the functions below.
revoke all on public.reminders from anon;
revoke insert, update, delete, truncate on public.reminders from authenticated;
grant select on public.reminders to authenticated;

/**
 * Remind me to call this name back: on `p_date` at `p_time` ("2:00 PM"),
 * on the business's clock, with an optional note. Only for whoever may work
 * the name, and only for a time still ahead. Returns the reminder.
 */
create or replace function public.set_reminder(p_lead_id bigint, p_date date, p_time text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_time time;
  v_at   timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  r      public.reminders;
begin
  if v_me is null or not public.can_work_lead(p_lead_id) then
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
  v_at := (p_date + v_time) at time zone public.business_tz();
  if v_at < now() - interval '1 minute' then
    raise exception 'That time has already passed' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;
  insert into public.reminders (lead_id, user_id, remind_at, note)
  values (p_lead_id, v_me, v_at, v_note)
  returning * into r;
  return jsonb_build_object('id', r.id, 'remind_at', r.remind_at);
end $$;

/** Cancel one of my reminders that has not gone off yet. */
create or replace function public.cancel_reminder(p_id bigint)
returns void
language sql security definer set search_path = public as $$
  delete from public.reminders
   where id = p_id and user_id = public.app_user_id() and sent_at is null;
$$;

/**
 * Every reminder that is due becomes a notification to its owner: "Call
 * back: <company>", the time and the note, linking to the lead. The
 * notification is pushed like any other. Run every minute by pg_cron.
 */
create or replace function public.deliver_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_id  bigint;
  n     integer := 0;
begin
  for r in
    select m.id, m.user_id, m.lead_id, m.note, m.remind_at, l.company_name
      from public.reminders m
      join public.leads l on l.id = m.lead_id
     where m.sent_at is null and m.remind_at <= now()
     order by m.remind_at
     for update of m skip locked
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      r.user_id, 'reminder',
      left('Call back: ' || coalesce(r.company_name, 'a lead'), 120),
      left(concat_ws(' · ', 'Reminder for ' || to_char(r.remind_at at time zone public.business_tz(), 'FMHH12:MI AM'), r.note), 1000),
      '/leads/' || r.lead_id
    )
    returning id into v_id;
    update public.reminders set sent_at = now(), notification_id = v_id where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.set_reminder(bigint, date, text, text) from public, anon;
revoke execute on function public.cancel_reminder(bigint) from public, anon;
revoke execute on function public.deliver_reminders() from public, anon, authenticated;
grant execute on function public.set_reminder(bigint, date, text, text) to authenticated;
grant execute on function public.cancel_reminder(bigint) to authenticated;

-- Every minute. Re-running this file replaces the job rather than adding a second.
select cron.unschedule(jobid) from cron.job where jobname = 'deliver-reminders';
select cron.schedule('deliver-reminders', '* * * * *', 'select public.deliver_reminders()');
