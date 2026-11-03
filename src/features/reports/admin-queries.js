/** The administrators' Reports (Sean, Nov 2026): the database's figures and what they name. */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";

/** report_counts() from `from` to `to`: a row a month, project and manager. */
export async function getReportCounts(from, to) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_counts", { p_from: from, p_to: to });
  if (error) throw error;
  return data ?? [];
}

/**
 * The projects and staff the figures name: { projects: { id: { name, type, client, companyId,
 * salesRepId, salesRep } }, people: { id: name }, reps: [{ id, name }] (the Sales Reps with clients) }.
 */
export async function getReportNames() {
  const supabase = await createClient();
  const [projects, people] = await Promise.all([
    supabase.from("projects").select("id, name, type:project_types(code), company:companies(id, name, sales_rep_id, rep:users!companies_sales_rep_id_fkey(id, first_name, last_name))")
      .is("deleted_at", null).limit(5000),
    supabase.from("users").select("id, first_name, last_name, email").in("role", ["admin", "manager", "agent"]).limit(2000),
  ]);
  if (projects.error) throw projects.error;
  if (people.error) throw people.error;
  const reps = new Map();
  const byId = {};
  for (const p of projects.data ?? []) {
    const co = one(p.company);
    const rep = one(co?.rep);
    if (rep) reps.set(rep.id, fullName(rep));
    byId[p.id] = { name: p.name, type: one(p.type)?.code ?? null, client: co?.name ?? "—", companyId: co?.id ?? null, salesRepId: co?.sales_rep_id ?? null, salesRep: rep ? fullName(rep) : null };
  }
  return {
    projects: byId,
    people: Object.fromEntries((people.data ?? []).map((u) => [u.id, fullName(u)])),
    reps: [...reps].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** billing_report(): each project of the active clients from `from` to `to`, a Sales Rep's alone when given. */
export async function getBillingReport(from, to, repId = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_report", { p_from: from, p_to: to, p_rep: repId });
  if (error) throw error;
  return data ?? [];
}

/** report_items(): the names behind one figure of a project's row. */
export async function getReportItems(from, to, projectId, kind) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_items", { p_from: from, p_to: to, p_project: projectId, p_kind: kind });
  if (error) throw error;
  return data ?? [];
}
