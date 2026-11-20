/** The Match Tool (Sean, Nov 2026): what the database finds. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** match_summary(): each active project's goal, leads, developed and matched since its start, and its matches by renewal month. */
export async function getMatchSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_summary");
  if (error) throw error;
  // Each project's client's Sales Rep (Sean, Nov 2026: the list filtered by Sales Rep).
  const ids = (data ?? []).map((r) => r.project_id);
  const rep = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: projects } = await supabase.from("projects")
      .select("id, company:companies(sales_rep:users!companies_sales_rep_id_fkey(first_name, last_name))").in("id", ids.slice(i, i + 500));
    for (const p of projects ?? []) {
      const c = Array.isArray(p.company) ? p.company[0] : p.company;
      const u = Array.isArray(c?.sales_rep) ? c.sales_rep[0] : c?.sales_rep;
      if (u) rep.set(p.id, [u.first_name, u.last_name].filter(Boolean).join(" ") || null);
    }
  }
  return (data ?? []).map((r) => ({ ...r, leads: Number(r.leads), developed: Number(r.developed), matched: Number(r.matched), matches: Number(r.matches),
    sales_rep: rep.get(r.project_id) ?? null }));
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
