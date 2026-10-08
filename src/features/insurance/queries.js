/** Insurance carriers (agencies). */

import "server-only";
import { colorFor, initialsOf } from "@/lib/format";
import { paged, readAll, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const toCarrierView = (a, states) => ({
  id: a.id,
  name: a.name,
  initials: initialsOf(a.name || ""),
  color: colorFor(a.name || ""),
  lines: a.association ?? "—",
  association: a.association ?? "",
  territory: a.territory ?? "",
  states: a.territory ? a.territory.split(/,\s*/).length : states[a.id]?.size ?? 0,
  xdates: a.leads?.[0]?.count ?? 0,
  status: (a.leads?.[0]?.count ?? 0) > 12 ? "Preferred" : "Active",
});

/**
 * One page of carriers, searched and filtered in the database, plus the
 * whole-table figures the tiles need (every carrier's lead count and the
 * states its leads sit in — two small columns per row).
 */
/** Every carrier's name, A to Z: what the carrier fields on a lead sheet suggest. */
export async function getCarrierNames() {
  const supabase = await createClient();
  const rows = await readAll((from, to) => supabase.from("agencies").select("id, name").order("name").order("id").range(from, to));
  return [...new Set(rows.map((r) => r.name).filter(Boolean))];
}

export async function listInsuranceCompanies(params) {
  const supabase = await createClient();
  const [{ rows, total }, { data: all }, { data: leadRows }] = await Promise.all([
    runPaged(
      (p) =>
        paged(supabase.from("agencies").select("*, leads(count)", { count: "exact" }).order("name"), p, {
          search: ["name", "association"],
          columns: { lines: "association" },
        }),
      params
    ),
    supabase.from("agencies").select("id, association, territory, leads(count)"),
    supabase.from("agency_footprint").select("*"),
  ]);

  // toCarrierView reads `states[id].size`; the view already counted them.
  const states = {};
  for (const f of leadRows ?? []) states[f.agency_id] = { size: Number(f.state_count) || 0 };

  const associations = [...new Set((all ?? []).map((a) => a.association).filter(Boolean))].sort();
  return {
    rows: rows.map((a) => toCarrierView(a, states)),
    total,
    stats: (all ?? []).map((a) => toCarrierView(a, states)),
    associations,
  };
}
