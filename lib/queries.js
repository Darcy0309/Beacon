import "server-only";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Shared select fragments
// ---------------------------------------------------------------------------

// leads has two FKs to users, so the relationship must be named explicitly.
const LEAD_SELECT = `
  id, company_name, contact_name, contact_title, phone, email, website,
  address, city, state, zip, county, territory, sic_code,
  description, list_source, producer_name, broker, employees, covered_employees,
  autos, sales_volume, years_in_business, estimated_annual_premium,
  reason_to_change, location, call_result_appt, call_result_dbdv,
  notes_dcm, notes_client, lead_date, import_date, shopping_date,
  qa_date_dbdv, qa_date_appt, date_last_worked, created_at,
  status:lead_statuses(id, code, name),
  project:projects(id, name, company:companies(id, name)),
  agency:agencies(id, name),
  assigned:users!leads_assigned_user_id_fkey(id, first_name, last_name, email),
  insurance:insurance_details(*)
`;

const APPT_SELECT = `
  id, appt_date, appt_time, duration_min, rep_name, list_source,
  call_result_dbdv, qa_date, date_last_worked, appt_create_date, active,
  status:appointment_statuses(id, name),
  user:users(id, first_name, last_name, email),
  lead:leads(
    id, company_name, contact_name, phone, city, state,
    status:lead_statuses(id, code, name),
    project:projects(id, name)
  )
`;

/** Unwrap PostgREST embedded rows that come back as arrays. */
const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// ---------------------------------------------------------------------------
// Session / identity
// ---------------------------------------------------------------------------

/** The signed-in user's application profile (role, name, company). */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*, company:companies(id, name), user_type:user_types(id, code, description)")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { ...data, authEmail: user.email };
}

// ---------------------------------------------------------------------------
// Lookups — the dropdown options shared by every record form.
// ---------------------------------------------------------------------------

