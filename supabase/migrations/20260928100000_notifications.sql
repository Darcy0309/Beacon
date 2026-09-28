-- ---------------------------------------------------------------------------
-- Lighthouse CRM — in-app notifications
--
-- Staff across two offices and at home are reached by email today, and nobody
-- can tell whether a message was seen. This gives every user an inbox behind
-- the bell in the top bar:
--
--   * Events raise notifications on their own — an appointment set, leads
--     assigned, an import finished, client feedback, an announcement posted.
--     Each follows its switch on the Alert Engine page, and every one that
--     fires is written to the alert log.
--   * Administrators and account managers can message people or whole roles
--     directly, and see who has read it.
--
-- New rows are published to Supabase Realtime, so the bell updates and pops
-- up the moment something arrives. Row Level Security keeps each inbox to
-- its owner; Realtime applies the same policies.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users(id) on delete cascade,  -- recipient
  sender_id   bigint references public.users(id) on delete set null,          -- who caused it
  batch_id    uuid,                                                           -- one direct message sent to many
  kind        text not null default 'message'
              check (kind in ('message','appointment','lead','feedback','import','bulletin','system')),
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_inbox  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread on public.notifications (user_id) where read_at is null;
create index if not exists notifications_batch  on public.notifications (batch_id) where batch_id is not null;
create index if not exists notifications_sender on public.notifications (sender_id, created_at desc) where batch_id is not null;

alter table public.notifications enable row level security;

-- Your own inbox, plus the direct messages you sent (for read receipts).
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (user_id = public.app_user_id()
         or (batch_id is not null and sender_id = public.app_user_id()));

-- Recipients may mark their own notifications read — and change nothing else.
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- Rows are only ever created by the functions below, never inserted directly.
revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- The two rules the old engine never had.
insert into public.alert_rules (name, trigger, channel, recipients, enabled)
select v.name, v.trigger, 'inapp', null, true
  from (values ('Lead assigned to you', 'lead_assigned'),
               ('Announcement posted',  'bulletin_posted')) as v(name, trigger)
 where not exists (select 1 from public.alert_rules r where r.trigger = v.trigger);

-- ---------------------------------------------------------------------------
-- Delivery. Internal: only the triggers and send_notification() call this.
-- Skips a rule that has been switched off, skips inactive accounts, never
-- notifies the person who caused the event, and logs what it sent.
-- ---------------------------------------------------------------------------
create or replace function public.notify_users(
  p_recipients bigint[],
  p_kind       text,
  p_title      text,
  p_body       text,
  p_link       text,
  p_rule       text default null,
  p_batch      uuid default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_rule_id bigint;
  v_enabled boolean;
  v_actor   bigint := public.app_user_id();
  v_count   int;
begin
  if p_rule is not null then
    select id, enabled into v_rule_id, v_enabled
      from public.alert_rules where trigger = p_rule order by id limit 1;
    if v_rule_id is not null and not v_enabled then
      return 0;
    end if;
  end if;

  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, link)
  select u.id, v_actor, p_batch, p_kind, left(p_title, 160), left(p_body, 1000), p_link
    from public.users u
   where u.id = any(p_recipients)
     and u.status = 'active'
     and u.id is distinct from v_actor;
  get diagnostics v_count = row_count;

  if v_count > 0 and v_rule_id is not null then
    insert into public.alert_log (rule_id, subject, detail, status)
    values (v_rule_id, left(p_title, 200),
            format('In-app to %s %s', v_count, case when v_count = 1 then 'person' else 'people' end),
            'sent');
  end if;
  return v_count;
end $$;

revoke execute on function public.notify_users(bigint[], text, text, text, text, text, uuid) from public, anon, authenticated;

/** "Sean Fitzgerald", or null when there is no signed-in user (a system job). */
create or replace function public.actor_name()
returns text
language sql stable security definer set search_path = public as $$
  select nullif(concat_ws(' ', first_name, last_name), '') from public.users where id = public.app_user_id();
