-- ---------------------------------------------------------------------------
-- Lighthouse CRM — Meet the Team, more than a gallery (Oct 2026)
--
--   users.birthday           month and day (the year is not kept: stored in 2000)
--   team_directory()         each member with what they do (lead development,
--                            appointment setting), since when, whether they are
--                            on the phones now, active today or away, their
--                            thank-yous, today's birthday and its gifts, and for
--                            a client what they developed for them (counts only)
--   team_member_recent(id)   the latest leads and appointments they developed
--                            (for a client: on its projects), to open
--   team_spotlight()         this week's top: appointments, leads and calls
--   message_team_member()    a note to a member, as a message they can answer
--                            (a client: to those who work its projects)
--   kudos                    thank-yous and birthday gifts: who, to whom, the
--                            gift and a note; the member hears of each
--   send_kudos()             send one
--   app_settings 'team'      { spotlight: false } hides the spotlight
--
-- Safe to run again.
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists birthday date;
alter table public.users drop constraint if exists users_birthday_check;
alter table public.users add constraint users_birthday_check check (birthday is null or extract(year from birthday) = 2000);

/** Whether a birthday (month and day) falls on `p_day`; a 29 February one on the 28th in other years. */
create or replace function public.birthday_on(p_birthday date, p_day date)
returns boolean
language sql immutable set search_path = public as $$
  select p_birthday is not null and (
    (extract(month from p_birthday), extract(day from p_birthday)) = (extract(month from p_day), extract(day from p_day))
    or (extract(month from p_birthday) = 2 and extract(day from p_birthday) = 29 and extract(month from p_day) = 2 and extract(day from p_day) = 28
        and extract(day from (date_trunc('year', p_day) + interval '1 month 28 days')::date) <> 29));
$$;
grant execute on function public.birthday_on(date, date) to authenticated, service_role;

