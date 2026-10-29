/** Clients (companies) with their project and lead roll-ups. */

import "server-only";
import { cityState, colorFor, initialsOf, mediumDate, shortName } from "@/lib/format";
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

/** A client's status as it reads: Active, Paused or Completed (the old "inactive" is Paused). */
export const CLIENT_STATUS = { active: "Active", paused: "Paused", completed: "Completed", inactive: "Paused" };

/**
 * Every client's id, name and Sales Rep, A to Z: for a drop-down. Not getClients(),
 * which counts every client's leads and appointments (company_rollups) for
 * the Clients page and made the List Builder slow to open (Oct 2026).
 */
export async function getClientNames() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("id, name, sales_rep_id").order("name").limit(5000);
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, salesRepId: c.sales_rep_id }));
}

export async function getClients() {
  const supabase = await createClient();
  const [{ data, error }, roll] = await Promise.all([
    supabase.from("companies").select(`*, group:agencies(id, name), zone:timezones(id, name),
      sales_rep:users!companies_sales_rep_id_fkey(id, first_name, last_name), watchers:client_watchers(user_id, by_email)`).order("name"),
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
    status: CLIENT_STATUS[c.status] ?? "Paused",
    state: c.state ?? null,
    // Its time zone, and when its work with us starts and ends.
    zone: one(c.zone)?.name ?? null,
    start: c.subscription_start ? mediumDate(c.subscription_start) : null,
    end: c.subscription_end ? mediumDate(c.subscription_end) : null,
    endsOn: c.subscription_end ?? null,
    // Its branding: the logo (a path in the public-images bucket) and website.
    logoPath: c.logo_path ?? null,
    website: c.website ?? null,
    // The carrier group it belongs to, if any (an insurance company from the list).
    groupId: one(c.group)?.id ?? null,
    group: one(c.group)?.name ?? null,
    // Who owns it (Sean, Oct 2026): its Sales Rep, an administrator or manager; and who hears about it.
    salesRepId: one(c.sales_rep)?.id ?? null,
    salesRep: one(c.sales_rep) ? shortName(one(c.sales_rep)) : null,
    // As saved, for the edit form.
    raw: { ...c, group: undefined, zone: undefined, sales_rep: undefined, watchers: (c.watchers ?? []).map((w) => ({ id: w.user_id, email: w.by_email })),
      status: c.status === "inactive" ? "paused" : c.status },
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

/** The time zones a client can be in: [{ id, name }]. */
export async function getTimeZones() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("timezones").select("id, name").order("id");
  if (error) throw error;
  return data ?? [];
}

/**
 * The Clients page's figures for the active clients: their leads and
 * appointments counted by call result (clients_totals()), and what was
 * developed for them over each tile's own range (clients_chart(): days,
 * and hours for a single day, as the production chart reads them).
 * `leads` and `appts`: { from, to }.
 */
export async function getClientsOverview({ leads, appts }, companies = null) {
  const supabase = await createClient();
  // `companies`: only these clients' (Oct 2026: a Sales Rep's, picked on the list); every active client's when null.
  const only = companies ? { p_companies: companies } : {};
  const chart = (r) => supabase.rpc("clients_chart", { p_from: r.from, p_to: r.to, ...only });
  const same = leads.from === appts.from && leads.to === appts.to;
  const [totals, a, b] = await Promise.all([supabase.rpc("clients_totals", only), chart(leads), same ? null : chart(appts)]);
  for (const r of [totals, a, b]) if (r?.error) throw r.error;
  const shape = (d) => ({ days: d?.days ?? [], hours: d?.hours ?? [] });
  const t = totals.data?.[0] ?? {};
  return {
    leadsActive: Number(t.leads_active ?? 0), leadsResolved: Number(t.leads_resolved ?? 0),
    appointments: Number(t.appointments ?? 0), invalid: Number(t.invalid_appointments ?? 0),
    leads: shape(a.data), appts: shape((b ?? a).data),
  };
}
