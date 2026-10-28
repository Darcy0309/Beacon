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
  // Whole projects (Sean, Oct 2026): the client's people and the project's reps. Who may send to which, and to
  // everyone in a role (administrators only), send_notification() decides.
  const projectIds = formData.getAll("project_ids").map(String).filter((v) => /^[1-9]\d*$/.test(v)).map(Number);
  if (!roles.length && !userIds.length && !projectIds.length) {
    return fail("Choose who should receive it", { recipients: "Pick a project or a person" }, values);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_notification", {
    p_user_ids: userIds,
    p_roles: roles,
    p_title: values.title,
    p_body: values.body || null,
    p_link: values.link || null,
    p_projects: projectIds,
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
 * that they can still receive it. With `quote`, the message it answers; with
 * `attachment` (JSON: a voice message or a GIF; Oct 2026), the text may be
 * left out.
 */
export async function replyToNotification(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing notification.");
  let attachment = null;
  try {
    attachment = formData.get("attachment") ? JSON.parse(String(formData.get("attachment"))) : null;
  } catch {
    return fail("That can't be sent.");
  }
  const body = String(formData.get("body") ?? "").trim();
  if (!attachment) {
    const { failed } = check(formData, schemas.reply);
    if (failed) return failed;
  } else if (body.length > 1000) return fail("Keep a reply under 1,000 characters");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reply_to_notification", {
    p_id: id, p_body: body, p_quote: idFrom(formData, "quote"), p_attachment: attachment,
  });
  if (error) return fail(error);
  revalidatePath("/notifications");
  return ok({ message: data });
}

/** Put an emoji on a message in your conversations, or take it off. The message's reactions after. */
export async function toggleReaction(messageId, emoji) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_reaction", { p_message: Number(messageId), p_emoji: String(emoji ?? "") });
  if (error) return fail(error);
  return ok({ reactions: data ?? [] });
}

/**
 * GIFs from GIPHY (Oct 2026): those matching `q`, or what is trending. The
 * key stays on the server (GIPHY_API_KEY); without it, a plain word why.
 */
export async function searchGifs(q = "") {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return fail("GIFs aren't set up yet: an administrator adds the GIPHY key.");
  const supabase = await createClient();
  if (!(await currentAppUser(supabase))) return fail("You are signed out.");
  const term = String(q ?? "").trim().slice(0, 50);
  const url = new URL(`https://api.giphy.com/v1/gifs/${term ? "search" : "trending"}`);
  url.searchParams.set("api_key", key);
  if (term) url.searchParams.set("q", term);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("bundle", "messaging_non_clips");
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return fail(res.status === 429 ? "GIPHY is busy just now. Try again in a minute." : "GIFs couldn't be loaded. Try again.");
    const json = await res.json();
    // Their addresses without the tracking query, as reply_to_notification() takes them.
    const bare = (u) => (u ? String(u).split("?")[0] : null);
    const gifs = (json.data ?? []).map((g) => {
      const im = g.images ?? {};
      const show = im.fixed_width ?? im.downsized ?? im.original;
      return show?.url ? {
        id: g.id, title: String(g.title ?? "").slice(0, 140),
        url: bare(show.url), still: bare(im.fixed_width_still?.url),
        // Sharp at the picker's column width (the small one, 100 px, read blurry), still light to load.
        preview: bare(im.fixed_width_downsampled?.url ?? show.url),
        width: Number(show.width) || 200, height: Number(show.height) || 200,
      } : null;
    }).filter(Boolean);
    return ok({ gifs });
  } catch {
    return fail("GIFs couldn't be loaded. Try again.");
  }
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