-- --- Thank-yous and gifts ---------------------------------------------------------
create table if not exists public.kudos (
  id          bigint generated always as identity primary key,
  to_user     bigint not null references public.users(id) on delete cascade,
  from_user   bigint references public.users(id) on delete set null,
  kind        text not null check (kind in ('thanks', 'birthday')),
  gift        text check (gift in ('flowers', 'cake', 'balloons', 'coffee', 'chocolates', 'present', 'pizza', 'trophy', 'party')),
  note        text check (length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists kudos_to on public.kudos (to_user, created_at desc);
alter table public.kudos enable row level security;
drop policy if exists kudos_read on public.kudos;
create policy kudos_read on public.kudos for select to authenticated
  using (to_user = (select public.app_user_id()) or from_user = (select public.app_user_id()) or (select public.is_admin()));
drop policy if exists mfa_required on public.kudos;
create policy mfa_required on public.kudos as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists active_account_required on public.kudos;
create policy active_account_required on public.kudos as restrictive for all to authenticated
  using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null);
revoke all on public.kudos from anon;
revoke insert, update, delete, truncate on public.kudos from authenticated;
grant select on public.kudos to authenticated;
grant all on public.kudos to service_role;

-- Who a client works with: the staff who developed or set something on its projects, or are assigned to them.
create or replace function public.works_with_client(p_user_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pay_events e where e.user_id = p_user_id and not e.is_chargeback
                    and e.project_id in (select public.client_project_ids()))
      or exists (select 1 from public.project_assignments pa where pa.ae_user_id = p_user_id
                    and pa.project_id in (select public.client_project_ids()));
$$;
revoke execute on function public.works_with_client(bigint) from public, anon;
grant execute on function public.works_with_client(bigint) to authenticated;

drop function if exists public.team_directory();
/**
 * Meet the Team: everyone on staff who is active. For each: their photo, line and role; what they
 * do (lead development, appointment setting or both, by the projects they work); since when; their
 * status (on the phones: a call in the last 15 minutes; active today: a call or a sign-in today;
 * else away) and their last call today; the thank-yous they have had; whether today is their
 * birthday, and the gifts it has brought. For a client, `mine` (they work its projects, shown first)
 * and the leads and appointments they developed for it this month and in all; for staff, this
 * month's across the business. Never pay, email or phone.
 */
create function public.team_directory()
returns table (id bigint, name text, role text, photo_path text, bio text, mine boolean, does text,
  since date, status text, last_call timestamptz, kudos bigint, birthday_today boolean, gifts_today bigint,
  leads_month bigint, appts_month bigint, leads_total bigint, appts_total bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select public.app_user_id() as uid, public.app_role() as role, public.business_tz() as tz
  ), day as (
    select (now() at time zone me.tz)::date as today, date_trunc('month', now() at time zone me.tz) as month_start, me.tz from me
  ), staff as (
    select u.* from public.users u, me
     where me.uid is not null and u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
  ), theirs as (
    select p.id from public.projects p, me where me.role = 'client' and p.id in (select public.client_project_ids())
  ), kinds as (
    select pa.ae_user_id as uid, bool_or(t.code = 'DBDV') as dbdv, bool_or(t.code = 'APPT') as appt
      from public.project_assignments pa join public.projects p on p.id = pa.project_id and p.deleted_at is null
      join public.project_types t on t.id = p.project_type_id
     group by 1
  ), calls as (
    select c.user_id, max(c.call_date) as last_call from public.call_records c, day
     where c.call_date >= (day.today::timestamp at time zone day.tz) group by 1
  ), dev as (
    select e.user_id,
           count(*) filter (where e.kind = 'lead' and e.created_at >= (day.month_start at time zone day.tz)) as leads_month,
           count(*) filter (where e.kind = 'appointment' and e.created_at >= (day.month_start at time zone day.tz)) as appts_month,
           count(*) filter (where e.kind = 'lead') as leads_total,
           count(*) filter (where e.kind = 'appointment') as appts_total
      from public.pay_events e, day, me
     where e.kind in ('lead', 'appointment') and not e.is_chargeback
       and (me.role <> 'client' or e.project_id in (select id from theirs))
       and (me.role = 'client' or e.created_at >= (day.month_start at time zone day.tz))
     group by 1
  ), k as (
    select to_user, count(*) filter (where kind = 'thanks') as thanks,
           count(*) filter (where kind = 'birthday' and created_at >= (day.today::timestamp at time zone day.tz)) as gifts_today
      from public.kudos, day group by 1
  )
  select s.id, nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.role, s.photo_path, s.bio,
         (me.role = 'client' and public.works_with_client(s.id)),
         case when s.role = 'admin' then 'Administration'
              when kd.dbdv and kd.appt then 'Lead development & appointment setting'
              when kd.appt then 'Appointment setting' when kd.dbdv then 'Lead development' end,
         s.created_at::date,
         case when c.last_call > now() - interval '15 minutes' then 'calling'
              when c.last_call is not null or (s.last_login at time zone day.tz)::date = day.today then 'active'
              else 'away' end,
         c.last_call, coalesce(k.thanks, 0), public.birthday_on(s.birthday, day.today), coalesce(k.gifts_today, 0),
         coalesce(d.leads_month, 0), coalesce(d.appts_month, 0),
         case when me.role = 'client' then coalesce(d.leads_total, 0) end,
         case when me.role = 'client' then coalesce(d.appts_total, 0) end
    from staff s cross join me cross join day
    left join kinds kd on kd.uid = s.id
    left join calls c on c.user_id = s.id
    left join dev d on d.user_id = s.id
    left join k on k.to_user = s.id
   order by 6 desc, 12 desc, s.first_name, s.last_name;
$$;
revoke execute on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;

/** The latest leads and appointments a member developed (for a client: on its projects), newest first. */
create or replace function public.team_member_recent(p_user_id bigint, p_limit int default 5)
returns table (lead_id bigint, company text, kind text, at timestamptz, project text)
language sql stable security definer set search_path = public as $$
  select l.id, l.company_name, e.kind, e.created_at, p.name
    from public.pay_events e
    join public.leads l on l.id = e.lead_id and l.deleted_at is null
    join public.projects p on p.id = e.project_id
   where public.app_user_id() is not null
     and e.user_id = p_user_id and e.kind in ('lead', 'appointment') and not e.is_chargeback
     and (public.is_staff() or e.project_id in (select public.client_project_ids()))
   order by e.created_at desc
   limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;
revoke execute on function public.team_member_recent(bigint, int) from public, anon;
grant execute on function public.team_member_recent(bigint, int) to authenticated;

/**
 * This week's spotlight (Monday on, business time): who set the most appointments, developed the
 * most leads and made the most calls. Null when an administrator has turned it off.
 */
create or replace function public.team_spotlight()
returns jsonb
language sql stable security definer set search_path = public as $$
  with z as (
    select public.business_tz() as tz,
           (date_trunc('week', now() at time zone public.business_tz()))::timestamp at time zone public.business_tz() as since
  ), people as (
    select u.id, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.photo_path
      from public.users u where u.role in ('admin', 'manager', 'agent') and u.status = 'active' and u.deleted_at is null
  ), ev as (
    select e.user_id, count(*) filter (where e.kind = 'appointment') as appts, count(*) filter (where e.kind = 'lead') as leads
      from public.pay_events e, z where e.created_at >= z.since and not e.is_chargeback and e.kind in ('lead', 'appointment')
     group by 1
  ), ca as (
    select c.user_id, count(*) as calls from public.call_records c, z where c.call_date >= z.since group by 1
  ), top as (
    select 'appointments' as what, p.id, p.name, p.photo_path, ev.appts as n from ev join people p on p.id = ev.user_id where ev.appts > 0
    union all
    select 'leads', p.id, p.name, p.photo_path, ev.leads from ev join people p on p.id = ev.user_id where ev.leads > 0
    union all
    select 'calls', p.id, p.name, p.photo_path, ca.calls from ca join people p on p.id = ca.user_id where ca.calls > 0
  ), best as (
    select distinct on (what) what, id, name, photo_path, n from top order by what, n desc, name
  )
  select case when coalesce((select (value->>'spotlight')::boolean from public.app_settings where key = 'team'), true) is false then null
              when public.app_user_id() is null then null
              else coalesce((select jsonb_object_agg(what, jsonb_build_object('id', id, 'name', name, 'photo', photo_path, 'count', n)) from best), '{}'::jsonb) end;
$$;
revoke execute on function public.team_spotlight() from public, anon;
grant execute on function public.team_spotlight() to authenticated;

/**
 * A note to a member of the team, as a message in their notifications they can answer. A client
 * may write to those who work its projects; staff to anyone on the team. Five a minute at most.
 */
create or replace function public.message_team_member(p_to bigint, p_body text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me    public.users;
  v_body  text := btrim(coalesce(p_body, ''));
begin
  select * into v_me from public.users where id = public.app_user_id();
  if v_me.id is null then
    raise exception 'Sign in to send a message' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'Write your message first' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep a message under 1,000 characters' using errcode = '22023';
  end if;
  if p_to = v_me.id or not exists (select 1 from public.users u where u.id = p_to and u.status = 'active' and u.deleted_at is null
                                      and u.role in ('admin', 'manager', 'agent')) then
    raise exception 'That person is not on the team' using errcode = '22023';
  end if;
  if v_me.role = 'client' and not public.works_with_client(p_to) then
    raise exception 'You can message the people who work your projects' using errcode = '42501';
  end if;
  if (select count(*) from public.notifications where sender_id = v_me.id and kind = 'message' and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'You are sending messages too quickly. Wait a moment and try again.' using errcode = '22023';
  end if;
  return public.notify_users(array[p_to], 'message',
    left('Message from ' || coalesce(nullif(btrim(concat_ws(' ', v_me.first_name, v_me.last_name)), ''), v_me.email)
         || case when v_me.role = 'client' then coalesce(': ' || (select c.name from public.companies c where c.id = v_me.company_id), '') else '' end, 160),
    v_body, '/team', null, gen_random_uuid(), v_me.id);
end $$;
revoke execute on function public.message_team_member(bigint, text) from public, anon;
grant execute on function public.message_team_member(bigint, text) to authenticated;

/**
 * A thank-you (or, on their birthday, a gift) for a member of the team, with a note: kept, and
 * the member told. A gift only on their birthday; one thank-you a day from each person to each.
 */
create or replace function public.send_kudos(p_to bigint, p_kind text, p_gift text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    public.users;
  v_to    public.users;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_name  text;
  v_gift  text;
  v_id    bigint;
  v_today date := (now() at time zone public.business_tz())::date;
begin
  select * into v_me from public.users where id = public.app_user_id();
  select * into v_to from public.users where id = p_to and status = 'active' and deleted_at is null and role in ('admin', 'manager', 'agent');
  if v_me.id is null then
    raise exception 'Sign in to send that' using errcode = '42501';
  end if;
  if v_to.id is null or v_to.id = v_me.id then
    raise exception 'That person is not on the team' using errcode = '22023';
  end if;
  if p_kind not in ('thanks', 'birthday') then
    raise exception 'Send a thank-you or a gift' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;
  if p_kind = 'birthday' then
    if not public.birthday_on(v_to.birthday, v_today) then
      raise exception 'Gifts are for their birthday' using errcode = '22023';
    end if;
    if p_gift not in ('flowers', 'cake', 'balloons', 'coffee', 'chocolates', 'present', 'pizza', 'trophy', 'party') then
      raise exception 'Choose a gift' using errcode = '22023';
    end if;
  elsif exists (select 1 from public.kudos where from_user = v_me.id and to_user = v_to.id and kind = 'thanks'
                   and created_at >= (v_today::timestamp at time zone public.business_tz())) then
    raise exception 'You have thanked them today already' using errcode = '22023';
  end if;
  insert into public.kudos (to_user, from_user, kind, gift, note)
  values (v_to.id, v_me.id, p_kind, case when p_kind = 'birthday' then p_gift end, v_note)
  returning id into v_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_me.first_name, v_me.last_name)), ''), v_me.email)
    || case when v_me.role = 'client' then coalesce(' (' || (select c.name from public.companies c where c.id = v_me.company_id) || ')', '') else '' end;
  v_gift := case p_gift when 'flowers' then '💐 Flowers' when 'cake' then '🎂 A birthday cake' when 'balloons' then '🎈 Balloons'
    when 'coffee' then '☕ A coffee' when 'chocolates' then '🍫 Chocolates' when 'present' then '🎁 A present'
    when 'pizza' then '🍕 A pizza party' when 'trophy' then '🏆 A trophy' when 'party' then '🎉 A party' end;
  perform public.notify_users(array[v_to.id], 'message',
    left(case when p_kind = 'birthday' then v_gift || ' from ' || v_name || ': happy birthday!'
              else '🙌 ' || v_name || ' says thank you' end, 160),
    coalesce(v_note, case when p_kind = 'birthday' then 'Happy birthday!' else 'Thank you for your work.' end),
    '/team', null, gen_random_uuid(), v_me.id);
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.send_kudos(bigint, text, text, text) from public, anon;
grant execute on function public.send_kudos(bigint, text, text, text) to authenticated;

notify pgrst, 'reload schema';
