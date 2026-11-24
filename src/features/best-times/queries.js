/** The Production Heat Map (Sean and Darcy, Nov 2026; first Best Times to Call): the counts behind it. */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { withCampaign } from "@/features/campaign-types/filter";
import { weekOf, windows } from "@/lib/best-times";
import { addDays } from "@/lib/dates";

/**
 * best_times() for the filters given: every call's day and hour in the business's local time, with how many became
 * leads and appointments; and the same broken down by `by` (sic, state, type, manager). { all, byRows }.
 */
export async function getBestTimes({ from, to, client = null, project = null, manager = null, sic = null, state = null, by = "sic", campaign = null }) {
  const supabase = await createClient();
  const args = { p_from: from, p_to: to, p_company: client, p_project: project, p_user: manager, p_sic: sic, p_state: state };
  const [all, split] = await Promise.all([
    // The campaign type chosen (Campaign Types phase 4): its clients' calls only.
    withCampaign(supabase.rpc("best_times", args), campaign),
    withCampaign(supabase.rpc("best_times", { ...args, p_by: by }), campaign),
  ]);
  if (all.error) throw all.error;
  if (split.error) throw split.error;
  const shape = (r) => ({ dim: r.dim, label: r.dim_label, dow: r.dow, hour: r.hour, calls: Number(r.calls), leads: Number(r.leads), appts: Number(r.appts) });
  return { all: (all.data ?? []).map(shape), byRows: (split.data ?? []).map(shape) };
}

/**
 * Early Starts (Sean and Darcy, Nov 2026) for the same filters: each manager's first-call time, calls before and after
 * 9 AM local with what they made, and time from first call to first lead (early_starts()). A manager: their own.
 */
export async function getEarlyStarts({ from, to, client = null, project = null, manager = null, sic = null, state = null, campaign = null }) {
  const supabase = await createClient();
  const { data, error } = await withCampaign(supabase.rpc("early_starts", { p_from: from, p_to: to, p_company: client, p_project: project, p_user: manager, p_sic: sic, p_state: state }), campaign);
  if (error) throw error;
  return data ?? [];
}

/**
 * A project's Best Times to Call (Darcy, Nov 2026: "a 'Best times to call' card on each project page… built from that
 * project's history, or its industry while it's new"): its calls over the last year by day and hour; with too few to
 * judge an hour, those to businesses in its leads' main industry (their SIC's first two digits) instead. An
 * administrator or manager (a manager: the projects they're assigned to); null for anyone else, or before the
 * Production Heat Map's migration. { rows, basis: "project" | "industry", sic, from, to }.
 */
export async function getProjectBestTimes(projectId, today) {
  const supabase = await createClient();
  const from = addDays(today, -364);
  const run = (args) => supabase.rpc("best_times", { p_from: from, p_to: today, ...args });
  const shape = (r) => ({ dow: r.dow, hour: r.hour, calls: Number(r.calls), leads: Number(r.leads), appts: Number(r.appts) });
  const own = await run({ p_project: projectId });
  if (own.error) return null;
  const rows = (own.data ?? []).map(shape);
  if (windows(weekOf(rows)).best.length) return { rows, basis: "project", sic: null, from, to: today };
  // New: its leads' main industry, across the projects this person sees.
  const { data: leads } = await supabase.from("leads").select("sic_code").eq("project_id", projectId).not("sic_code", "is", null).limit(2000);
  const count = new Map();
  for (const l of leads ?? []) {
    const two = String(l.sic_code).replace(/\D/g, "").slice(0, 2);
    if (two.length === 2) count.set(two, (count.get(two) ?? 0) + 1);
  }
  const sic = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (!sic) return { rows, basis: "project", sic: null, from, to: today };
  const industry = await run({ p_sic: sic });
  if (industry.error) return { rows, basis: "project", sic: null, from, to: today };
  return { rows: (industry.data ?? []).map(shape), basis: "industry", sic, from, to: today };
}
