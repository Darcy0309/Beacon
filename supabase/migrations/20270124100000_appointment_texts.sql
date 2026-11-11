-- Appointment reminder texts (client, Nov 2026): the day before an appointment, at the hour set in
-- Settings (10:00 AM by default, on the clock chosen there), the prospect is texted a reminder from
-- the template set there, on the projects that have it turned on (some clients confirm their own
-- appointments). A reply of Y, N or R tells the appointment's manager (app/api/twilio/sms); they
-- mark it confirmed, or call the prospect, as they always have.
--
--   projects.appt_texts          the project's appointments get the reminder (off unless turned on;
--                                a renewed project keeps its predecessor's)
--   app_settings 'appt_texts'    { body, hour, zone }: the template, and when (lib/appointment-texts.js)
--   appointment_texts            one for each appointment reminded: queued here, sent by the app
--                                (app/api/appointments/texts), and the prospect's Y/N/R reply
--
-- queue_appointment_texts() runs every five minutes (pg_cron): once it is the hour, it queues the
-- next day's appointments and asks the app to send them (pg_net, with the push secret, as the
-- appointment update reminders are sent).
--
-- Safe to run more than once.

alter table public.projects add column if not exists appt_texts boolean not null default false;

-- A renewed project texts as the one it renews did (renew_project() copies the rest).
create or replace function public.projects_keep_appt_texts()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.renewed_from_id is not null and not new.appt_texts then
    new.appt_texts := coalesce((select p.appt_texts from public.projects p where p.id = new.renewed_from_id), false);
  end if;
  return new;
end $$;
drop trigger if exists projects_keep_appt_texts on public.projects;
create trigger projects_keep_appt_texts before insert on public.projects
  for each row execute function public.projects_keep_appt_texts();

alter table public.lead_texts add column if not exists appointment_id bigint references public.appointments(id) on delete set null;

create table if not exists public.appointment_texts (
  appointment_id bigint primary key references public.appointments(id) on delete cascade,
  lead_id        bigint not null references public.leads(id) on delete cascade,
  queued_at      timestamptz not null default now(),
  claimed_at     timestamptz,
  sent_at        timestamptz,
  text_id        bigint references public.lead_texts(id) on delete set null,
  error          text,
  reply          text check (reply in ('Y', 'N', 'R')),
  replied_at     timestamptz
);
create index if not exists appointment_texts_lead_idx on public.appointment_texts (lead_id, sent_at);

alter table public.appointment_texts enable row level security;
revoke all on public.appointment_texts from anon, authenticated;
grant select on public.appointment_texts to authenticated;
grant all on public.appointment_texts to service_role;

drop policy if exists appointment_texts_read on public.appointment_texts;
create policy appointment_texts_read on public.appointment_texts
  for select to authenticated
  using ((select public.is_staff()));
drop policy if exists mfa_required on public.appointment_texts;
create policy mfa_required on public.appointment_texts as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.appointment_texts;
create policy active_account_required on public.appointment_texts as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

/**
 * Queue the reminders due (p_now: for the tests): once it is the hour set in Settings on its clock,
 * every appointment the next day on that clock, on a project with reminders on, still to happen
 * (not cancelled, held, a no-show or invalid; not failed by QA), and not reminded yet. Then asks
 * the app to send whatever is waiting. Returns how many were queued.
 */
create or replace function public.queue_appointment_texts(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_set   jsonb := coalesce((select value from public.app_settings where key = 'appt_texts'), '{}'::jsonb);
  v_zone  text := coalesce(public.known_tz(v_set->>'zone'), public.business_tz());
  v_hour  integer := case when (v_set->>'hour') ~ '^\d{1,2}$' and (v_set->>'hour')::integer between 0 and 23 then (v_set->>'hour')::integer else 10 end;
  v_local timestamp := p_now at time zone v_zone;
  v_count integer := 0;
  v_url    text;
  v_secret text;
begin
  if extract(hour from v_local) >= v_hour then
    insert into public.appointment_texts (appointment_id, lead_id)
    select a.id, a.lead_id
      from public.appointments a
      join public.leads l on l.id = a.lead_id and l.deleted_at is null
      left join public.appointment_statuses s on s.id = a.status_id
     where a.appt_date = v_local::date + 1
       and a.deleted_at is null and a.invalid_at is null
       and coalesce(a.qa_status, 'passed') <> 'failed'
       and coalesce(s.name, 'Scheduled') not in ('Cancelled', 'Held', 'No Show', 'Invalid')
       and exists (select 1 from public.projects p
                    where p.id in (a.project_id, a.set_project_id) and p.deleted_at is null and p.appt_texts)
    on conflict (appointment_id) do nothing;
    get diagnostics v_count = row_count;
  end if;

  -- The texts go from the app: ask it, as the appointment update reminders' emails are asked for.
  if exists (select 1 from public.appointment_texts where sent_at is null and claimed_at is null and error is null) then
    begin
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
      if v_url like '%/api/push/deliver' and v_secret is not null then
        perform net.http_post(
          url := replace(v_url, '/api/push/deliver', '/api/appointments/texts'),
          body := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
          timeout_milliseconds := 60000);
      end if;
    exception when others then
      raise warning 'appointment texts: % (%)', sqlerrm, sqlstate;
    end;
  end if;
  return v_count;
end $$;
revoke execute on function public.queue_appointment_texts(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_appointment_texts(timestamptz) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not enabled: appointment reminder texts are not sent on a schedule';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'appointment-texts') then
    perform cron.unschedule('appointment-texts');
  end if;
  perform cron.schedule('appointment-texts', '*/5 * * * *', 'select public.queue_appointment_texts()');
end $$;

notify pgrst, 'reload schema';
