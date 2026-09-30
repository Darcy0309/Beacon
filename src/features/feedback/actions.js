"use server";

/** Client feedback. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, idFrom, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(prevState, formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);

  const { error } = await supabase.from("feedback").insert({
    appointment_id: n(formData, "appointment_id"),
    lead_id: n(formData, "lead_id"),
    user_id: me?.id ?? null,
    nature_id: n(formData, "nature_id"),
    fb_status_id: n(formData, "fb_status_id"),
    rating: n(formData, "rating"),
    content: s(formData, "content"),
    additional_comment: s(formData, "additional_comment"),
    submitted_by: s(formData, "submitted_by"),
  });
  if (error) return fail(error);

  revalidatePath("/feedback");
  return ok();
}

export async function setFeedbackStatus(formData) {
  const id = idFrom(formData);
  const statusId = idFrom(formData, "fb_status_id");
  if (!id || !statusId) return fail("Missing feedback or status.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ fb_status_id: statusId })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/feedback");
  return ok({ id });
}
