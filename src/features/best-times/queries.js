/** The Production Heat Map (Sean and Darcy, Nov 2026; first Best Times to Call): the counts behind it. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * best_times() for the filters given: every call's day and hour in the business's local time, with how many became
 * leads and appointments; and the same broken down by `by` (sic, state, type, manager). { all, byRows }.
 */
export async function getBestTimes({ from, to, client = null, project = null, manager = null, sic = null, state = null, by = "sic" }) {
  const supabase = await createClient();
  const args = { p_from: from, p_to: to, p_company: client, p_project: project, p_user: manager, p_sic: sic, p_state: state };
  const [all, split] = await Promise.all([
    supabase.rpc("best_times", args),
    supabase.rpc("best_times", { ...args, p_by: by }),
  ]);
  if (all.error) throw all.error;
  if (split.error) throw split.error;
  const shape = (r) => ({ dim: r.dim, label: r.dim_label, dow: r.dow, hour: r.hour, calls: Number(r.calls), leads: Number(r.leads), appts: Number(r.appts) });
  return { all: (all.data ?? []).map(shape), byRows: (split.data ?? []).map(shape) };
}
