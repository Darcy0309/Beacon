"use server";

/** Restoring what was deleted. */

import { revalidatePath } from "next/cache";
import { fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

const KINDS = ["companies", "projects", "leads", "appointments", "agencies", "documents", "bulletin_board", "users"];

/**
 * Bring a deleted record back, with whatever went with it (restore_record()).
 * Administrators only: the database refuses anyone else.
 */
export async function restoreRecord(formData) {
  const kind = String(formData.get("kind") ?? "");
  const id = Number(formData.get("id")) || null;
  if (!KINDS.includes(kind) || !id) return fail("Missing record.");
  const supabase = await createClient();
  const { data: restored, error } = await supabase.rpc("restore_record", { p_table: kind, p_id: id });
  if (error) return fail(error);
  if (!restored) return fail("That record is no longer deleted.");
  await logActivity(supabase, "record.restore", { entity: kind, entityId: id, detail: String(formData.get("name") ?? "").slice(0, 200) || null });
  // It may show anywhere again: every page is read afresh.
  revalidatePath("/", "layout");
  return ok({ id });
}
