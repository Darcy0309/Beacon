-- Notifications (client, Nov 2026): mark one unread again, to keep it for later (read_at back to
-- null: the update already allowed on one's own), and Clear history: the ones already read taken
-- out of one's inbox. Cleared, not deleted: a sender's read receipts and a reminder's link to its
-- notification stay as they were; unread ones are never cleared.
--
-- Safe to run again.

alter table public.notifications add column if not exists cleared_at timestamptz;
comment on column public.notifications.cleared_at is 'Taken out of its recipient''s inbox (Clear history); kept for read receipts.';
create index if not exists notifications_inbox on public.notifications (user_id, created_at desc) where cleared_at is null;

-- The signed-in person's read notifications cleared from their inbox; how many.
create or replace function public.clear_read_notifications()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me bigint := public.app_user_id();
  v_count integer;
begin
  if v_me is null then
    raise exception 'Sign in again to do that' using errcode = '42501';
  end if;
  update public.notifications set cleared_at = now()
   where user_id = v_me and read_at is not null and cleared_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.clear_read_notifications() from public, anon;
grant execute on function public.clear_read_notifications() to authenticated;
