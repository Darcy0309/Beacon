/** Clients (companies) with their project and lead roll-ups. */

import "server-only";
import { cityState, colorFor, initialsOf, shortName } from "@/lib/format";
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
    supabase.from("companies").select("*").order("name"),
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
