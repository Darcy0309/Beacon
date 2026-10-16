-- ---------------------------------------------------------------------------
-- Lighthouse CRM — leads and appointments held in QA before they go to the
-- client (Sean, Oct 2026)
--
-- Settings › Delivery (app_settings 'delivery') says, for leads and for
-- appointments apart, whether a call that makes one emails the client
-- straight away, as before, or holds it here. Held ones go when an
-- administrator sends them from the QA page (one, some or all), or when the
-- schedule clears them (every few hours, 8 AM to 6 PM Pacific to begin with).
-- One an administrator fails stays unsent, its manager told why; once the
-- manager marks it fixed it waits again, for the next clearing or an
-- administrator. Sending an appointment passes its QA, so the client is told
-- of it in Lighthouse then too.
--
--   delivery_holds          one a lead or appointment held
--     status                held · failed · sending · sent
--   release_appointment_qa  passes a held appointment's QA as it is sent
--                           (the server's role only)
--   flush_held_deliveries   on the hour (pg_cron): asks the app to clear what
--                           is held, at the push address's sibling
--                           /api/delivery/flush with the push secret (Vault)
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_holds (
  id              bigint generated always as identity primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  call_record_id  bigint references public.call_records(id) on delete set null,
  appointment_id  bigint references public.appointments(id) on delete set null,
  kind            text not null check (kind in ('lead', 'appointment')),
  label           text check (length(label) <= 80),
  user_id         bigint references public.users(id) on delete set null,
  project_id      bigint references public.projects(id) on delete set null,
  status          text not null default 'held' check (status in ('held', 'failed', 'sending', 'sent')),
  note            text check (length(note) <= 500),
  failed_by       bigint references public.users(id) on delete set null,
  failed_at       timestamptz,
  fixed_at        timestamptz,
  sent_at         timestamptz,
  sent_by         bigint references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists delivery_holds_open on public.delivery_holds (status, created_at) where status in ('held', 'failed', 'sending');
create index if not exists delivery_holds_lead on public.delivery_holds (lead_id);

alter table public.delivery_holds enable row level security;
-- Administrators see them all; a manager, their own (the lead sheet says when one is held back).
drop policy if exists delivery_holds_read on public.delivery_holds;
create policy delivery_holds_read on public.delivery_holds
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select public.app_user_id()));
drop policy if exists mfa_required on public.delivery_holds;
create policy mfa_required on public.delivery_holds as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.delivery_holds;
create policy active_account_required on public.delivery_holds as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.delivery_holds from anon;
revoke insert, update, delete, truncate on public.delivery_holds from authenticated;
grant select on public.delivery_holds to authenticated;
grant all on public.delivery_holds to service_role;

-- A held appointment, sent: passed QA (by `p_by`, none for the schedule), and the client told in Lighthouse.
create or replace function public.release_appointment_qa(p_appointment_id bigint, p_by bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found or v_appt.qa_status is distinct from 'pending' then return; end if;
  update public.appointments set qa_status = 'passed', qa_by = p_by, qa_at = now() where id = v_appt.id;
  update public.call_records set qa_result = 'Passed', qa_date = now() where id = v_appt.call_record_id;
  perform public.notify_client_appointment(v_appt.id, v_appt.confirmed_at is not null, true);
end $$;
revoke execute on function public.release_appointment_qa(bigint, bigint) from public, anon, authenticated;
grant execute on function public.release_appointment_qa(bigint, bigint) to service_role;

-- The server tells a manager when one of theirs is held back (as review_appointment_qa does for an appointment).
grant execute on function public.notify_users(bigint[], text, text, text, text, text, uuid, bigint) to service_role;

-- On the hour: when something is held, ask the app to clear it (it sends only in a clearing hour).
create or replace function public.flush_held_deliveries()
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.delivery_holds where status = 'held') then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
  if v_url is null or v_secret is null or v_url not like '%/api/push/deliver' then return; end if;
  perform net.http_post(
    url := replace(v_url, '/api/push/deliver', '/api/delivery/flush'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'held deliveries: % (%)', sqlerrm, sqlstate;
end $$;
revoke execute on function public.flush_held_deliveries() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'flush-held-deliveries') then
    perform cron.unschedule('flush-held-deliveries');
  end if;
  perform cron.schedule('flush-held-deliveries', '0 * * * *', 'select public.flush_held_deliveries()');
end $$;

notify pgrst, 'reload schema';