$$;
revoke execute on function public.actor_name() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Appointments set → admins, the project's account manager, the lead's rep,
-- and the client's own portal users. Statement-level, so an import that
-- creates fifty appointments sends one summary per client, not fifty.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_appointments()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_to bigint[];
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
           (array_agg(a.appt_time order by a.appt_date, a.id))[1] as first_time
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
       where u.role = 'client' and r.company_id is not null and u.company_id = r.company_id
      union
      select unnest(r.reps)
    );
    perform public.notify_users(
      v_to, 'appointment',
      case when r.n = 1 then 'Appointment set: ' || coalesce(r.lead_name, 'a lead')
           else r.n || ' appointments set' || coalesce(' for ' || r.company, '') end,
      case when r.n = 1
           then concat_ws(' · ',
                  to_char(r.first_date, 'Dy Mon FMDD') || coalesce(' at ' || r.first_time, ''),
                  r.company,
                  'set by ' || public.actor_name())
           else concat_ws(' · ',
                  to_char(r.first_date, 'Mon FMDD') || ' – ' || to_char(r.last_date, 'Mon FMDD'),
                  'set by ' || public.actor_name()) end,
      '/calendar?view=' || case when r.n = 1 then 'day' else 'month' end
        || '&d=' || coalesce(r.first_date, current_date)::text,
      'appt_created');
  end loop;
  return null;
end $$;

drop trigger if exists notify_appointments on public.appointments;
create trigger notify_appointments
  after insert on public.appointments
  referencing new table as new_rows
  for each statement execute function public.tg_notify_appointments();

-- ---------------------------------------------------------------------------
-- Leads assigned → the rep they were assigned to. Grouped per rep, so a bulk
-- import or reassignment sends "12 leads assigned to you", not twelve pings.
-- Hot leads follow the "Hot lead assigned" rule; the rest "Lead assigned".
-- ---------------------------------------------------------------------------
create or replace function public.notify_lead_assignment(
  p_user bigint, p_hot boolean, p_n bigint, p_lead bigint, p_name text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_link text;
begin
  select role into v_role from public.users where id = p_user;
  -- Managers work from Clients and the Lead Explorer rather than the leads
  -- list, so their link lands where they can open it.
  v_link := case
    when v_role = 'manager' then '/explore?reps=' || p_user || case when p_hot then '&statuses=hot' else '' end
    when p_n = 1            then '/leads/' || p_lead
    else '/leads' || case when p_hot then '?status=hot' else '' end
  end;
  perform public.notify_users(
    array[p_user], 'lead',
    case when p_n = 1 then (case when p_hot then 'Hot lead assigned to you: ' else 'Lead assigned to you: ' end) || coalesce(p_name, 'a lead')
         else p_n || case when p_hot then ' hot leads' else ' leads' end || ' assigned to you' end,
    coalesce('Assigned by ' || public.actor_name(), 'Assigned automatically'),
    v_link,
    case when p_hot then 'hot_lead' else 'lead_assigned' end);
end $$;
revoke execute on function public.notify_lead_assignment(bigint, boolean, bigint, bigint, text) from public, anon, authenticated;

create or replace function public.tg_notify_leads_assigned()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- Each branch is only planned when it runs, so the INSERT path never
  -- touches old_rows, which an insert trigger does not have.
  if tg_op = 'INSERT' then
    for r in
      select n.assigned_user_id as uid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
       group by 1, 2
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name);
    end loop;
  else
    for r in
      select n.assigned_user_id as uid, coalesce(st.code = 'hot', false) as hot, count(*) as n,
             (array_agg(n.id order by n.id))[1] as lead_id,
             (array_agg(n.company_name order by n.id))[1] as lead_name
        from new_rows n
        join old_rows o on o.id = n.id
        left join public.lead_statuses st on st.id = n.status_id
       where n.assigned_user_id is not null
         and n.assigned_user_id is distinct from o.assigned_user_id
       group by 1, 2
    loop
      perform public.notify_lead_assignment(r.uid, r.hot, r.n, r.lead_id, r.lead_name);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists notify_leads_assigned_ins on public.leads;
create trigger notify_leads_assigned_ins
  after insert on public.leads
  referencing new table as new_rows
  for each statement execute function public.tg_notify_leads_assigned();

drop trigger if exists notify_leads_assigned_upd on public.leads;
create trigger notify_leads_assigned_upd
  after update on public.leads
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.tg_notify_leads_assigned();

