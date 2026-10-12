"use server";

/** The SIC master list (Settings): codes and their descriptions. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { sicCode } from "@/lib/sic";

/**
 * Load a master list of SIC codes and descriptions ([{ code, description }]):
 * new codes are added, and a code on file takes the list's description.
 * Administrators only.
 */
export async function importSicCodes(pairs) {
  const list = (Array.isArray(pairs) ? pairs : [])
    .map((p) => ({ code: sicCode(p?.code), description: String(p?.description ?? "").trim().slice(0, 200) || null }))
    .filter((p) => p.code)
    .slice(0, 50000);
  if (!list.length) return fail("No SIC codes found in that file.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator can load SIC codes.");

  const existing = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("sic_codes").select("code, description").order("code").range(from, from + 999);
    if (error) return fail(error);
    for (const r of data ?? []) existing.set(r.code, r.description);
    if ((data ?? []).length < 1000) break;
  }
  const changes = list.filter((p) => !existing.has(p.code) || (p.description && existing.get(p.code) !== p.description));
  for (let i = 0; i < changes.length; i += 500) {
    // A code with no description in the file keeps the one on file.
    const chunk = changes.slice(i, i + 500).map((p) => ({ code: p.code, description: p.description ?? existing.get(p.code) ?? null }));
    const { error } = await supabase.from("sic_codes").upsert(chunk, { onConflict: "code" });
    if (error) return fail(error);
  }
  const added = changes.filter((p) => !existing.has(p.code)).length;
  await logActivity(supabase, "sic.import", { detail: `${added} added, ${changes.length - added} updated`, userId: me.id });
  revalidatePath("/settings");
  return ok({ added, updated: changes.length - added, total: existing.size + added });
}
