"use server";

/** The Match Tool (Sean, Nov 2026): bringing a project's matches in. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

/**
 * Bring `leadIds` (a project's matches) in: to its DB Dev list at Viable-Staged with their renewal
 * dates, or on to its appointment project as leads. Each is checked again in the database, so one
 * matched since, or no longer a match, is skipped. Administrators only.
 */
export async function addMatches(projectId, leadIds, to) {
  const project = Number(projectId);
  const ids = [...new Set((Array.isArray(leadIds) ? leadIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 5000);
  if (!Number.isInteger(project) || project <= 0) return fail("Choose a project.");
  if (!["dbdev", "appt"].includes(to)) return fail("Choose DB Dev or the appointment project.");
  if (!ids.length) return fail("No matches to add for that choice.");

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator can add matches.");
  const { data, error } = await supabase.rpc("add_matches", { p_project: project, p_leads: ids, p_to: to });
  if (error) return fail(error);
  await logActivity(supabase, "matches.add", { entity: "project", entityId: project, detail: `${data ?? 0} matches to ${to === "appt" ? "the appointment project" : "DB Dev"}`, userId: me.id });
  revalidatePath("/reports/matches");
  revalidatePath(`/reports/matches/${project}`);
  return ok({ added: data ?? 0, skipped: ids.length - (data ?? 0) });
}

/** The call results a match's record may not have (the rest qualify), as an administrator chooses them. */
export async function setMatchResults(excluded) {
  const names = [...new Set((Array.isArray(excluded) ? excluded : []).map((n) => String(n ?? "").trim()).filter(Boolean))].slice(0, 200);
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator can choose these.");
  const { error } = await supabase.from("app_settings").upsert({ key: "match_results", value: { exclude: names }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return fail(error);
  await logActivity(supabase, "matches.results", { entity: "setting", detail: `${names.length} call results left out of matching`, userId: me.id });
  revalidatePath("/reports/matches", "layout");
  return ok({ excluded: names });
}
