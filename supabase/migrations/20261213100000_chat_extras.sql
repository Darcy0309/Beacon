-- Chat as other apps have it (Darcy, Oct 2026): reactions, replying to one
-- message, voice messages and GIFs, in the conversations under Notifications.
--
--   notifications.quote_id     the message a reply answers (shown above it)
--   notifications.attachment   { kind: 'voice', path, seconds } or
--                              { kind: 'gif', url, still, width, height, title }
--   message_reactions          an emoji each person put on a message
--   toggle_reaction()          put one on, or take it off
--   reply_to_notification()    now with the message it answers and an
--                              attachment (a voice message or GIF needs no text)
--   notification_thread()      each message with its quote, attachment and reactions
--   storage 'chat-voice'       voice messages, private: under voice/<sender>/,
--                              heard only by the two people in the conversation
--
-- Safe to run more than once. Run it before the code that uses it is pushed
-- (the code before it keeps working with it).

alter table public.notifications add column if not exists quote_id bigint references public.notifications(id) on delete set null;
alter table public.notifications add column if not exists attachment jsonb;
create index if not exists notifications_voice_path on public.notifications ((attachment ->> 'path')) where attachment is not null;

/** Whether the signed-in person sent or received a message. */
create or replace function public.in_message(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.notifications n
                  where n.id = p_id and n.kind = 'message'
                    and public.app_user_id() in (n.user_id, n.sender_id))
$$;
revoke execute on function public.in_message(bigint) from public, anon;
grant execute on function public.in_message(bigint) to authenticated;

create table if not exists public.message_reactions (
  message_id bigint not null references public.notifications(id) on delete cascade,
  user_id    bigint not null references public.users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
-- A reaction taken off reaches the other person live with what it was on.
alter table public.message_reactions replica identity full;
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select to authenticated
  using ((select public.in_message(message_id)));
grant select on public.message_reactions to authenticated;
do $$
begin
  execute 'drop policy if exists mfa_required on public.message_reactions';
  execute 'create policy mfa_required on public.message_reactions as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))';
  execute 'drop policy if exists active_account_required on public.message_reactions';
  execute 'create policy active_account_required on public.message_reactions as restrictive for all to authenticated using ((select public.app_user_id()) is not null) with check ((select public.app_user_id()) is not null)';
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end $$;

/** Put an emoji on a message, or take it off again. The message's reactions after. */
create or replace function public.toggle_reaction(p_message bigint, p_emoji text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  if v_me is null or not public.in_message(p_message) then
    raise exception 'That message is not in your conversations' using errcode = '42501';
  end if;
  if v_emoji = '' or char_length(v_emoji) > 16 or v_emoji ~ '[A-Za-z0-9<>\s]' then
    raise exception 'Choose an emoji' using errcode = '22023';
  end if;
  if exists (select 1 from public.message_reactions where message_id = p_message and user_id = v_me and emoji = v_emoji) then
    delete from public.message_reactions where message_id = p_message and user_id = v_me and emoji = v_emoji;
  else
    if (select count(*) from public.message_reactions where message_id = p_message and user_id = v_me) >= 12 then
      raise exception 'That''s plenty of reactions on one message' using errcode = '22023';
    end if;
    insert into public.message_reactions (message_id, user_id, emoji) values (p_message, v_me, v_emoji);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('emoji', emoji, 'user_id', user_id) order by created_at)
                     from public.message_reactions where message_id = p_message), '[]'::jsonb);
end $$;
revoke execute on function public.toggle_reaction(bigint, text) from public, anon;
grant execute on function public.toggle_reaction(bigint, text) to authenticated;

/** A message as a conversation shows it: what it says, its attachment, the message it answers, and its reactions. */
create or replace function public.message_json(m public.notifications, p_me bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'mine', m.sender_id = p_me, 'title', m.title, 'body', m.body, 'reply_to', m.reply_to,
    'read_at', m.read_at, 'created_at', m.created_at, 'quote_id', m.quote_id, 'attachment', m.attachment,
    'quote', (select jsonb_build_object('id', q.id, 'mine', q.sender_id = p_me, 'body', q.body, 'title', q.title, 'kind', q.attachment ->> 'kind')
                from public.notifications q where q.id = m.quote_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id) order by r.created_at)
                             from public.message_reactions r where r.message_id = m.id), '[]'::jsonb))
$$;
revoke execute on function public.message_json(public.notifications, bigint) from public, anon, authenticated;

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

    select coalesce(jsonb_agg(public.message_json(t, v_me) order by t.created_at, t.id), '[]'::jsonb)
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

