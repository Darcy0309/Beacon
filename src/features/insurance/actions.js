"use server";

/** Insurance carriers (agencies). */

import { revalidatePath } from "next/cache";
import { currentAppUser, deleteRow, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { carrierKey } from "@/lib/coverage";

export async function deleteAgency(formData) {
  return deleteRow("agencies", formData, ["/insurance-companies"]);
}

/**
 * Add carriers from an imported list of names (read in the browser from a
 * CSV), so the carrier fields on lead sheets can suggest them. A name
 * already on file (however it is capitalised or punctuated) is skipped.
 * Administrators only.
 */
export async function importCarriers(names) {
  const list = (Array.isArray(names) ? names : [])
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => carrierKey(n) && n.length <= 120)
    .slice(0, 10000);
  if (!list.length) return fail("No carrier names found in that file.");

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator can import carriers.");

  const existing = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("agencies").select("name").order("id").range(from, from + 999);
    if (error) return fail(error);
    for (const r of data ?? []) existing.add(carrierKey(r.name));
    if ((data ?? []).length < 1000) break;
  }
  const fresh = [];
  for (const name of list) {
    const key = carrierKey(name);
    if (existing.has(key)) continue;
    existing.add(key);
    fresh.push({ name });
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await supabase.from("agencies").insert(fresh.slice(i, i + 500));
    if (error) return fail(error);
  }

  await logActivity(supabase, "carriers.import", { detail: `${fresh.length} added`, userId: me.id });
  revalidatePath("/insurance-companies");
  return ok({ added: fresh.length, skipped: list.length - fresh.length });
}
