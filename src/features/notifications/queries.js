/** Inbox, conversations, and what the signed-in user has sent. */

import "server-only";
import { fullName, initialsOf, timeAgo } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/paging";
import { runPaged } from "@/lib/server/query-helpers";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

const toNotificationView = (n) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body ?? "",
  link: n.link,
  // Who sent it, named on the row itself: a client may not read the users table.
  from: n.sender_name ?? null,
  read: Boolean(n.read_at),
  when: timeAgo(n.created_at),
  at: n.created_at,
});

/** One page of the signed-in user's inbox, newest first, plus the unread total. */
export async function getInbox({ page = 1, perPage = PAGE_SIZE, unreadOnly = false } = {}) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { rows: [], total: 0, unread: 0 };

  const build = (p) => {
    let q = supabase
      .from("notifications")
      .select("id, kind, title, body, link, sender_name, read_at, created_at", { count: "exact" })
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (unreadOnly) q = q.is("read_at", null);
    const from = (p.page - 1) * p.perPage;
    return q.range(from, from + p.perPage - 1);
  };

  const [{ rows, total }, unread] = await Promise.all([
    runPaged(build, { page, perPage }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.id).is("read_at", null),
  ]);
  return { rows: rows.map(toNotificationView), total, unread: unread.count ?? 0 };
}

/**
 * One notification from the signed-in user's inbox, with the person who sent
 * it and the conversation between them (oldest first). Null when it is not
 * theirs. Times stay ISO strings: the page formats them in the viewer's zone.
 */
export async function getNotificationThread(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notification_thread", { p_id: id });
  if (error) throw error;
  if (!data) return null;
  return {
    notification: data.notification,
    person: data.person ? { ...data.person, initials: initialsOf(data.person.name) } : null,
    messages: data.messages ?? [],
  };
}

/** Direct messages the signed-in user has sent, with who has read each one. */
export async function getSentNotifications(limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sent_notifications", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ...b,
    when: timeAgo(b.sent_at),
    recipients: (b.recipients ?? []).map((r) => ({ ...r, readWhen: r.read_at ? timeAgo(r.read_at) : null })),
  }));
}

/** Everyone who can be messaged: active accounts, grouped by role in the composer. */
export async function getMessageRecipients() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, role")
    .eq("status", "active")
    .order("first_name");
  if (error) throw error;
  return (data ?? []).map((u) => ({ id: u.id, name: fullName(u), role: u.role }));
}
