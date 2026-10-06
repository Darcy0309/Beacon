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
  date_last_worked, created_at, decision_maker, dm_title, fax,
  stage, call_weight, original_xdate, promoted_at,
  status:lead_statuses${inner(status)}(id, code, name),
  result:call_results(id, name, viable, callable, project_type),
  project:projects!leads_project_id_fkey(id, name, type:project_types(code), company:companies(id, name)),
  source:projects!leads_source_project_id_fkey(id, name),
  developer:users!leads_dbdv_user_id_fkey(id, first_name, last_name, email),
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
    raw: {
      ...row, status, project, agency: one(row.agency), assigned, insurance,
      result: one(row.result),
      projectType: one(project?.type)?.code ?? null,
      source: one(row.source),
      developer: one(row.developer),
      renewal: effectiveXdate(insurance),
    },
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

/**
 * Leads matching what someone typed into a lead picker: company, contact,
 * phone or city, best 20. Searching the database means every lead can be
 * found, not just the first few hundred.
 */
export async function searchLeadOptions(q) {
  const supabase = await createClient();
  const { data, error } = await paged(
    supabase.from("leads").select("id, company_name, contact_name, city, state").order("company_name").order("id"),
    { q, perPage: 20 },
    // search_text: company, contact, city, email and phone (also as digits), indexed.
    { search: ["search_text"] }
  );
  if (error) throw error;
  return (data ?? []).map((l) => ({ id: l.id, co: l.company_name, contact: l.contact_name, city: cityState(l) }));
}

/**
 * One page of leads for a leads table, searched and filtered in the
 * database. `projectId` narrows it to one project, where it can also be
 * filtered by rep.
 */
export async function listLeads(params, { projectId } = {}) {
  const supabase = await createClient();
  const { rows, total } = await runPaged(
    (p) => {
      let query = supabase
        .from("leads")
        .select(leadSelect({ status: Boolean(p.filters?.status) }), { count: "exact" })
        .order("lead_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
      if (projectId) query = query.eq("project_id", Number(projectId));
      return paged(query, p, {
        // search_text: company, contact, city, email and phone (also as digits), indexed.
        search: ["search_text"],
        columns: { status: "status.code", rep: "assigned_user_id" },
      });
    },
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

/** Totals per status code and the number of clients with leads, for the leads page header and chips. */
export async function getLeadCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_counts");
  if (error) throw error;
  return { total: data?.total ?? 0, counts: data?.counts ?? {}, clients: data?.clients ?? 0 };
}

/** Appointments, call history and the emails sent to its contact, for one lead. */
export async function getLeadActivity(leadId) {
  const supabase = await createClient();
  const [appts, calls, emails] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, appt_date, appt_time, duration_min, rep_name, qa_status, confirmed_at, invalid_at, status:appointment_statuses(name), setter:users!appointments_user_id_fkey(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("appt_date", { ascending: false }),
    supabase
      .from("call_records")
      .select("id, call_date, call_result, notes, stage, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("call_date", { ascending: false })
      .limit(20),
    supabase
      .from("lead_emails")
      .select("id, to_address, subject, body, status, error, created_at, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
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
      qa: a.qa_status,
      setBy: fullName(one(a.setter)) || null,
    })),
    calls: (calls.data ?? []).map((c) => ({
      id: c.id,
      result: c.call_result ?? "Call",
      notes: c.notes,
      when: timeAgo(c.call_date),
      by: fullName(one(c.user)) || "—",
      stage: c.stage === "dbdev" ? "DBDev" : c.stage === "appt" ? "Appt" : null,
    })),
    emails: (emails.data ?? []).map((e) => ({
      id: e.id,
      to: e.to_address,
      subject: e.subject,
      body: e.body,
      sent: e.status === "sent",
      error: e.error,
      when: timeAgo(e.created_at),
      by: fullName(one(e.user)) || "—",
    })),
  };
}
