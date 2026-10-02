/** Lead Explorer: querying the whole book at once. */

import "server-only";
import { cache } from "react";
import { cityState, colorFor, initialsOf, shortDate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

/** The values present in the caller's own book, for the criteria pickers. */
export const getExploreOptions = cache(async function getExploreOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_explore_options");
  if (error) throw error;
  return {
    industries: data?.industries ?? [],
    states: data?.states ?? [],
    counties: data?.counties ?? [],
    statuses: data?.statuses ?? [],
    clients: data?.clients ?? [],
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
    })),
    byClient: data?.by_client ?? [],
    byState: data?.by_state ?? [],
    byMonth: data?.by_month ?? [],
    byIndustry: data?.by_industry ?? [],
    byStatus: data?.by_status ?? [],
    clientsTouched: data?.clients_touched ?? 0,
    withXdate: data?.with_xdate ?? 0,
  };
}
