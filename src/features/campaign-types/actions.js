"use server";

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cleanFields } from "@/lib/campaign-types";

const forAdmins = (me) => me?.role === "admin" && me?.status === "active";

/** A campaign type made or changed (Settings › Campaign Types): its name and its fields (`fields`, JSON). */
export async function saveCampaignType(prevState, formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!forAdmins(me)) return fail("Only an administrator can change campaign types.");
  const id = idFrom(formData);
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return fail("Give the campaign type a name.", { name: "Required" });
  if (/^insurance$/i.test(name)) return fail("Insurance is the built-in campaign type: give this one another name.", { name: "Taken" });
  let input;
  try {
    input = JSON.parse(String(formData.get("fields") ?? "{}"));
  } catch {
    return fail("The fields couldn't be read. Try again.");
  }
  const { fields, error: invalid } = cleanFields(input);
  if (invalid) return fail(invalid);
  const row = { name, fields, updated_at: new Date().toISOString() };
  const { data, error } = id
    ? await supabase.from("campaign_types").update(row).eq("id", id).select("id")
    : await supabase.from("campaign_types").insert({ ...row, created_by: me.id }).select("id");
  if (error) return fail(/duplicate|unique/i.test(error.message) ? "There's already a campaign type with that name." : error.message, /duplicate|unique/i.test(error.message) ? { name: "Taken" } : null);
  if (!data?.length) return fail("That campaign type no longer exists.");
  await logActivity(supabase, id ? "campaign_type.update" : "campaign_type.create", { entity: "campaign_type", entityId: data[0].id, detail: name });
  revalidatePath("/settings");
  revalidatePath("/leads", "layout");
  return ok({ id: data[0].id, name });
}

/** A campaign type deleted: its clients go back to Insurance (their leads' own answers are kept). */
export async function deleteCampaignType(formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!forAdmins(me)) return fail("Only an administrator can delete campaign types.");
  const id = idFrom(formData);
  if (!id) return fail("Choose the campaign type.");
  const { data, error } = await supabase.from("campaign_types").delete().eq("id", id).select("name");
  if (error) return fail(error.message);
  if (!data?.length) return fail("That campaign type no longer exists.");
  await logActivity(supabase, "campaign_type.delete", { entity: "campaign_type", entityId: id, detail: data[0].name });
  revalidatePath("/settings");
  revalidatePath("/clients", "layout");
  return ok({ id });
}
