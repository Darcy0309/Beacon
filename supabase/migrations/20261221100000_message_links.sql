-- A message's link in the conversation (Oct 2026): a question about an
-- appointment (and any message sent with a link, such as an appointment
-- update) links to its lead, and the inbox showed it, but a conversation's
-- messages left the link out, so the chat showed the message with nothing to
-- open. message_json() now carries it; the chat shows it under the message.
--
-- Safe to run more than once.

create or replace function public.message_json(m public.notifications, p_me bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'mine', m.sender_id = p_me, 'title', m.title, 'body', m.body, 'link', m.link, 'reply_to', m.reply_to,
    'read_at', m.read_at, 'created_at', m.created_at, 'quote_id', m.quote_id, 'attachment', m.attachment,
    'quote', (select jsonb_build_object('id', q.id, 'mine', q.sender_id = p_me, 'body', q.body, 'title', q.title, 'kind', q.attachment ->> 'kind')
                from public.notifications q where q.id = m.quote_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id) order by r.created_at)
                             from public.message_reactions r where r.message_id = m.id), '[]'::jsonb))
$$;
revoke execute on function public.message_json(public.notifications, bigint) from public, anon, authenticated;
