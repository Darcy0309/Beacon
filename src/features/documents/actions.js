"use server";

/** The document library. */

import { revalidatePath } from "next/cache";
import { NOT_DELETED, fail, idFrom, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

export async function deleteDocument(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing document id.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return fail(NOT_DELETED);
  revalidatePath("/documents");
  return ok({ id });
}
