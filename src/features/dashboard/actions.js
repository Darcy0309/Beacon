"use server";

/** The dashboard: a manager's goals for the day. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, ok } from "@/lib/server/action-helpers";
import { getBusinessToday } from "@/lib/server/business-day";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

const count = (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10));

/**
 * Set today's goals: how many leads and appointments the signed-in manager
 * means to develop. The day is the business's; the goals are theirs alone
 * (the database agrees). Empty clears one.
 */
export async function saveDailyGoals(prevState, formData) {
  const { values, failed } = check(formData, schemas.dailyGoals);
  if (failed) return failed;

  const supabase = await createClient();
  const [me, day] = await Promise.all([currentAppUser(supabase), getBusinessToday()]);
  if (!me || !["manager", "agent", "admin"].includes(me.role)) return fail("Only staff set daily goals.");

  const { error } = await supabase.from("daily_goals").upsert(
    { user_id: me.id, day, leads_goal: count(values.leads_goal), appts_goal: count(values.appts_goal), updated_at: new Date().toISOString() },
    { onConflict: "user_id,day" }
  );
  if (error) return fail(error, null, values);
  revalidatePath("/");
  return ok({ day });
}
