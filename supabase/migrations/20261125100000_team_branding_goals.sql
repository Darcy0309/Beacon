-- ---------------------------------------------------------------------------
-- Lighthouse CRM — what the old system had that was still to come (Sean, Oct 2026)
--
--   public-images        a public bucket for pictures anyone signed in may see:
--                        staff photos (user/<id>/…) and client logos
--                        (company/<id>/…); each person adds their own photo,
--                        a client's people their company's logo, an
--                        administrator any
--   users                photo_path and a line about themselves (bio), for
--                        Meet the Team
--   companies            logo_path: the client's logo, shown in their workspace
--   team_directory()     Meet the Team: the active staff, with their photos;
--                        for a client, those who work their projects first
--   set_company_branding()  a client's people set their logo and website
--   projects             lead_goal and appt_goal: what the project is to
--                        deliver between its start and end dates
--   hourly_progress()    one person's day by the hour: calls, leads and
--                        appointments; with the month so far
--   calendar_notes       a note on a time of day on a project's calendar
--                        ("Hour Text" in the old system): it says something
--                        about the time, without blocking it
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

-- --- Pictures ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-images', 'public-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Whose a path is: user/<id>/… is that person's; company/<id>/… that client's people's. Administrators, any.
create or replace function public.can_write_image(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_user_id() is not null and (
    public.is_admin()
    or ((storage.foldername(p_name))[1] = 'user' and (storage.foldername(p_name))[2] = public.app_user_id()::text)
    or ((storage.foldername(p_name))[1] = 'company' and public.app_role() = 'client'
        and (storage.foldername(p_name))[2] = public.app_company_id()::text));
$$;
revoke execute on function public.can_write_image(text) from public, anon;
grant execute on function public.can_write_image(text) to authenticated;

drop policy if exists public_images_read on storage.objects;
create policy public_images_read on storage.objects for select to authenticated
  using (bucket_id = 'public-images');
drop policy if exists public_images_insert on storage.objects;
create policy public_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'public-images' and public.can_write_image(name));
drop policy if exists public_images_update on storage.objects;
create policy public_images_update on storage.objects for update to authenticated
  using (bucket_id = 'public-images' and public.can_write_image(name))
  with check (bucket_id = 'public-images' and public.can_write_image(name));
drop policy if exists public_images_delete on storage.objects;
create policy public_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'public-images' and public.can_write_image(name));

-- A photo and a line about themselves. Kept as the path in the bucket, never any address.
alter table public.users add column if not exists photo_path text;
alter table public.users add column if not exists bio text;
alter table public.users drop constraint if exists users_photo_path_check;
alter table public.users add constraint users_photo_path_check
  check (photo_path is null or photo_path ~ ('^user/' || id || '/[A-Za-z0-9._-]{1,80}$'));
alter table public.users drop constraint if exists users_bio_check;
alter table public.users add constraint users_bio_check check (bio is null or length(bio) <= 280);

alter table public.companies add column if not exists logo_path text;
alter table public.companies drop constraint if exists companies_logo_path_check;
alter table public.companies add constraint companies_logo_path_check
  check (logo_path is null or logo_path ~ ('^company/' || id || '/[A-Za-z0-9._-]{1,80}$'));

/**
 * Meet the Team: everyone on staff who is active, with their photo and a line
 * about themselves; no email or phone. For a client, `mine` marks those who
 * have worked their projects (developed a lead or set an appointment on them,
 * are assigned to them, or have names on them to call), shown first.
 */
create or replace function public.team_directory()
returns table (id bigint, name text, role text, photo_path text, bio text, mine boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select public.app_user_id() as uid, public.app_role() as role
  ), theirs as (
    select distinct x.user_id from (
      select e.user_id from public.pay_events e
       where e.project_id in (select public.client_project_ids()) and not e.is_chargeback
      union all
      select pa.ae_user_id from public.project_assignments pa
       where pa.project_id in (select public.client_project_ids())
    ) x, me
     where me.role = 'client' and x.user_id is not null
  )
  select u.id, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.role, u.photo_path, u.bio,
         u.id in (select user_id from theirs)
    from public.users u, me
   where me.uid is not null
     and u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
   order by 6 desc, u.first_name, u.last_name;
$$;
revoke execute on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;

/**
 * A client's people set their company's logo (a picture they put in the
 * bucket under company/<their company>/) and website. Either may be cleared;
 * an administrator does the same for any client from its page.
 */
