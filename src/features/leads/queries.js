/** Leads: lists, the lead sheet, and its activity history. */

import "server-only";
import { apptWhen, cityState, colorFor, fullName, initialsOf, shortDate, shortName, timeAgo } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { sicLookup } from "@/lib/sic";

const leadSelect = ({ status = false } = {}) => `
  id, company_name, contact_name, contact_title, phone, email, website,
  address, city, state, zip, county, sic_code, description, list_source,
  location, employees, covered_employees, autos, sales_volume, ein, years_in_business, professionals,
  location_ownership, building_age, building_stories, building_acres, employees_full_time, employees_part_time,
  subcontractors_pct, auto_types, drivers, travel_radius, xmod, annual_payroll, dot_number, cargo, claims_3yrs,
  estimated_annual_premium, client_note, lead_date, import_date,
  date_last_worked, updated_at, created_at, decision_maker, dm_title, fax,
  contact_mobile, dm_phone, dm_mobile, dm_email,
  contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email, producer_name,
  stage, call_weight, original_xdate, promoted_at,
  status:lead_statuses${inner(status)}(id, code, name),
  result:call_results(id, name, viable, callable, project_type),
  project:projects!leads_project_id_fkey(id, name, contact_name, type:project_types(code), company:companies(id, name)),
  source:projects!leads_source_project_id_fkey(id, name),
  developer:users!leads_dbdv_user_id_fkey(id, first_name, last_name, email),
  agency:agencies(id, name),
  assigned:users!leads_assigned_user_id_fkey(id, first_name, last_name, email),
  insurance:insurance_details(*)
`;

const LEAD_SELECT = leadSelect();

/**
 * What a list of leads shows (the leads page, a project's names): the name, its contact,
 * call result, last worked, X-date and rep. The whole record comes when it is opened or,
 * from a row's menu, edited (loadLeadForEdit): a fraction of the size, on every page of them.
 */
const leadListSelect = ({ status = false } = {}) => `
  id, company_name, contact_name, phone, city, state, sic_code, employees, lead_date, date_last_worked, updated_at, assigned_user_id,
  status:lead_statuses${inner(status)}(id, code, name),
  result:call_results(id, name, viable),
  assigned:users!leads_assigned_user_id_fkey(id, first_name, last_name, email),
  insurance:insurance_details(ultimate_xdate, pkg_xdate, wc_xdate, auto_xdate, health_xdate, dental_xdate, vision_xdate, prof_liab_xdate, do_xdate, eo_xdate)
`;

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
    sic: row.sic_code ?? null,
    employees: row.employees ?? null,
    status: status?.code ?? "new",
    // Where it stands: its call result (what the lists and the sheet show; the old status is not).
    result: one(row.result) ? { id: one(row.result).id, name: one(row.result).name, viable: one(row.result).viable } : null,
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

/** One lead as the pickers and the phone name it ({ id, co, contact, city }), by its id; null when not theirs to see. */
export async function getLeadOption(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("id, company_name, contact_name, city, state").eq("id", Number(id)).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, co: data.company_name, contact: data.contact_name, city: cityState(data) } : null;
}

/**
 * One page of leads for a leads table, searched and filtered in the
 * database. `projectId` narrows it to one project, where it can also be
 * filtered by rep. The Leads page's filters too (Sean, Oct 2026):
 * `clientId` (its projects' leads), `worked` ({ from, to }: instants), a
 * lead last called or changed between them, and `resultIds`, a lead on any
 * of those call results.
 */
/**
 * What a project's list can be narrowed and sorted by besides its call result
 * and rep (Sean, Oct 2026: the old Result Change, by the names' data):
 * employees from and to (employee_n(), the count as a number), an SIC code
 * or its start ("15" for construction), a state; and the order.
 */
