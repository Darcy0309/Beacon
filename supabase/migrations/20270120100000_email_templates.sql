-- Email templates (client, Nov 2026: "pre-defined templates they can chose from that will fill in
-- the body of the email and subject line ... Admins can create the different email templates and
-- attachments and they can be available to pick from when managers send emails").
--
--   email_templates   a name, a subject and a message (with {first_name}, {company} and {my_name}
--                     filled in when picked), and the files that go with it: kept in the private
--                     email-templates bucket under template/<id>/, listed in `attachments`
--                     ([{ path, name, size, type }]). Administrators keep them; the staff who
--                     email leads (administrators, managers, agents) pick from the active ones.
--   lead_emails       each email now says which template it came from and the files it carried.
--
-- The server attaches the files when it sends (its own role reads them), so a sender can only
-- send a template's own files, never a path of their choosing.
--
-- Safe to run again.

create table if not exists public.email_templates (
  id          bigint generated always as identity primary key,
  name        text not null check (length(btrim(name)) between 1 and 80),
  subject     text not null default '' check (length(subject) <= 200),
  body        text not null default '' check (length(body) <= 10000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  active      boolean not null default true,
  created_by  bigint references public.users(id) on delete set null,
  updated_by  bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists email_templates_name on public.email_templates (lower(btrim(name)));

alter table public.email_templates enable row level security;
drop policy if exists email_templates_read on public.email_templates;
create policy email_templates_read on public.email_templates for select to authenticated
  using (public.is_admin() or (public.is_staff() and active));
drop policy if exists email_templates_write on public.email_templates;
create policy email_templates_write on public.email_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.email_templates to authenticated;

alter table public.lead_emails
  add column if not exists template_id bigint references public.email_templates(id) on delete set null,
  add column if not exists attachments text[] not null default '{}';

-- The templates' files: up to 10 MB each, the kinds a prospect can open.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-templates', 'email-templates', false, 10485760,
        array['application/pdf', 'image/*', 'text/plain', 'text/csv',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists email_templates_files_write on storage.objects;
create policy email_templates_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'email-templates' and (storage.foldername(name))[1] = 'template' and public.is_admin());
drop policy if exists email_templates_files_delete on storage.objects;
create policy email_templates_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'email-templates' and public.is_admin());
drop policy if exists email_templates_files_read on storage.objects;
create policy email_templates_files_read on storage.objects for select to authenticated
  using (bucket_id = 'email-templates' and public.is_staff());