export async function getLookups() {
  const supabase = await createClient();
  const [statuses, apptStatuses, projectTypes, projectStatuses, natures, fbStatuses, projects, managers, agencies, companies, timezones] =
    await Promise.all([
      supabase.from("lead_statuses").select("id, code, name").order("id"),
      supabase.from("appointment_statuses").select("id, name").order("id"),
      supabase.from("project_types").select("id, code, description").order("id"),
      supabase.from("project_statuses").select("id, name").order("id"),
      supabase.from("nature_of_enquiry").select("id, name").order("id"),
      supabase.from("fb_statuses").select("id, name").order("id"),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("users").select("id, first_name, last_name, email, role").in("role", ["manager", "agent"]).order("id"),
      supabase.from("agencies").select("id, name").order("name"),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("timezones").select("id, name").order("id"),
    ]);

  return {
    statuses: statuses.data ?? [],
    apptStatuses: apptStatuses.data ?? [],
    projectTypes: projectTypes.data ?? [],
    projectStatuses: projectStatuses.data ?? [],
    natures: natures.data ?? [],
    fbStatuses: fbStatuses.data ?? [],
    projects: projects.data ?? [],
    managers: managers.data ?? [],
    agencies: agencies.data ?? [],
    companies: companies.data ?? [],
    timezones: timezones.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function getLeads({ status, q, limit = 200 } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from(  "leads")
    .select(LEAD_SELECT)
    .order("lead_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,city.ilike.%${q}%,phone.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []).map(normalizeLead);
  if (status) rows = rows.filter((l) => l.status?.code === status);
  return rows;
}

export async function getLead(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeLead(data) : null;
}

/** Leads belonging to one project (project detail page). */
export async function getLeadsByProject(projectId, { limit = 25 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("project_id", projectId)
    .order("lead_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(normalizeLead);
}

/** Projects belonging to one client company (client detail page). */
export async function getProjectsByCompany(companyId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      company:companies(id, name),
      type:project_types(id, code, description),
      status:project_statuses(id, name),
      assignments:project_assignments(
        ae:users!project_assignments_ae_user_id_fkey(id, first_name, last_name)
      ),
      leads(count)
    `)
    .eq("company_id", companyId)
    .order("id");
  if (error) throw error;
  return (data ?? []).map(normalizeProject);
}

export async function getLeadStatusCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("status:lead_statuses(code, name)");
  if (error) throw error;

  const counts = {};
  for (const row of data ?? []) {
    const code = one(row.status)?.code;
    if (code) counts[code] = (counts[code] || 0) + 1;
  }
  return { total: (data ?? []).length, counts };
}

function normalizeLead(row) {
  const insurance = Array.isArray(row.insurance) ? row.insurance[0] ?? null : row.insurance;
  return {
    ...row,
    status: one(row.status),
    project: one(row.project),
    agency: one(row.agency),
    assigned: one(row.assigned),
    insurance,
    xdate: insurance?.ultimate_xdate ?? null,
  };
}

/** Appointments + call history for a single lead. */
export async function getLeadActivity(leadId) {
  const supabase = await createClient();
  const [appts, calls] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, appt_date, appt_time, duration_min, rep_name, status:appointment_statuses(id, name)")
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
    appointments: (appts.data ?? []).map((a) => ({ ...a, status: one(a.status) })),
    calls: (calls.data ?? []).map((c) => ({ ...c, user: one(c.user) })),
  };
}

// ---------------------------------------------------------------------------
// Appointments / calendar
// ---------------------------------------------------------------------------

export async function getAppointments({ from, to, limit = 300 } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(APPT_SELECT)
    .order("appt_date", { ascending: true })
    .limit(limit);

  if (from) query = query.gte("appt_date", from);
  if (to) query = query.lte("appt_date", to);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((a) => {
    const lead = one(a.lead);
    return {
      ...a,
      status: one(a.status),
      user: one(a.user),
      lead: lead ? { ...lead, status: one(lead.status), project: one(lead.project) } : null,
    };
  });
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Today's and tomorrow's appointments, for the dashboard. */
export async function getUpcomingAppointments() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const rows = await getAppointments({ from: isoDay(today), to: isoDay(tomorrow) });
  return {
    today: rows.filter((a) => a.appt_date === isoDay(today)),
    tomorrow: rows.filter((a) => a.appt_date === isoDay(tomorrow)),
  };
}

/** Appointments for a calendar month, keyed by day-of-month. */
export async function getCalendarMonth(year, month /* 0-indexed */) {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const rows = await getAppointments({ from: isoDay(first), to: isoDay(last) });

  const byDay = {};
  for (const a of rows) {
    const day = Number(String(a.appt_date).slice(8, 10));
    (byDay[day] ||= []).push(a);
  }
  return { rows, byDay };
}

// ---------------------------------------------------------------------------
// Companies ("Clients") and projects
// ---------------------------------------------------------------------------

export async function getCompanies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*, timezone:timezones(name), projects(id, name)")
    .order("name");
  if (error) throw error;

  const companies = data ?? [];
  const counts = await getCountsByCompany(companies.map((c) => c.id));

  return companies.map((c) => ({
    ...c,
    timezone: one(c.timezone),
    projectCount: (c.projects ?? []).length,
    leadCount: counts.leads[c.id] || 0,
    apptCount: counts.appts[c.id] || 0,
    manager: counts.managers[c.id] || null,
  }));
}

export async function getCompany(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*, timezone:timezones(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const counts = await getCountsByCompany([data.id]);
  return {
    ...data,
    timezone: one(data.timezone),
    leadCount: counts.leads[data.id] || 0,
    apptCount: counts.appts[data.id] || 0,
    manager: counts.managers[data.id] || null,
  };
}

/** Lead/appointment totals and assigned manager, grouped by company. */
async function getCountsByCompany(companyIds) {
  const result = { leads: {}, appts: {}, managers: {} };
  if (!companyIds?.length) return result;

  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, company_id, assignments:project_assignments(ae:users!project_assignments_ae_user_id_fkey(first_name, last_name))")
    .in("company_id", companyIds);

  const projectToCompany = {};
  for (const p of projects ?? []) {
    projectToCompany[p.id] = p.company_id;
    const ae = one((p.assignments ?? [])[0]?.ae);
    if (ae && !result.managers[p.company_id]) result.managers[p.company_id] = ae;
  }

  const projectIds = Object.keys(projectToCompany).map(Number);
  if (!projectIds.length) return result;

  const { data: leads } = await supabase
    .from("leads")
    .select("id, project_id")
    .in("project_id", projectIds);

  const leadToCompany = {};
  for (const l of leads ?? []) {
    const companyId = projectToCompany[l.project_id];
    if (!companyId) continue;
    leadToCompany[l.id] = companyId;
    result.leads[companyId] = (result.leads[companyId] || 0) + 1;
  }

  const leadIds = Object.keys(leadToCompany).map(Number);
  if (leadIds.length) {
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, lead_id")
      .in("lead_id", leadIds);
    for (const a of appts ?? []) {
      const companyId = leadToCompany[a.lead_id];
      if (companyId) result.appts[companyId] = (result.appts[companyId] || 0) + 1;
    }
  }

  return result;
}

export async function getProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      company:companies(id, name),
      type:project_types(id, code, description),
      status:project_statuses(id, name),
      assignments:project_assignments(
        ae:users!project_assignments_ae_user_id_fkey(id, first_name, last_name)
      ),
      leads(count)
    `)
    .order("id");
  if (error) throw error;

  return (data ?? []).map(normalizeProject);
}

export async function getProject(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      company:companies(id, name, city, state, contact_name, email, phone),
      type:project_types(id, code, description),
      status:project_statuses(id, name),
      assignments:project_assignments(
        ae:users!project_assignments_ae_user_id_fkey(id, first_name, last_name, email)
      ),
      leads(count)
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeProject(data) : null;
}

function normalizeProject(row) {
  return {
    ...row,
    company: one(row.company),
    type: one(row.type),
    status: one(row.status),
    manager: one((row.assignments ?? [])[0]?.ae),
    leadCount: row.leads?.[0]?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function getUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*, user_type:user_types(id, code, description), company:companies(id, name)")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((u) => ({
    ...u,
    user_type: one(u.user_type),
    company: one(u.company),
  }));
}

/** Account managers with their workload, for the Account Managers screen. */
export async function getAccountManagers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*, assignments:project_assignments!project_assignments_ae_user_id_fkey(project:projects(id, name, company_id))")
    .eq("role", "manager")
    .order("id");
  if (error) throw error;

  const managers = data ?? [];
  const { data: leads } = await supabase.from("leads").select("id, assigned_user_id");
  const { data: appts } = await supabase.from("appointments").select("id, user_id");

  const leadCount = {};
  for (const l of leads ?? []) if (l.assigned_user_id) leadCount[l.assigned_user_id] = (leadCount[l.assigned_user_id] || 0) + 1;
  const apptCount = {};
  for (const a of appts ?? []) if (a.user_id) apptCount[a.user_id] = (apptCount[a.user_id] || 0) + 1;

  return managers.map((m) => {
    const projects = (m.assignments ?? []).map((a) => one(a.project)).filter(Boolean);
    const companyIds = new Set(projects.map((p) => p.company_id).filter(Boolean));
    return {
      ...m,
      projects,
      clientCount: companyIds.size,
      leadCount: leadCount[m.id] || 0,
      apptCount: apptCount[m.id] || 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Agencies ("Insurance Companies")
// ---------------------------------------------------------------------------

export async function getAgencies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("*, leads(count)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((a) => ({ ...a, leadCount: a.leads?.[0]?.count ?? 0 }));
}

// ---------------------------------------------------------------------------
// Engagement: feedback, QA, bulletin, documents
// ---------------------------------------------------------------------------

export async function getFeedback() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select(`
      *,
      nature:nature_of_enquiry(id, name),
      fb_status:fb_statuses(id, name),
      lead:leads(id, company_name),
      appointment:appointments(id, appt_date)
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).map((f) => ({
    ...f,
    nature: one(f.nature),
    fb_status: one(f.fb_status),
    lead: one(f.lead),
    appointment: one(f.appointment),
  }));

  const rated = rows.filter((r) => typeof r.rating === "number");
  const avg = rated.length
    ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10
    : 0;
  const promoters = rated.length
    ? Math.round((rated.filter((r) => r.rating >= 4).length / rated.length) * 100)
    : 0;

  return { rows, summary: { avg, total: rows.length, promoters } };
}

export async function getQaCalls({ limit = 40 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_records")
    .select(`
      id, call_date, call_result, notes, qa_score, qa_result, qa_date,
      user:users(id, first_name, last_name),
      lead:leads(id, company_name, city, state)
    `)
    .not("qa_score", "is", null)
    .order("call_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, user: one(c.user), lead: one(c.lead) }));
}

export async function getBulletin() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bulletin_board")
    .select("*, user:users(id, first_name, last_name), project:projects(id, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => ({ ...b, user: one(b.user), project: one(b.project) }));
}

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, company:companies(id, name), project:projects(id, name), uploader:users(id, first_name, last_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...d,
    company: one(d.company),
    project: one(d.project),
    uploader: one(d.uploader),
  }));
}

// ---------------------------------------------------------------------------
// Data & insights: imports, alerts, reports
// ---------------------------------------------------------------------------

export async function getImports() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*, project:projects(id, name), importer:users(id, first_name, last_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({
    ...i,
    project: one(i.project),
    importer: one(i.importer),
  }));
}

export async function getAlerts() {
  const supabase = await createClient();
  const [rules, log] = await Promise.all([
    supabase.from("alert_rules").select("*").order("id"),
    supabase
      .from("alert_log")
      .select("*, rule:alert_rules(id, name)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (rules.error) throw rules.error;
  return {
    rules: rules.data ?? [],
    log: (log.data ?? []).map((l) => ({ ...l, rule: one(l.rule) })),
  };
}

export async function getSettings() {
  const supabase = await createClient();
  const [settings, ips] = await Promise.all([
    supabase.from("app_settings").select("*"),
    supabase.from("ip_whitelist").select("*").order("id"),
  ]);
  const map = {};
  for (const row of settings.data ?? []) map[row.key] = row.value;
  return { settings: map, ipWhitelist: ips.data ?? [] };
}

// ---------------------------------------------------------------------------
// Dashboard + reports aggregates
// ---------------------------------------------------------------------------

export async function getDashboard() {
  const supabase = await createClient();
  const today = isoDay(new Date());

  const [leadAgg, apptToday, apptAll, companies, upcoming, bulletin] = await Promise.all([
    supabase.from("leads").select("id, lead_date, created_at, status:lead_statuses(code)"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("appt_date", today),
    supabase.from("appointments").select("id, appt_date"),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "active"),
    getUpcomingAppointments(),
    supabase
      .from("bulletin_board")
      .select("*, user:users(first_name, last_name)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const leads = leadAgg.data ?? [];
  const appts = apptAll.data ?? [];

  const byStatus = {};
  for (const l of leads) {
    const code = one(l.status)?.code;
    if (code) byStatus[code] = (byStatus[code] || 0) + 1;
  }

  // Lead volume for the last 8 weeks (drives the dashboard chart).
  const DAY = 86400000;
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => ({
    label: i === 7 ? "Now" : `W${i + 1}`,
    start: now - (8 - i) * 7 * DAY,
    end: now - (7 - i) * 7 * DAY,
    leads: 0,
  }));
  for (const l of leads) {
    const t = new Date(l.lead_date || l.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const w = weeks.find((w) => t >= w.start && t < w.end);
    if (w) w.leads++;
  }

  // Month-over-month movement for the stat tiles.
  const monthAgo = now - 30 * DAY;
  const twoMonthsAgo = now - 60 * DAY;
  const leadsThisMonth = leads.filter((l) => {
    const t = new Date(l.lead_date || l.created_at).getTime();
    return t >= monthAgo;
  }).length;
  const leadsPrevMonth = leads.filter((l) => {
    const t = new Date(l.lead_date || l.created_at).getTime();
    return t >= twoMonthsAgo && t < monthAgo;
  }).length;

  const weekAgo = now - 7 * DAY;
  const apptsThisWeek = appts.filter((a) => new Date(a.appt_date).getTime() >= weekAgo).length;
  const apptsPrevWeek = appts.filter((a) => {
    const t = new Date(a.appt_date).getTime();
    return t >= now - 14 * DAY && t < weekAgo;
  }).length;

  const pctChange = (curr, prev) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 1000) / 10;

  const recentLeads = await getLeads({ limit: 6 });
  const reps = await getRepPerformance();

  return {
    stats: {
      totalLeads: leads.length,
      apptToday: apptToday.count ?? 0,
      apptsThisWeek,
      hotLeads: byStatus.hot || 0,
      activeClients: companies.count ?? 0,
      conversion: leads.length ? Math.round((appts.length / leads.length) * 1000) / 10 : 0,
    },
    deltas: {
      leads: pctChange(leadsThisMonth, leadsPrevMonth),
      appts: apptsThisWeek - apptsPrevWeek,
    },
    weeks,
    byStatus,
    recentLeads,
    upcoming,
    reps,
    bulletin: (bulletin.data ?? []).map((b) => ({ ...b, user: one(b.user) })),
  };
}

/** Appointments set per account manager, for the dashboard bars. */
export async function getRepPerformance() {
  const supabase = await createClient();
  const { data: managers } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .in("role", ["manager", "agent"])
    .order("id");
  const { data: appts } = await supabase.from("appointments").select("id, user_id");

  const counts = {};
  for (const a of appts ?? []) if (a.user_id) counts[a.user_id] = (counts[a.user_id] || 0) + 1;

  const rows = (managers ?? [])
    .map((m) => ({ ...m, appts: counts[m.id] || 0 }))
    .filter((m) => m.appts > 0)
    .sort((a, b) => b.appts - a.appts)
    .slice(0, 5);

  const max = rows[0]?.appts || 1;
  return rows.map((r) => ({ ...r, pct: Math.round((r.appts / max) * 100) }));
}

export async function getReports() {
  const supabase = await createClient();
  const [leads, appts, projects, feedback] = await Promise.all([
    supabase.from("leads").select("id, created_at, lead_date, state, status:lead_statuses(code, name), project_id"),
    supabase.from("appointments").select("id, appt_date, status:appointment_statuses(name)"),
    getProjects(),
    supabase.from("feedback").select("rating"),
  ]);

  const leadRows = leads.data ?? [];
  const apptRows = appts.data ?? [];

  const byStatus = {};
  for (const l of leadRows) {
    const s = one(l.status);
    if (s?.name) byStatus[s.name] = (byStatus[s.name] || 0) + 1;
  }

  const byState = {};
  for (const l of leadRows) if (l.state) byState[l.state] = (byState[l.state] || 0) + 1;

  const apptByStatus = {};
  for (const a of apptRows) {
    const s = one(a.status);
    if (s?.name) apptByStatus[s.name] = (apptByStatus[s.name] || 0) + 1;
  }

  // Last 6 months of lead + appointment volume.
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      leads: 0,
      appts: 0,
    });
  }
  const monthIndex = Object.fromEntries(months.map((m, i) => [m.key, i]));
  for (const l of leadRows) {
    const key = String(l.lead_date || l.created_at).slice(0, 7);
    if (key in monthIndex) months[monthIndex[key]].leads++;
  }
  for (const a of apptRows) {
    const key = String(a.appt_date).slice(0, 7);
    if (key in monthIndex) months[monthIndex[key]].appts++;
  }

  const ratings = (feedback.data ?? []).filter((f) => typeof f.rating === "number");
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
    : 0;

  const held = apptByStatus["Held"] || 0;
  return {
    totals: {
      leads: leadRows.length,
      appts: apptRows.length,
      projects: projects.length,
      avgRating,
      conversion: leadRows.length ? Math.round((apptRows.length / leadRows.length) * 100) : 0,
      heldRate: apptRows.length ? Math.round((held / apptRows.length) * 100) : 0,
    },
    byStatus,
    byState: Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 8),
    apptByStatus,
    months,
    projects,
  };
}
