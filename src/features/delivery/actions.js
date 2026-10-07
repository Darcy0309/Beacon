"use server";

/** Sending a lead's sheet to its client again ("reprocess", as the old system called it). */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, idFrom, logActivity, ok, requestOrigin } from "@/lib/server/action-helpers";
import { deliverLead } from "@/features/delivery/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email a lead's sheet to its project's delivery addresses again, for its
 * latest call that made it a lead or an appointment: when the first send
 * failed, or the client asks for it again. For whoever may work the name.
 */
export async function resendDelivery(formData) {
  const leadId = idFrom(formData, "lead_id");
  if (!leadId) return fail("Missing lead.");
  const supabase = await createClient();
  const [{ data: allowed, error }, me] = await Promise.all([
    supabase.rpc("can_work_lead", { p_lead_id: leadId }),
    currentAppUser(supabase),
  ]);
  if (error) return fail(error);
  if (!allowed) return fail("This name is not on your call list, so you can't send it.");

  const result = await deliverLead({ leadId, sentBy: me?.id ?? null, resent: true, origin: await requestOrigin() });
  if (result.error) return fail(result.error);
  if (!result.addresses) return fail("Its project has no delivery email. Add one on the project first.");
  await logActivity(supabase, "lead.deliver", { entity: "lead", entityId: leadId, detail: `${result.sent} sent, ${result.failed} not` });
  revalidatePath(`/leads/${leadId}`);
  return ok(result);
}
