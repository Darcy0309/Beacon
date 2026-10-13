/** Clients (companies) with their project and lead roll-ups. */

import "server-only";
import { cityState, colorFor, initialsOf, shortName } from "@/lib/format";
import { one, readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

/**
 * Lead and appointment totals per company, plus the assigned manager, from
 * the company_rollups view — one row per company, already counted.
 */
async function companyRollups(supabase) {
  const out = { leads: {}, appts: {}, managers: {} };
  const { data, error } = await supabase.from("company_rollups").select("*");
  if (error) throw error;
  for (const r of data ?? []) {
    out.leads[r.company_id] = Number(r.lead_count) || 0;
    out.appts[r.company_id] = Number(r.appt_count) || 0;
    if (r.manager) out.managers[r.company_id] = shortName(r.manager);
  }
  return out;
}

export async function getClients() {
  const supabase = await createClient();
  const [{ data, error }, roll] = await Promise.all([
    supabase.from("companies").select("*, group:agencies(id, name)").order("name"),
    companyRollups(supabase),
  ]);
  if (error) throw error;

  const rows = data ?? [];

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    city: cityState(c),
    initials: initialsOf(c.name),
    color: colorFor(c.name),
    leads: roll.leads[c.id] || 0,
    appts: roll.appts[c.id] || 0,
    manager: roll.managers[c.id] || "Unassigned",
    contact: c.contact_name ?? "—",
    email: c.email ?? "—",
    phone: c.phone ?? "—",
    status: c.status === "active" ? "Active" : "Inactive",
    // The carrier group it belongs to, if any (an insurance company from the list).
    groupId: one(c.group)?.id ?? null,
    group: one(c.group)?.name ?? null,
    // As saved, for the edit form.
    raw: { ...c, group: undefined },
  }));
}

export async function getClient(id) {
  const rows = await getClients();
  return rows.find((c) => String(c.id) === String(id)) ?? null;
}

/** Look a client up by its slugified name, which is how the demo links work. */
export async function getClientBySlug(slug) {
  const rows = await getClients();
  const slugify = (n) =>
    String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return rows.find((c) => slugify(c.name) === slug) ?? null;
}

/**
 * The agency groups a client can be put in: the insurance companies list,
 * by name. A name on the list twice is offered once (its first entry).
 */
export async function getAgencyGroups() {
  const supabase = await createClient();
  const rows = await readAll((from, to) => supabase.from("agencies").select("id, name").order("name").order("id").range(from, to));
  const seen = new Set();
  return rows.filter((r) => r.name && !seen.has(r.name.toLowerCase()) && seen.add(r.name.toLowerCase())).map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Which agency group each client is in, for reports: { [companyId]: { id, name } },
 * only the clients that have one.
 */
export async function getClientGroups() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("id, group:agencies(id, name)").not("agency_group_id", "is", null);
  if (error) throw error;
  return Object.fromEntries((data ?? []).filter((c) => one(c.group)).map((c) => [c.id, { id: one(c.group).id, name: one(c.group).name }]));
}
