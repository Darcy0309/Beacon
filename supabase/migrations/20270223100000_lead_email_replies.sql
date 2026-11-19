-- Email replies on the lead (Sean, Nov 2026: "the reply email is not attaching to this thread"). Each email
-- sent from a lead has a Reply-To address of its own (reply-<reply_token>@ the reply domain); Resend
-- receives the reply and tells Lighthouse (app/api/email/inbound), which keeps it here with the email it
-- answers, tells whoever sent that one, and sends them a copy.
--
--   direction        'out' an email sent from the lead; 'in' a reply to one
--   reply_token      an email sent: the token in its Reply-To address
--   from_address     a reply: who it is from ("Dana Reyes <dana@x.com>")
--   in_reply_to_id   a reply: the email it answers
--   resend_id        a reply: Resend's id for it (each kept once)
--
-- Safe to run more than once.

alter table public.lead_emails
  add column if not exists direction      text not null default 'out',
  add column if not exists reply_token    text,
  add column if not exists from_address   text,
  add column if not exists in_reply_to_id bigint references public.lead_emails(id) on delete set null,
  add column if not exists resend_id      text;

alter table public.lead_emails drop constraint if exists lead_emails_direction_check;
alter table public.lead_emails add constraint lead_emails_direction_check check (direction in ('out', 'in'));
alter table public.lead_emails drop constraint if exists lead_emails_status_check;
alter table public.lead_emails add constraint lead_emails_status_check check (status in ('sent', 'failed', 'received'));
alter table public.lead_emails drop constraint if exists lead_emails_from_address_check;
alter table public.lead_emails add constraint lead_emails_from_address_check check (length(from_address) <= 320);

create unique index if not exists lead_emails_reply_token on public.lead_emails (reply_token) where reply_token is not null;
create unique index if not exists lead_emails_resend_id on public.lead_emails (resend_id) where resend_id is not null;

notify pgrst, 'reload schema';
