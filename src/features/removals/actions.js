"use server";

/**
 * A client's removal list (Oct 2026): names taken off a client's lists, by
 * the client's own people or by staff, with why (Deletion, Don't call,
 * Current customer). mark_names() in the database gives each the result for
 * its reason, and the list remembers it for the lists the client pulls later
 * (supabase/migrations/…_client_removals.sql).
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { REMOVAL_REASONS } from "@/lib/dedupe";

const idOf = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Names off the list: `ids` of leads, a reason (Deletion when none is given), and a note if there is one. */
export async function markNames(ids, reason = "deletion", note = "") {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || !["admin", "manager", "client"].includes(me.role)) return fail("You can't take names off a list.");
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(idOf).filter(Boolean))];
  if (!list.length) return fail("Choose the names to take off.");
  if (!REMOVAL_REASONS.some((r) => r.value === reason)) return fail("Choose why these names come off.");
  const { data, error } = await supabase.rpc("mark_names", { p_ids: list, p_reason: reason, p_note: String(note ?? "").slice(0, 500) });
  if (error) return fail(error.message);
  await logActivity(supabase, "lead.removed", { detail: `${data.marked} marked ${data.reason}`, userId: me.id });
  revalidatePath("/projects", "layout");
  revalidatePath("/leads", "layout");
  return ok(data);
}

/** A name off a client's removal list (administrators): a later list may bring it again. */
export async function forgetRemoval(id) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only administrators change a client's removal list.");
  const { data, error } = await supabase.from("client_removals").delete().eq("id", idOf(id) ?? 0).select("company_name");
  if (error) return fail(error.message);
  if (!data?.length) return fail("That name was already off the list.");
  await logActivity(supabase, "client.removal_forgotten", { detail: data[0].company_name, userId: me.id });
  revalidatePath("/clients", "layout");
  return ok(null);
}