export const NAME_SORTS = [
  ["", "Newest first"], ["company", "Company A–Z"], ["employees", "Employees, fewest first"],
  ["employees_desc", "Employees, most first"], ["city", "City"], ["sic", "SIC code"],
];
export function applyNameFilters(query, names = {}) {
  const num = (v) => (/^\d{1,7}$/.test(String(v ?? "")) ? Number(v) : null);
  if (num(names.empMin) != null) query = query.gte("employee_n", num(names.empMin));
  if (num(names.empMax) != null) query = query.lte("employee_n", num(names.empMax));
  // "4225-05" and "422505" are one code (sicCode).
  if (/^\d{1,8}(-\d{1,2})?$/.test(String(names.sic ?? ""))) query = query.like("sic_code", `${String(names.sic).replace("-", "")}%`);
  if (/^[A-Za-z]{2}$/.test(String(names.state ?? ""))) query = query.eq("state", String(names.state).toUpperCase());
  return query;
}
function sortNames(query, sort) {
  switch (sort) {
    case "company": return query.order("company_name", { ascending: true, nullsFirst: false }).order("id");
    case "employees": return query.order("employee_n", { ascending: true, nullsFirst: false }).order("id");
    case "employees_desc": return query.order("employee_n", { ascending: false, nullsFirst: false }).order("id");
    case "city": return query.order("city", { ascending: true, nullsFirst: false }).order("company_name").order("id");
    case "sic": return query.order("sic_code", { ascending: true, nullsFirst: false }).order("company_name").order("id");
    default: return query.order("lead_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  }
}

export async function listLeads(params, { projectId, clientId = null, worked = null, resultIds = [], names = null, sort = "" } = {}) {
  const supabase = await createClient();
  let clientProjects = null;
  if (clientId) {
    const { data, error } = await supabase.from("projects").select("id").eq("company_id", Number(clientId));
    if (error) throw error;
    clientProjects = (data ?? []).map((p) => p.id);
    if (!clientProjects.length) return { rows: [], total: 0 };
  }
  const { rows, total } = await runPaged(
    (p) => {
      let query = sortNames(supabase
        .from("leads")
        .select(leadListSelect({ status: Boolean(p.filters?.status) }), { count: "exact" }), sort);
      if (projectId) query = query.eq("project_id", Number(projectId));
      if (clientProjects) query = query.in("project_id", clientProjects);
      if (resultIds.length) query = query.in("result_id", resultIds.map(Number));
      if (names) query = applyNameFilters(query, names);
      if (worked) {
        const [from, to] = [worked.from.toISOString(), worked.to.toISOString()];
        query = query.or(`and(date_last_worked.gte.${from},date_last_worked.lt.${to}),and(updated_at.gte.${from},updated_at.lt.${to})`);
      }
      return paged(query, p, {
        // search_text: company, contact, city, email and phone (also as digits), indexed.
        search: ["search_text"],
        columns: { status: "status.code", result: "result_id", rep: "assigned_user_id" },
      });
    },
    params
  );
  return { rows: await withRepNames(supabase, rows.map(toLeadView), (l) => l.raw.assigned_user_id), total };
}

/**
 * One lead, for its sheet. Its internal notes come apart, from lead_notes,
 * which the database lets only staff read. With what its SIC code means.
 */
export async function getLead(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select(LEAD_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [{ data: internal }, { data: sic }] = await Promise.all([
    supabase.from("lead_notes").select("notes").eq("lead_id", data.id).maybeSingle(),
    // The code's own description, or its four-digit code's (1521-99 -> 1521).
    data.sic_code
      ? supabase.from("sic_codes").select("code, description").in("code", sicLookup(data.sic_code))
          .then(({ data: rows }) => ({ data: sicLookup(data.sic_code).map((c) => rows?.find((r) => r.code === c)).find(Boolean) ?? null }))
      : Promise.resolve({ data: null }),
  ]);
  return toLeadView({ ...data, internal_notes: internal?.notes ?? null, sic_description: sic?.description ?? null });
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
  const [appts, calls, emails, reminders, deliveries, callNotes] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, appt_date, appt_time, duration_min, rep_name, qa_status, confirmed_at, invalid_at, status:appointment_statuses(name), setter:users!appointments_user_id_fkey(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("appt_date", { ascending: false }),
    supabase
      .from("call_records")
      .select("id, call_date, call_result, stage, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("call_date", { ascending: false })
      .limit(20),
    supabase
      .from("lead_emails")
      .select("id, to_address, subject, body, status, error, created_at, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    // Row Level Security: my own reminders (an administrator's: everyone's).
    supabase
      .from("reminders")
      .select("id, user_id, remind_at, note, created_at, sent_at, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_deliveries")
      .select("id, to_address, result, link_only, resent, status, error, created_at, user:users(first_name, last_name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(30),
    // What was said on each call: administrators and managers only (call_notes() gives anyone else none).
    supabase.rpc("call_notes", { p_lead_id: Number(leadId) }),
  ]);
  const notesOf = new Map((callNotes.data ?? []).map((n) => [n.id, n.notes]));

  return {
    appointments: (appts.data ?? []).map((a) => ({
      id: a.id,
      // "Thu, 10/22/2026": its weekday at a glance.
      date: apptWhen(a.appt_date),
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
      notes: notesOf.get(c.id) ?? null,
      when: timeAgo(c.call_date),
      at: c.call_date,
      by: fullName(one(c.user)) || "—",
      stage: c.stage === "dbdev" ? "DBDev" : c.stage === "appt" ? "Appt" : null,
    })),
    reminders: (reminders.data ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      remindAt: m.remind_at,
      note: m.note,
      at: m.created_at,
      sent: Boolean(m.sent_at),
      by: fullName(one(m.user)) || "—",
    })),
    deliveries: (deliveries.data ?? []).map((d) => ({
      id: d.id,
      to: d.to_address,
      result: d.result,
      linkOnly: d.link_only,
      resent: d.resent,
      sent: d.status === "sent",
      error: d.error,
      at: d.created_at,
      by: fullName(one(d.user)) || "—",
    })),
    emails: (emails.data ?? []).map((e) => ({
      id: e.id,
      to: e.to_address,
      subject: e.subject,
      body: e.body,
      sent: e.status === "sent",
      error: e.error,
      when: timeAgo(e.created_at),
      at: e.created_at,
      by: fullName(one(e.user)) || "—",
    })),
  };
}

/**
 * The manager on each row whose name its reader could not see (a client cannot read the staff;
 * Sean, Oct 2026): filled in from lead_rep_names(), which gives a client the names on their own leads
 * only. `assignedOf(row)`: the row's assigned user id; rows already named are left alone.
 */
export async function withRepNames(supabase, rows, assignedOf, leadIdOf = (r) => r.id) {
  const missing = rows.filter((r) => r.rep === "Unassigned" && assignedOf(r));
  if (!missing.length) return rows;
  const { data, error } = await supabase.rpc("lead_rep_names", { p_lead_ids: missing.map(leadIdOf) });
  if (error) return rows;
  const names = new Map((data ?? []).map((n) => [n.lead_id, shortName(n)]));
  return rows.map((r) => (names.has(leadIdOf(r)) ? { ...r, rep: names.get(leadIdOf(r)) } : r));
}
