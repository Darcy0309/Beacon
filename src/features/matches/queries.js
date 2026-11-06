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
  // A thousand at a time: a request returns no more (Sean's 1,417 came back as 1,000; Nov 2026).
  const rows = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await supabase.rpc("project_matches", { p_project: projectId }).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/**
 * The call results a match's record may have (Sean, Nov 2026): every result's name, A to Z (one
 * name stands for it on both lists), and those left out, so Lead-Disco# and the like bring nothing in.
 */
export async function getMatchResults() {
  const supabase = await createClient();
  const [{ data: results, error }, { data: excluded, error: e2 }] = await Promise.all([
    supabase.from("call_results").select("name, project_type").order("name"),
    supabase.rpc("match_excluded_results"),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const types = new Map();
  for (const r of results ?? []) types.set(r.name, [...(types.get(r.name) ?? []), r.project_type]);
  return {
    names: [...types].map(([name, t]) => ({ name, types: t.sort() })).sort((a, b) => a.name.localeCompare(b.name)),
    excluded: excluded ?? [],
  };
}
