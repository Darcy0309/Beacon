-- Held leads and appointments stuck in QA (Sean, Nov 2026: "this list of leads/appts are still sitting in QA from
-- 11/13 & 11/14"). A clearing claimed every held one at once ('sending') and then emailed them one by one; cut off
-- part way (the server's time limit on a long backlog), the rest stayed 'sending' for good: never sent by the
-- schedule, nor by Send, which take 'held' ones. Each is now claimed as it is sent, with the time (sending_at);
-- one 'sending' for more than ten minutes is held again, and the hourly clearing runs for those too.
--
-- Safe to run more than once.

alter table public.delivery_holds add column if not exists sending_at timestamptz;

-- The ones already stuck: back in the queue.
update public.delivery_holds set status = 'held' where status = 'sending';

create or replace function public.flush_held_deliveries()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.delivery_holds where status = 'held'
                    or (status = 'sending' and coalesce(sending_at, created_at) < now() - interval '10 minutes')) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
  if v_url is null or v_secret is null or v_url not like '%/api/push/deliver' then
    raise warning 'held deliveries: push_deliver_url / push_deliver_secret are not in the vault';
    return;
  end if;
  perform net.http_post(
    url := replace(v_url, '/api/push/deliver', '/api/delivery/flush'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'held deliveries: % (%)', sqlerrm, sqlstate;
end $$;
revoke execute on function public.flush_held_deliveries() from public, anon, authenticated;
