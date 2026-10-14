"use server";

/** The cargo list (Settings): what a business's vehicles can carry, for the Business tab's Cargo field. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cargoName } from "@/lib/business";

async function asAdmin() {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  return { supabase, me: me?.role === "admin" ? me : null };
}

/**
 * Add names to the cargo list (a list loaded from a file, or one typed in).
 * A name already on it, in any case, is left as it is. Administrators only.
 */
export async function addCargoTypes(names) {
  const seen = new Set();
  const list = (Array.isArray(names) ? names : [names]).map(cargoName).filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase())).slice(0, 2000);
  if (!list.length) return fail("No cargo names found.");
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator can change the cargo list.");
  const { data: existing, error } = await supabase.from("cargo_types").select("name").limit(5000);
  if (error) return fail(error);
  const have = new Set((existing ?? []).map((r) => r.name.toLowerCase()));
  const fresh = list.filter((v) => !have.has(v.toLowerCase()));
  if (fresh.length) {
    const { error: insertError } = await supabase.from("cargo_types").insert(fresh.map((name) => ({ name })));
    if (insertError) return fail(insertError);
    await logActivity(supabase, "cargo.add", { detail: fresh.length === 1 ? fresh[0] : `${fresh.length} added`, userId: me.id });
  }
  revalidatePath("/settings");
  return ok({ added: fresh.length, already: list.length - fresh.length });
}

/** Take a name off the cargo list. Leads that have it keep it. Administrators only. */
export async function removeCargoType(id) {
  if (!Number.isInteger(id) || id < 1) return fail("That cargo type was not found.");
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator can change the cargo list.");
  const { data, error } = await supabase.from("cargo_types").delete().eq("id", id).select("name");
  if (error) return fail(error);
  if (!data?.length) return fail("That cargo type was not found.");
  await logActivity(supabase, "cargo.remove", { detail: data[0].name, userId: me.id });
  revalidatePath("/settings");
  return ok();
}
