"use server";

/** Switching alert rules on and off. */

import { revalidatePath } from "next/cache";
import { fail, idFrom, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

export async function setAlertRuleEnabled(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing rule id.");
  const enabled = formData.get("enabled") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.from("alert_rules").update({ enabled }).eq("id", id).select("id");
  if (error) return fail(error);
  // Row Level Security answers an update it refuses with no row, not an error (Oct 2026: said, not switched in name only).
  if (!data?.length) return fail("That alert wasn't changed: it may have been removed, or only an administrator can switch it.");
  revalidatePath("/alerts");
  return ok({ id });
}
