-- ---------------------------------------------------------------------------
-- Lighthouse CRM — email a name's contact from its lead sheet
--
--   lead_emails      every email sent to a name's contact with the Email
--                    button beside Call now: who sent it, to which address,
--                    what it said, and whether the mail server took it.
--                    Written only by the server (the service role), after it
--                    has sent the email or failed to; staff see it on the
--                    lead sheet, as they see the calls.
--   can_work_lead()  whether the signed-in person may work a name (call it,
--                    record a result, email its contact): the same people
--                    record_call_result() lets record a result on it.
--
-- The mail server's address and login live in the server's environment
-- (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD), never in the database;
-- the From address is the 'mail' setting (Settings › Email).
-- ---------------------------------------------------------------------------

create table if not exists public.lead_emails (
  id          bigint generated always as identity primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  user_id     bigint references public.users(id) on delete set null,   -- who sent it
  to_address  text not null check (length(to_address) between 3 and 254),
  subject     text not null check (length(subject) between 1 and 200),
  body        text not null check (length(body) between 1 and 10000),
  status      text not null check (status in ('sent', 'failed')),
  error       text check (length(error) <= 500),                       -- why it was not sent
  message_id  text check (length(message_id) <= 300),                  -- the email's Message-ID, to trace it at the mail service
  created_at  timestamptz not null default now()
);

create index if not exists lead_emails_lead_idx on public.lead_emails (lead_id, created_at desc);
-- At most so many an hour per person: the server counts these before sending.
create index if not exists lead_emails_user_idx on public.lead_emails (user_id, created_at desc);

alter table public.lead_emails enable row level security;

drop policy if exists lead_emails_read on public.lead_emails;
create policy lead_emails_read on public.lead_emails
  for select to authenticated
  using ((select public.is_staff()));
drop policy if exists mfa_required on public.lead_emails;
create policy mfa_required on public.lead_emails as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.lead_emails;
create policy active_account_required on public.lead_emails as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);

-- Nobody adds, changes or removes a sent email from the app: only the server
-- writes them. New tables here are granted to nobody by default, the server's
-- own role included, so it is given what it needs: to count and to add.
revoke all on public.lead_emails from anon;
revoke insert, update, delete, truncate on public.lead_emails from authenticated;
grant select on public.lead_emails to authenticated;
grant select, insert on public.lead_emails to service_role;

/**
 * Whether the signed-in person may work this name: an administrator, or
 * staff who hold it, are on its project, or set its open appointment (they
 * confirm it). The rule record_call_result() applies, so whoever can record
 * a result on a name can email its contact. False for anyone else, for an
 * inactive account or one short of two-factor, and for a name that is gone.
 */
create or replace function public.can_work_lead(p_lead_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when public.app_role() = 'admin' then true
             when public.app_role() in ('manager', 'agent') then
                  l.assigned_user_id = public.app_user_id()
               or exists (select 1 from public.project_assignments pa
                           where pa.project_id = l.project_id and pa.ae_user_id = public.app_user_id())
               or (select a.user_id from public.appointments a
                    where a.lead_id = l.id and a.invalid_at is null
                    order by a.appt_create_date desc, a.id desc
                    limit 1) = public.app_user_id()
           end
      from public.leads l
     where l.id = p_lead_id), false);
$$;
revoke execute on function public.can_work_lead(bigint) from public, anon;
grant execute on function public.can_work_lead(bigint) to authenticated;
