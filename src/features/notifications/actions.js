"use server";

/** Sending, replying to and reading notifications. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

const MESSAGE_ROLES = ["admin", "manager", "agent", "client"];

/** Send a direct notification to people and/or whole roles. Admins and managers only. */
export async function sendNotification(prevState, formData) {
  const { values, failed } = check(formData, schemas.notification);
  if (failed) return failed;

  const roles = formData.getAll("roles").map(String).filter((r) => MESSAGE_ROLES.includes(r));
  const userIds = formData.getAll("user_ids").map(String).filter((v) => /^[1-9]\d*$/.test(v)).map(Number);
  if (!roles.length && !userIds.length) {
    return fail("Choose who should receive it", { recipients: "Pick at least one role or person" }, values);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_notification", {
    p_user_ids: userIds,
    p_roles: roles,
    p_title: values.title,
    p_body: values.body || null,
    p_link: values.link || null,
  });
  if (error) return fail(error);
  if (!data?.sent) return fail("Nobody received it — the people you chose may be inactive, or it was only you.");

  await logActivity(supabase, "notification.send", { detail: `${values.title} → ${data.sent}` });
  revalidatePath("/notifications");
  return ok({ sent: data.sent });
}

/** Mark one of your notifications read. RLS limits this to your own inbox. */
export async function markNotificationRead(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) return fail(error);
  revalidatePath("/notifications");
  return ok({ id });
}

/**
 * Reply to a notification in your inbox. It goes to the person who sent it
 * and lands in their bell; reply_to_notification() checks it is yours and
 * that they can still receive it.
 */
export async function replyToNotification(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing notification.");
  const { values, failed } = check(formData, schemas.reply);
  if (failed) return failed;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reply_to_notification", { p_id: id, p_body: values.body });
  if (error) return fail(error);
  revalidatePath("/notifications");
  return ok({ message: data });
}

/**
 * Opening a notification reads it, and everything its sender has messaged
 * you along with it. RLS limits the update to your own inbox.
 */
export async function markThreadRead(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("You are signed out.");

  const { data: n } = await supabase
    .from("notifications")
    .select("id, sender_id")
    .eq("id", id)
    .eq("user_id", me.id)
    .maybeSingle();
  if (!n) return fail("That notification is not in your inbox.");

  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", me.id)
    .is("read_at", null);
  q = n.sender_id
    ? q.or(`id.eq.${n.id},and(kind.eq.message,sender_id.eq.${Number(n.sender_id)})`)
    : q.eq("id", n.id);
  const { error } = await q;
  if (error) return fail(error);
  revalidatePath("/notifications");
  return ok({ id });
}

/** Mark everything in your inbox read. */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("You are signed out.");
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", me.id)
    .is("read_at", null);
  if (error) return fail(error);
  revalidatePath("/notifications");
  return ok();
}
