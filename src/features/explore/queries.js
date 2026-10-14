/** Lead Explorer: querying the whole book at once. */

import "server-only";
import { cache } from "react";
import { cityState, colorFor, initialsOf, shortDate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

// SIC codes in their own order: by the digits (1711-04 as 171104, 78102 after 7342-02), a code like another kept apart by how it is written.
const sicOrder = (a, b) => a.replace(/\D/g, "").localeCompare(b.replace(/\D/g, "")) || a.localeCompare(b);

/**
 * Industries as "<code> – <description>", in code order (Sean, Oct 2026): the
 * description is the code's own on the SIC list, else its four-digit code's
 * (1711-04 reads as 1711's). `items`: [{ [key]: code, label, count }], where
 * the database gave a description as the label when it had one; no code
 * (leads without one) reads "No SIC code", last.
 */
async function sicLabelled(supabase, items, key) {
  const own = new Map(items.filter((i) => i[key] && i.label && i.label !== i[key]).map((i) => [i[key], i.label]));
  const prefixes = [...new Set(items.map((i) => i[key]).filter((c) => c && !own.has(c)).map((c) => String(c).slice(0, 4)))];
  const byPrefix = new Map();
  // A few hundred codes at most, read in batches so no request runs too long.
  for (let i = 0; i < prefixes.length; i += 150) {
    const { data } = await supabase.from("sic_codes").select("code, description").in("code", prefixes.slice(i, i + 150));
    for (const r of data ?? []) if (r.description) byPrefix.set(r.code, r.description);
  }
  return items
    .map((i) => {
      const code = i[key];
      if (!code) return { ...i, label: "No SIC code" };
      const description = own.get(code) ?? byPrefix.get(String(code).slice(0, 4));
      return { ...i, label: description ? `${code} – ${description}` : String(code) };
    })
    .sort((a, b) => (!a[key] ? 1 : !b[key] ? -1 : sicOrder(String(a[key]), String(b[key]))));
}

/** The values present in the caller's own book, for the criteria pickers. */
export const getExploreOptions = cache(async function getExploreOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_explore_options");
  if (error) throw error;
  return {
    industries: await sicLabelled(supabase, data?.industries ?? [], "value"),
    states: data?.states ?? [],
    counties: data?.counties ?? [],
    results: data?.results ?? [],
    clients: data?.clients ?? [],
    // The agency groups clients are in (insurance companies), each with how many clients.
    groups: data?.groups ?? [],
    carriers: data?.carriers ?? [],
    reps: (data?.reps ?? []).filter((r) => r.label),
  };
});

/**
 * Run an explorer query: one page of matching leads, the total, and the
 * breakdowns that answer "how many, and whose book are they on".
 */
export async function exploreLeads(criteria, { page = 1, perPage = PAGE_SIZE } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_explore", { criteria, page, per_page: perPage });
  if (error) throw error;
  const byIndustry = await sicLabelled(supabase, data?.by_industry ?? [], "code");
  return {
    total: data?.total ?? 0,
    rows: (data?.rows ?? []).map((r) => ({
      ...r,
      co: r.company_name || "—",
      contact: r.contact_name || "—",
      place: cityState(r),
      initials: initialsOf(r.company_name || ""),
      color: colorFor(r.company_name || ""),
      // The ultimate X-date, or else the soonest line's: the same date the months filter uses.
      xdate: shortDate(r.renewal_date ?? r.ultimate_xdate),
      rep: r.rep_name || "Unassigned",
      client: r.client_name || "—",
      group: r.agency_group || null,
      result: r.result_name ? { id: r.result_id, name: r.result_name, viable: r.result_viable } : null,
    })),
    byClient: data?.by_client ?? [],
    byState: data?.by_state ?? [],
    byMonth: data?.by_month ?? [],
    byIndustry,
    byResult: data?.by_result ?? [],
    clientsTouched: data?.clients_touched ?? 0,
    withXdate: data?.with_xdate ?? 0,
  };
}