-- A reply, now with the message it answers and an attachment. (The old two-argument
-- one goes: with both, a call naming only p_id and p_body could not tell them apart.)
drop function if exists public.reply_to_notification(bigint, text);
create or replace function public.reply_to_notification(p_id bigint, p_body text, p_quote bigint default null, p_attachment jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me    bigint := public.app_user_id();
  v_body  text := btrim(coalesce(p_body, ''));
  v_att   jsonb;
  v_kind  text := p_attachment ->> 'kind';
  n       public.notifications;
  v_to    public.users;
  v_row   public.notifications;
begin
  if v_me is null then
    raise exception 'Sign in to reply' using errcode = '42501';
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

  -- A voice message: one the sender put in their own folder, two minutes at most.
  if v_kind = 'voice' then
    if coalesce(p_attachment ->> 'path', '') !~ ('^voice/' || v_me || '/[0-9a-f-]{36}\.(webm|ogg|m4a|mp4|mp3)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-voice' and o.name = p_attachment ->> 'path') then
      raise exception 'That voice message didn''t upload. Record it again.' using errcode = '22023';
    end if;
    v_att := jsonb_build_object('kind', 'voice', 'path', p_attachment ->> 'path',
                                'seconds', least(greatest(coalesce((p_attachment ->> 'seconds')::numeric, 0), 0), 120));
  -- A GIF from GIPHY: only their own addresses.
  elsif v_kind = 'gif' then
    if length(coalesce(p_attachment ->> 'url', '')) > 500 or length(coalesce(p_attachment ->> 'still', '')) > 500
       or coalesce(p_attachment ->> 'url', '') !~ '^https://(media[0-9]*|i)\.giphy\.com/[A-Za-z0-9/_.?=&-]+$'
       or (p_attachment ->> 'still' is not null and p_attachment ->> 'still' !~ '^https://(media[0-9]*|i)\.giphy\.com/[A-Za-z0-9/_.?=&-]+$') then
      raise exception 'That GIF can''t be sent' using errcode = '22023';
    end if;
    v_att := jsonb_build_object('kind', 'gif', 'url', p_attachment ->> 'url', 'still', p_attachment ->> 'still',
                                'width', least(greatest(coalesce((p_attachment ->> 'width')::int, 200), 1), 2000),
                                'height', least(greatest(coalesce((p_attachment ->> 'height')::int, 200), 1), 2000),
                                'title', left(coalesce(p_attachment ->> 'title', ''), 140));
  elsif p_attachment is not null then
    raise exception 'That can''t be sent' using errcode = '22023';
  end if;
  if length(v_body) = 0 and v_att is null then
    raise exception 'Write a reply first' using errcode = '22023';
  end if;

  -- The message it answers: one in this conversation.
  if p_quote is not null and not exists (
       select 1 from public.notifications q
        where q.id = p_quote and q.kind = 'message'
          and ((q.user_id = v_me and q.sender_id = v_to.id) or (q.user_id = v_to.id and q.sender_id = v_me))) then
    raise exception 'That message isn''t in this conversation' using errcode = '22023';
  end if;

  -- A person typing will not hit this; a script sending in a loop will.
  if (select count(*) from public.notifications
       where sender_id = v_me and reply_to is not null
         and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending replies too quickly. Wait a moment and try again.'
      using errcode = '54000';
  end if;

  -- A batch id like any direct message, so the sender can read it back (notifications_read).
  -- With no text, what it is, for the bell and desktop notifications.
  insert into public.notifications (user_id, sender_id, batch_id, kind, title, body, reply_to, quote_id, attachment)
  values (v_to.id, v_me, gen_random_uuid(), 'message',
          left('Re: ' || regexp_replace(n.title, '^\s*(re:\s*)+', '', 'i'), 160),
          coalesce(nullif(v_body, ''), case v_kind when 'voice' then '🎤 Voice message' when 'gif' then 'GIF' end),
          n.id, p_quote, v_att)
  returning * into v_row;

  update public.notifications set read_at = now() where id = n.id and read_at is null;

  return public.message_json(v_row, v_me);
end $$;
revoke execute on function public.reply_to_notification(bigint, text, bigint, jsonb) from public, anon;
grant execute on function public.reply_to_notification(bigint, text, bigint, jsonb) to authenticated;

-- Voice messages: private, five megabytes at most (two minutes is well under).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-voice', 'chat-voice', false, 5242880, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_voice_insert on storage.objects;
create policy chat_voice_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-voice' and (storage.foldername(name))[1] = 'voice'
              and (storage.foldername(name))[2] = public.app_user_id()::text);
-- Heard by whoever recorded it, and by the two people in a conversation it was sent in.
drop policy if exists chat_voice_read on storage.objects;
create policy chat_voice_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-voice' and public.app_user_id() is not null
         and ((storage.foldername(name))[2] = public.app_user_id()::text
              or exists (select 1 from public.notifications n
                          where n.attachment ->> 'path' = storage.objects.name
                            and public.app_user_id() in (n.user_id, n.sender_id))));
-- One recorded and not sent is taken away again.
drop policy if exists chat_voice_delete on storage.objects;
create policy chat_voice_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-voice' and (storage.foldername(name))[2] = public.app_user_id()::text
         and not exists (select 1 from public.notifications n where n.attachment ->> 'path' = storage.objects.name));
