"use server";

/** Reviewing appointments set from calls. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok, requestOrigin } from "@/lib/server/action-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failHold, releaseHolds } from "@/features/delivery/holds";

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

  // Its email, if held in QA (Settings › Delivery): passed, it goes to the client now; failed, it stays held
  // back (the manager has been told).
  const admin = createAdminClient();
  if (admin) {
    const { data: held } = await admin.from("delivery_holds").select("id").eq("appointment_id", id).in("status", ["held", "failed"]);
    if (held?.length) {
      const me = await currentAppUser(supabase);
      if (passed) await releaseHolds(admin, { ids: held.map((h) => h.id), sentBy: me?.id ?? null, origin: await requestOrigin() });
      else for (const h of held) await failHold(admin, { id: h.id, note, by: me?.id ?? null, notify: false });
    }
  }
  revalidatePath("/qa");
  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return ok({ id, passed });
}
