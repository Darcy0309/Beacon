"use server";

/** Reviewing appointments set from calls. */

import { revalidatePath } from "next/cache";
import { fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

/** Pass or fail an appointment in the QA queue. */
export async function reviewAppointmentQa(formData) {
  const id = Number(formData.get("id"));
  const passed = formData.get("passed") === "true";
  if (!Number.isInteger(id) || id <= 0) return fail("Missing appointment.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!passed && !note) return fail("Say why it failed, so whoever set it can put it right.", { note: "Required when failing QA" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_appointment_qa", { p_appointment_id: id, p_passed: passed, p_note: note });
  if (error) return fail(error);
  await logActivity(supabase, passed ? "appointment.qa_pass" : "appointment.qa_fail", { entity: "appointment", entityId: id });
  revalidatePath("/qa");
  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return ok({ id, passed });
}
