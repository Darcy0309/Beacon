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
