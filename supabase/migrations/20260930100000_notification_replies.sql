-- ---------------------------------------------------------------------------
-- Lighthouse CRM — open a notification, and reply to whoever sent it
--
-- A notification could only be marked read: a direct message had nowhere to
-- open, the bell cut it to two lines, and the person who got it could not
-- answer. Now every notification opens on its own page, and one that a
-- person sent shows the conversation with them and a reply box, so messages
-- can go back and forth like a chat.
--
-- A reply is a notification like any other, so it reaches the other
-- person's bell straight away. It records the message it answers (reply_to).
--
-- Who may write to whom: administrators and account managers can message
-- anyone (send_notification). Everyone else can answer a person who has
-- notified them. So a client can reply to the agent who set their
-- appointment, but cannot open a conversation with staff out of the blue.
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists reply_to bigint references public.notifications(id) on delete set null;

-- One person's messages to another, newest first: both halves of a conversation.
create index if not exists notifications_pair
  on public.notifications (user_id, sender_id, created_at desc)
  where kind = 'message';

-- ---------------------------------------------------------------------------
-- One notification from the caller's inbox, the person who sent it, and the
-- latest messages between the two of them, oldest first. Null when the
-- notification is not the caller's.
--
-- Security definer because a client cannot read staff rows in users, and
-- needs the sender's name. It only ever returns the caller's own
-- notification, and messages where the caller is the sender or the recipient.
-- ---------------------------------------------------------------------------
create or replace function public.notification_thread(p_id bigint, p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me       bigint := public.app_user_id();
  v_limit    int := least(greatest(coalesce(p_limit, 100), 1), 500);
  n          public.notifications;
  v_person   jsonb;
  v_messages jsonb := '[]'::jsonb;
begin
  if v_me is null then
    return null;
  end if;

  select * into n from public.notifications where id = p_id and user_id = v_me;
  if not found then
    return null;
  end if;

  if n.sender_id is not null then
    select jsonb_build_object(
             'id',     u.id,
             'name',   coalesce(nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Lighthouse user'),
             'role',   u.role,
             'active', u.status = 'active')
      into v_person
      from public.users u
     where u.id = n.sender_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id',         t.id,
             'mine',       t.sender_id = v_me,
             'title',      t.title,
             'body',       t.body,
             'reply_to',   t.reply_to,
             'read_at',    t.read_at,
             'created_at', t.created_at) order by t.created_at, t.id), '[]'::jsonb)
      into v_messages
      from (
        select m.*
          from public.notifications m
         where m.kind = 'message'
           and ((m.user_id = v_me and m.sender_id = n.sender_id)
             or (m.user_id = n.sender_id and m.sender_id = v_me))
         order by m.created_at desc, m.id desc
         limit v_limit
      ) t;
  end if;

  return jsonb_build_object(
    'notification', jsonb_build_object(
       'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link,
       'read_at', n.read_at, 'created_at', n.created_at, 'reply_to', n.reply_to),
    'person',   v_person,
    'messages', v_messages);
end $$;

revoke execute on function public.notification_thread(bigint, int) from public, anon;
grant execute on function public.notification_thread(bigint, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Reply to a notification in your inbox. The reply goes to the person who
-- sent it, and answering marks the original read. Returns the new message
-- in the same shape as notification_thread's messages.
-- ---------------------------------------------------------------------------
create or replace function public.reply_to_notification(p_id bigint, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_body  text := btrim(coalesce(p_body, ''));
  n       public.notifications;
  v_to    public.users;
  v_row   public.notifications;
begin
  if v_me is null then
    raise exception 'Sign in to reply' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'Write a reply first' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep a reply under 1,000 characters' using errcode = '22023';
  end if;

  -- Only a notification in your own inbox, and only one a person sent.
  select * into n from public.notifications where id = p_id and user_id = v_me;
  if not found then
    raise exception 'That notification is not in your inbox' using errcode = '42501';
  end if;
  if n.sender_id is null then
    raise exception 'This notification came from Lighthouse itself, so there is no one to reply to'
      using errcode = '22023';
  end if;

  select * into v_to from public.users where id = n.sender_id;
  if not found or v_to.status <> 'active' then
    raise exception '% can no longer receive messages',
      coalesce(nullif(concat_ws(' ', v_to.first_name, v_to.last_name), ''), 'That person')
      using errcode = '22023';
  end if;

  -- A person typing will not hit this; a script sending in a loop will.
  if (select count(*) from public.notifications
       where sender_id = v_me and reply_to is not null
         and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending replies too quickly. Wait a moment and try again.'
      using errcode = '54000';
  end if;

  -- A batch id like any direct message, so the sender can read it back (notifications_read).
  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, reply_to)
  values (v_to.id, v_me, gen_random_uuid(), 'message',
          left('Re: ' || regexp_replace(n.title, '^\s*(re:\s*)+', '', 'i'), 160),
          v_body, n.id)
  returning * into v_row;

  update public.notifications set read_at = now() where id = n.id and read_at is null;

  return jsonb_build_object(
    'id', v_row.id, 'mine', true, 'title', v_row.title, 'body', v_row.body,
    'reply_to', v_row.reply_to, 'read_at', null, 'created_at', v_row.created_at);
end $$;

revoke execute on function public.reply_to_notification(bigint, text) from public, anon;
grant execute on function public.reply_to_notification(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The Sent list shows what the caller sent out, with read receipts. Replies
-- live in their conversations, so they stay off it.
-- ---------------------------------------------------------------------------
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
       where n.sender_id = (select public.app_user_id())
         and n.batch_id is not null
         and n.reply_to is null
       group by n.batch_id
       order by min(n.created_at) desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;
$$;

grant execute on function public.sent_notifications(int) to authenticated;
