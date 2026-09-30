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
  const { error } = await supabase.from("alert_rules").update({ enabled }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/alerts");
  return ok({ id });
}