-- ---------------------------------------------------------------------------
-- Imports finished → administrators.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_import()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_users(
    array(select id from public.users where role = 'admin'), 'import',
    case when new.status = 'failed' then 'Import failed: ' else 'Import finished: ' end || new.file_name,
    format('%s of %s rows imported · %s skipped', new.imported_count, new.row_count, new.error_count)
      || coalesce(' · by ' || public.actor_name(), ''),
    '/imports',
    'import_done');
  return null;
end $$;

drop trigger if exists notify_import on public.import_batches;
create trigger notify_import
  after insert on public.import_batches
  for each row execute function public.tg_notify_import();

-- ---------------------------------------------------------------------------
-- Client feedback received → administrators.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_feedback()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company text;
begin
  select co.name into v_company
    from public.leads l
    join public.projects p   on p.id  = l.project_id
    join public.companies co on co.id = p.company_id
   where l.id = new.lead_id;
  perform public.notify_users(
    array(select id from public.users where role = 'admin'), 'feedback',
    'New client feedback' || coalesce(' from ' || v_company, ''),
    concat_ws(' · ',
      case when new.rating is not null then repeat('★', new.rating) || repeat('☆', 5 - new.rating) end,
      left(new.content, 140)),
    '/feedback',
    'feedback_new');
  return null;
end $$;

drop trigger if exists notify_feedback on public.feedback;
create trigger notify_feedback
  after insert on public.feedback
  for each row execute function public.tg_notify_feedback();

-- ---------------------------------------------------------------------------
-- Announcement posted on the bulletin board → all staff.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_bulletin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_users(
    array(select id from public.users where role in ('admin', 'manager', 'agent')), 'bulletin',
    case when new.message_type = 'AL' then 'Alert posted' else 'New announcement' end
      || coalesce(' by ' || public.actor_name(), ''),
    new.message,
    '/bulletin',
    'bulletin_posted');
  return null;
end $$;

drop trigger if exists notify_bulletin on public.bulletin_board;
create trigger notify_bulletin
  after insert on public.bulletin_board
  for each row execute function public.tg_notify_bulletin();

-- ---------------------------------------------------------------------------
-- Direct messages. Administrators and account managers only. Recipients are
-- people and/or whole roles; the link, if any, must stay inside the app.
-- ---------------------------------------------------------------------------
create or replace function public.send_notification(
  p_user_ids bigint[],
  p_roles    text[],
  p_title    text,
  p_body     text,
  p_link     text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_sent  int;
  v_title text := btrim(coalesce(p_title, ''));
  v_link  text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if not public.is_manager() then
    raise exception 'Only administrators and account managers can send notifications'
      using errcode = '42501';
  end if;
  if length(v_title) = 0 then
    raise exception 'A title is required' using errcode = '22023';
  end if;
  -- Internal paths only: never a link that leaves the app.
  if v_link is not null and (v_link !~ '^/[^/\\]' and v_link <> '/') then
    raise exception 'Links must point inside Lighthouse, like /leads/123' using errcode = '22023';
  end if;

  v_sent := public.notify_users(
    array(select id from public.users
           where id = any(coalesce(p_user_ids, '{}'))
              or role = any(coalesce(p_roles, '{}'))),
    'message', v_title, nullif(btrim(coalesce(p_body, '')), ''), v_link, null, v_batch);

  return jsonb_build_object('batch', v_batch, 'sent', v_sent);
end $$;

grant execute on function public.send_notification(bigint[], text[], text, text, text) to authenticated;

-- What the caller has sent, one row per message, with who has read it.
create or replace function public.sent_notifications(p_limit int default 20)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(b order by b->>'sent_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'batch',   n.batch_id,
               'title',   min(n.title),
               'body',    min(n.body),
               'link',    min(n.link),
               'sent_at', min(n.created_at),
               'total',   count(*),
               'read',    count(n.read_at),
               'recipients', jsonb_agg(jsonb_build_object(
                  'name', coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), u.email),
                  'role', u.role,
                  'read_at', n.read_at) order by n.read_at nulls last, u.first_name)
             ) as b
        from public.notifications n
        join public.users u on u.id = n.user_id
       where n.sender_id = public.app_user_id() and n.batch_id is not null
       group by n.batch_id
       order by min(n.created_at) desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;
$$;

grant execute on function public.sent_notifications(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: publish new rows so the bell updates without a page load.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
