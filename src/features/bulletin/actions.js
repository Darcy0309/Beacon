"use server";

/** The bulletin board. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, deleteRow, fail, idFrom, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

export async function postBulletin(prevState, formData) {
  const { values, failed } = check(formData, schemas.bulletin);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const message = values.message;

  const { error } = await supabase.from("bulletin_board").insert({
    message,
    message_type: s(formData, "message_type") || "IN",
    project_id: n(formData, "project_id"),
    user_id: me?.id ?? null,
  });
  if (error) return fail(error);

  revalidatePath("/bulletin");
  revalidatePath("/");
  return ok();
}

export async function archiveBulletin(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bulletin_board")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/bulletin");
  return ok({ id });
}

export async function deleteBulletin(formData) {
  return deleteRow("bulletin_board", formData, ["/bulletin", "/"]);
}
