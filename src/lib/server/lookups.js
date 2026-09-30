/** Reference data behind the record forms' dropdowns (statuses, types, people…). */

import "server-only";
import { cache } from "react";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** All ten option lists in one request — the get_lookups() SQL function. Cached per request. */
export const getLookups = cache(async function getLookups() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_lookups");
  if (error) throw error;
  const d = data ?? {};
  return {
    statuses: d.statuses ?? [],
    apptStatuses: d.apptStatuses ?? [],
    projectTypes: d.projectTypes ?? [],
    projectStatuses: d.projectStatuses ?? [],
    natures: d.natures ?? [],
    fbStatuses: d.fbStatuses ?? [],
    projects: d.projects ?? [],
    managers: (d.managers ?? []).map((m) => ({ ...m, name: fullName(m) })),
    agencies: d.agencies ?? [],
    companies: d.companies ?? [],
  };
});
