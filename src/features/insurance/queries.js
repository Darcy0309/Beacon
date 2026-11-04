/** Insurance carriers (agencies). */

import "server-only";
import { colorFor, initialsOf } from "@/lib/format";
import { pageInfo } from "@/lib/paging";
import { US_STATES } from "@/lib/project-info";
import { matchesAll, searchWords } from "@/lib/search-words";
import { readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const toCarrierView = (a, f) => ({
  id: a.id,
  name: a.name,
  initials: initialsOf(a.name || ""),
  color: colorFor(a.name || ""),
  lines: a.association ?? "—",
  association: a.association ?? "",
  territory: a.territory ?? "",
  // From the carrier fields on our leads (carrier_footprint): the states they're in, with the leads in each, and how many.
  stateCodes: [...(f?.states ?? [])].sort(),
  byState: Object.fromEntries(Object.entries(f?.by_state ?? {}).map(([st, n]) => [st, Number(n)])),
  states: f?.states?.length ?? 0,
  xdates: Number(f?.leads ?? 0),
  // The clients with it among their Top Carriers, on their projects' Project Info (Sean, Nov 2026).
  clients: Number(f?.clients ?? 0),
});

/** Every carrier's name, A to Z: what the carrier fields on a lead sheet suggest. */
export async function getCarrierNames() {
  const supabase = await createClient();
  const rows = await readAll((from, to) => supabase.from("agencies").select("id, name").order("name").order("id").range(from, to));
  return [...new Set(rows.map((r) => r.name).filter(Boolean))];
}

/**
 * One page of carriers (Sean, Nov 2026), each with the states its leads are in, its leads (X-dates)
 * there and the clients they're for: those with leads first, A to Z, then the rest, A to Z. Picked
 * states (?states=AZ,NM) count those states alone and list just the carriers with leads in them; the
 * search matches the name. Sorted, searched and paged here: a few hundred carriers, their figures
 * counted once in the database.
 */
export async function listInsuranceCompanies(params) {
  const supabase = await createClient();
  const states = statesOf(params.filters?.states);
  const [all, footprint] = await Promise.all([
    readAll((from, to) => supabase.from("agencies").select("*").is("deleted_at", null).order("name").order("id").range(from, to)),
    supabase.rpc("carrier_footprint", { p_states: states.length ? states : null }),
  ]);
  if (footprint.error) throw footprint.error;
  const byId = new Map((footprint.data ?? []).map((f) => [Number(f.agency_id), f]));
  const carriers = all.map((a) => toCarrierView(a, byId.get(Number(a.id))));
  const words = searchWords(params.q);
  const shown = carriers
    .filter((c) => (!states.length || c.xdates > 0) && (!words.length || matchesAll(c.name ?? "", words)))
    .sort((a, b) => Number(b.xdates > 0) - Number(a.xdates > 0) || (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) || a.id - b.id);
  const info = pageInfo(shown.length, params.page, params.perPage);
  return {
    rows: shown.slice(info.from ? info.from - 1 : 0, info.to),
    total: shown.length,
    carriers: carriers.length,
    withLeads: carriers.filter((c) => c.xdates > 0).length,
    states,
  };
}

/** The states picked (?states=AZ,NM), as their two letters; anything else dropped. */
export const statesOf = (v) => [...new Set(String(v ?? "").toUpperCase().split(",").map((s) => s.trim()).filter((s) => US_STATES.includes(s)))];

/** One carrier, by id: { id, name, association, territory }, or null. */
export async function getCarrier(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agencies").select("id, name, association, territory").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data;
}

/** The clients a carrier is a Top Carrier of, each with its leads (X-dates) naming the carrier, in the states picked. */
export async function getCarrierClients(id, states = []) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("carrier_clients", { p_agency: id, p_states: states.length ? states : null });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, xdates: Number(r.xdates), states: [...(r.states ?? [])].sort() }));
}

/** A client's leads (X-dates) naming the carrier, in the states picked: the business, its place, project, renewals and lines. */
export async function getCarrierClientLeads(id, companyId, states = []) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("carrier_client_leads", { p_agency: id, p_company: companyId, p_states: states.length ? states : null });
  if (error) throw error;
  return data ?? [];
}
