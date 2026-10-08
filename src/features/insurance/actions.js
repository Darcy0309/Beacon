"use server";

/** Insurance carriers (agencies). */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, deleteRow, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { normalizeState } from "@/lib/csv";
import { schemas } from "@/lib/validate";
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

/**
 * Add a carrier, or change one: its name (one way of writing each: a name
 * already on file, however it is capitalised or punctuated, is refused), the
 * lines of business it writes and the states it is active in, stored as
 * "AZ, CA, NM". Administrators only.
 */
export async function saveCarrier(prevState, formData) {
  const { values, failed } = check(formData, schemas.carrier);
  if (failed) return failed;
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator can change carriers.", null, values);

  const id = idFrom(formData);
  const name = values.name.replace(/\s+/g, " ").trim();
  const states = [...new Set(String(values.territory ?? "").split(/[,;]+/).map((x) => normalizeState(x.trim())).filter(Boolean))];
  const { data: same } = await supabase.from("agencies").select("id, name").ilike("name", `%${name.slice(0, 3)}%`).limit(500);
  const clash = (same ?? []).find((a) => a.id !== id && carrierKey(a.name) === carrierKey(name));
  if (clash) return fail(`"${clash.name}" is already on file.`, { name: `Already on file as "${clash.name}"` }, values);

  const row = { name, association: values.association || null, territory: states.length ? states.join(", ") : null };
  const { data, error } = id
    ? await supabase.from("agencies").update(row).eq("id", id).select("id")
    : await supabase.from("agencies").insert(row).select("id");
  if (error) return fail(error, null, values);
  if (!data?.length) return fail("You don't have permission to change carriers.", null, values);

  await logActivity(supabase, id ? "carrier.update" : "carrier.create", { detail: name, userId: me.id });
  revalidatePath("/insurance-companies");
  return ok({ id: data[0].id });
}
