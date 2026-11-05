/** The Match Tool (Sean, Nov 2026): what the database finds. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** match_summary(): each active project's goal, leads, developed and matched since its start, and its matches by renewal month. */
export async function getMatchSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_summary");
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, leads: Number(r.leads), developed: Number(r.developed), matched: Number(r.matched), matches: Number(r.matches) }));
}

/** project_matches(): a project's names we have elsewhere with a renewal date, the record matched, soonest renewal first. */
export async function getProjectMatches(projectId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_matches", { p_project: projectId });
  if (error) throw error;
  return data ?? [];
}