create or replace function public.set_company_branding(p_logo_path text, p_website text, p_company_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company bigint := case when public.is_admin() then coalesce(p_company_id, public.app_company_id()) else public.app_company_id() end;
  v_site    text := nullif(btrim(coalesce(p_website, '')), '');
  v_logo    text := nullif(btrim(coalesce(p_logo_path, '')), '');
begin
  if public.app_user_id() is null or v_company is null or not (public.is_admin() or public.app_role() = 'client') then
    raise exception 'Only a client''s own people, or an administrator, can change its branding' using errcode = '42501';
  end if;
  if v_site is not null then
    if v_site !~* '^https?://' then
      v_site := 'https://' || v_site;
    end if;
    if length(v_site) > 200 or v_site !~* '^https?://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(/[^\s<>"]*)?$' then
      raise exception 'That website does not look right: try www.yourcompany.com' using errcode = '22023';
    end if;
  end if;
  if v_logo is not null and v_logo !~ ('^company/' || v_company || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That logo is not this client''s' using errcode = '42501';
  end if;
  update public.companies set logo_path = v_logo, website = v_site, updated_at = now() where id = v_company;
  return jsonb_build_object('company_id', v_company, 'logo_path', v_logo, 'website', v_site);
end $$;
revoke execute on function public.set_company_branding(text, text, bigint) from public, anon;
grant execute on function public.set_company_branding(text, text, bigint) to authenticated;

-- --- Project goals -------------------------------------------------------------
alter table public.projects add column if not exists lead_goal int;
alter table public.projects add column if not exists appt_goal int;
alter table public.projects drop constraint if exists projects_lead_goal_check;
alter table public.projects add constraint projects_lead_goal_check check (lead_goal is null or lead_goal between 0 and 1000000);
alter table public.projects drop constraint if exists projects_appt_goal_check;
alter table public.projects add constraint projects_appt_goal_check check (appt_goal is null or appt_goal between 0 and 1000000);

-- --- Hourly progress -------------------------------------------------------------
/**
 * One person's day by the hour (business time): calls made, leads developed
 * and appointments set, as the production report counts them; their first and
 * last call; and the month so far. Administrators and managers see anyone's,
 * agents their own.
 */
create or replace function public.hourly_progress(p_user_id bigint, p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz   text := public.business_tz();
  v_lo   timestamptz := p_day::timestamp at time zone v_tz;
  v_hi   timestamptz := (p_day + 1)::timestamp at time zone v_tz;
  v_mlo  timestamptz := date_trunc('month', p_day)::timestamp at time zone v_tz;
  v      jsonb;
begin
  if public.app_user_id() is null or not public.is_staff() then
    raise exception 'Only staff see hourly progress' using errcode = '42501';
  end if;
  if not public.is_manager() and p_user_id is distinct from public.app_user_id() then
    raise exception 'You can see your own hourly progress' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'Choose a day' using errcode = '22023';
  end if;

  with c as (
    select extract(hour from c.call_date at time zone v_tz)::int as h, c.call_date
      from public.call_records c
     where c.user_id = p_user_id and c.call_date >= v_lo and c.call_date < v_hi
  ), e as (
    select extract(hour from e.created_at at time zone v_tz)::int as h, e.kind
      from public.pay_events e
     where e.user_id = p_user_id and e.kind in ('lead', 'appointment') and not e.is_chargeback
       and e.created_at >= v_lo and e.created_at < v_hi
  ), hours as (
    select h from c union select h from e
  )
  select jsonb_build_object(
    'hours', coalesce((select jsonb_agg(jsonb_build_object(
                'hour', hours.h,
                'calls', (select count(*) from c where c.h = hours.h),
                'leads', (select count(*) from e where e.h = hours.h and e.kind = 'lead'),
                'appointments', (select count(*) from e where e.h = hours.h and e.kind = 'appointment'))
              order by hours.h) from hours), '[]'::jsonb),
    'first', (select min(call_date) from c),
    'last', (select max(call_date) from c),
    'month', jsonb_build_object(
      'calls', (select count(*) from public.call_records c2
                 where c2.user_id = p_user_id and c2.call_date >= v_mlo and c2.call_date < v_hi),
      'leads', (select count(*) from public.pay_events e2
                 where e2.user_id = p_user_id and e2.kind = 'lead' and not e2.is_chargeback and e2.created_at >= v_mlo and e2.created_at < v_hi),
      'appointments', (select count(*) from public.pay_events e2
                 where e2.user_id = p_user_id and e2.kind = 'appointment' and not e2.is_chargeback and e2.created_at >= v_mlo and e2.created_at < v_hi))
  ) into v;
  return v;
end $$;
revoke execute on function public.hourly_progress(bigint, date) from public, anon;
grant execute on function public.hourly_progress(bigint, date) to authenticated;

-- --- Notes on a calendar's times ---------------------------------------------------
create table if not exists public.calendar_notes (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects(id) on delete cascade,
  on_date     date not null,
  at_time     time not null,
  body        text not null check (length(btrim(body)) between 1 and 300),
  created_by  bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists calendar_notes_project on public.calendar_notes (project_id, on_date);

-- Kept on the calendar's own project (a DB dev project shares its appointment project's), and signed.
create or replace function public.tg_calendar_notes_place()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.project_id := coalesce(public.calendar_project(new.project_id), new.project_id);
  if current_user = 'authenticated' then
    new.created_by := public.app_user_id();
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists calendar_notes_place on public.calendar_notes;
create trigger calendar_notes_place
  before insert on public.calendar_notes
  for each row execute function public.tg_calendar_notes_place();

alter table public.calendar_notes enable row level security;
-- As blocked time: staff, and a client's people on their own projects' calendars.
drop policy if exists calendar_notes_all on public.calendar_notes;
create policy calendar_notes_all on public.calendar_notes
  for all to authenticated
  using ((select public.is_staff()) or project_id in (select public.client_project_ids()))
  with check ((select public.is_staff())
              or (project_id in (select public.client_project_ids())
                  and public.calendar_project(project_id) in (select public.client_project_ids())));
drop policy if exists mfa_required on public.calendar_notes;
create policy mfa_required on public.calendar_notes as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.calendar_notes;
create policy active_account_required on public.calendar_notes as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.calendar_notes from anon;
grant select, insert, delete on public.calendar_notes to authenticated;
grant all on public.calendar_notes to service_role;

notify pgrst, 'reload schema';
