-- ---------------------------------------------------------------------------
-- Lighthouse CRM — push notifications: on the desktop even with Lighthouse closed
--
--   push_subscriptions       each browser someone turned desktop notifications
--                            on in: where its push service takes messages for
--                            it, and the keys to encrypt them. Saved and
--                            removed only through the two functions below.
--   save_push_subscription() this browser, for the signed-in person (a browser
--                            someone else used moves to them)
--   remove_push_subscription()
--   notifications.pushed_at  when it was pushed, so each is pushed once
--   tg_notifications_push    after new notifications are added, asks the app
--                            (POST /api/push/deliver) to push them, in one
--                            call per batch, through pg_net. Does nothing
--                            until the app's address and secret are in Vault:
--
--     select vault.create_secret('https://<your app>/api/push/deliver', 'push_deliver_url');
--     select vault.create_secret('<PUSH_DELIVER_SECRET>', 'push_deliver_secret');
--
-- The app holds the push keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
-- VAPID_SUBJECT) and the same PUSH_DELIVER_SECRET.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references public.users(id) on delete cascade,
  endpoint      text not null unique check (length(endpoint) between 12 and 1000),
  p256dh        text not null check (length(p256dh) between 20 and 200),
  auth          text not null check (length(auth) between 8 and 100),
  user_agent    text check (length(user_agent) <= 300),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select public.app_user_id()));

-- Written only through the functions below (and read in full only by the server).
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete, truncate on public.push_subscriptions from authenticated;
grant select on public.push_subscriptions to authenticated;
grant select, update, delete on public.push_subscriptions to service_role;

/**
 * Save this browser's push subscription for the signed-in person. A browser
 * is one row: if someone else used it before, it is theirs no more. Only the
 * browsers' own push services are accepted, so nobody can have the server
 * post to an address of their choosing.
 */
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.app_user_id();
  v_host text := lower(substring(p_endpoint from '^https://([^/:?#]+)'));
begin
  if v_me is null then
    raise exception 'Sign in to turn on notifications' using errcode = '42501';
  end if;
  if v_host is null or not (
       v_host = 'fcm.googleapis.com' or v_host like '%.googleapis.com'          -- Chrome, Edge on Android
    or v_host like '%.push.services.mozilla.com'                                -- Firefox
    or v_host = 'web.push.apple.com' or v_host like '%.push.apple.com'          -- Safari
    or v_host like '%.notify.windows.com'                                       -- Edge on Windows
  ) then
    raise exception 'That is not a browser push service' using errcode = '22023';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_me;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

/** Forget this browser (turned off, or signing out). */
create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = public.app_user_id();
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pushing new notifications
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists pushed_at timestamptz;

-- The server reads new notifications and marks them pushed; nothing else.
grant select on public.notifications to service_role;
grant update (pushed_at) on public.notifications to service_role;

/**
 * After notifications are added (one, or a batch to a whole role), ask the
 * app to push them: one call with every id. Never holds up or fails the
 * insert: pg_net sends it after the transaction commits, and anything that
 * goes wrong here is only a warning.
 */
create or replace function public.tg_notifications_push()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_ids    bigint[];
begin
  select array_agg(id order by id) into v_ids from new_rows where read_at is null;
  if v_ids is null then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
  if v_url is null or v_secret is null then
    return null; -- push not set up yet
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  raise warning 'push: % (%)', sqlerrm, sqlstate;
  return null;
end $$;
revoke execute on function public.tg_notifications_push() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.tg_notifications_push();
