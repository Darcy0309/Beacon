/** Leads: lists, the lead sheet, and its activity history. */

import "server-only";
import { cityState, colorFor, fullName, initialsOf, shortDate, shortName, timeAgo } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const leadSelect = ({ status = false } = {}) => `
  id, company_name, contact_name, contact_title, phone, email, website,
  address, city, state, zip, county, sic_code, description, list_source,
  employees, covered_employees, autos, sales_volume, years_in_business,
  estimated_annual_premium, notes_dcm, notes_client, lead_date, import_date,
  date_last_worked, created_at,
  status:lead_statuses${inner(status)}(id, code, name),
  project:projects(id, name, company:companies(id, name)),
  agency:agencies(id, name),
  assigned:users!leads_assigned_user_id_fkey(id, first_name, last_name, email),
  insurance:insurance_details(*)
`;

const LEAD_SELECT = leadSelect();

/**
 * The renewal date to show in a list. Their exports often leave the
 * "ultimate" X-date blank and carry the real date on the package or
 * workers-comp line, so fall back to the soonest one on file.
 */
const XDATE_FALLBACKS = [
  "ultimate_xdate", "pkg_xdate", "wc_xdate", "auto_xdate", "health_xdate",
  "dental_xdate", "vision_xdate", "prof_liab_xdate", "do_xdate", "eo_xdate",
];

function effectiveXdate(insurance) {
  if (!insurance) return null;
  if (insurance.ultimate_xdate) return insurance.ultimate_xdate;
  const dates = XDATE_FALLBACKS.map((k) => insurance[k]).filter(Boolean).sort();
  return dates[0] ?? null;
}

/** Map a database lead row to the shape the lead views render. */
function toLeadView(row) {
  const insurance = one(row.insurance);
  const assigned = one(row.assigned);
  const status = one(row.status);
  const project = one(row.project);

  return {
    id: row.id,
    co: row.company_name,
    city: cityState(row),
    initials: initialsOf(row.company_name || ""),
    color: colorFor(row.company_name || ""),
    contact: row.contact_name ?? "—",
    phone: row.phone ?? "—",
    status: status?.code ?? "new",
    xdate: shortDate(effectiveXdate(insurance)),
    rep: shortName(assigned),
    // Full record, for the lead sheet and the edit form.
    raw: { ...row, status, project, agency: one(row.agency), assigned, insurance },
  };
}

export async function getLeads({ limit = 500 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .order("lead_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toLeadView);
}

export async function getRecentLeads(limit = 6) {
  return (await getLeads({ limit })).slice(0, limit);
}

/** Just enough of each lead to fill a picker: id, company and city. */
export async function getLeadOptions({ limit = 300 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, company_name, city, state")
    .order("company_name")
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((l) => ({ id: l.id, co: l.company_name, city: cityState(l) }));
}

/** One page of leads for the leads table, searched and filtered in the database. */
export async function listLeads(params) {
  const supabase = await createClient();
  const { rows, total } = await runPaged(
    (p) =>
      paged(
        supabase
          .from("leads")
          .select(leadSelect({ status: Boolean(p.filters?.status) }), { count: "exact" })
          .order("lead_date", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false }),
        p,
        {
          search: ["company_name", "contact_name", "city", "phone", "email"],
          columns: { status: "status.code" },
        }
      ),
    params
  );
  return { rows: rows.map(toLeadView), total };
}

export async function getLead(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select(LEAD_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toLeadView(data) : null;
}

export async function getLeadsByProject(projectId, { limit = 25 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("project_id", projectId)
    .order("lead_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toLeadView);
}

/** Totals per status code and the number of clients with leads, for the leads page header and chips. */
export async function getLeadCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_counts");
  if (error) throw error;
  return { total: data?.total ?? 0, counts: data?.counts ?? {}, clients: data?.clients ?? 0 };
}

/** Appointments and call history for one lead. */
export async function getLeadActivity(leadId) {
  const supabase = await createClient();
  const [appts, calls] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, appt_date, appt_time, duration_min, rep_name, status:appointment_statuses(name)")
      .eq("lead_id", leadId)
      .order("appt_date", { ascending: false }),
    supabase
      .from("call_records")
      .select("id, call_date, call_result, notes, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("call_date", { ascending: false })
      .limit(20),
  ]);

  return {
    appointments: (appts.data ?? []).map((a) => ({
      id: a.id,
      date: shortDate(a.appt_date),
      time: a.appt_time,
      duration: a.duration_min ?? 30,
      rep: a.rep_name ?? "—",
      status: one(a.status)?.name ?? "—",
    })),
    calls: (calls.data ?? []).map((c) => ({
      id: c.id,
      result: c.call_result ?? "Call",
      notes: c.notes,
      when: timeAgo(c.call_date),
      by: fullName(one(c.user)) || "—",
    })),
  };
}
