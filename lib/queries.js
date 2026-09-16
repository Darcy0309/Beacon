import "server-only";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// This module reads from Postgres and returns rows in the exact shapes the UI
// components expect, so the presentation layer stays free of database detail.
//
// Row Level Security runs as the signed-in user, so each caller only ever sees
// the records their role permits.
// ---------------------------------------------------------------------------

/** Unwrap PostgREST embedded rows that come back as single-element arrays. */
const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

const PALETTE = ["#2b6cb0", "#2c9d78", "#b7791f", "#6d47c9", "#c1362c", "#3f74e6", "#0e7490", "#7c53d6"];

/** Stable colour for a name, so a record always looks the same. */
export function colorFor(name = "") {
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "Garry Insurance" -> "GI" */
export function initialsOf(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const fullName = (u) =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "" : "";

/** "Sean Fitzgerald" -> "Sean F." — how reps are labelled throughout the UI. */
const shortName = (u) => {
  if (!u) return "Unassigned";
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name[0]}.`;
  return fullName(u) || "Unassigned";
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** 2026-10-14 -> "Oct 14" */
const shortDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** "Aug 15, 2:14 PM" */
const dateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
};

const timeAgo = (v) => {
  if (!v) return "—";
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return mins < 1 ? "just now" : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return shortDate(v);
};

const fileSize = (b) => {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const cityState = (r) => [r?.city, r?.state].filter(Boolean).join(", ") || "—";

/** "9:30 AM" -> { time: "9:30", ampm: "AM" } */
const splitTime = (v) => {
  const m = String(v ?? "").match(/^(\d{1,2}:\d{2})\s*(AM|PM)?$/i);
  return m ? { time: m[1], ampm: (m[2] || "").toUpperCase() } : { time: String(v ?? "—"), ampm: "" };
};

const isoDay = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** The signed-in user's profile, or null when signed out. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*, company:companies(id, name)")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!data) return null;

  return {
    ...data,
    company: one(data.company),
    name: fullName(data),
    short: shortName(data),
    initials: initialsOf(fullName(data)),
  };
}

// ---------------------------------------------------------------------------
// Lookups — options for the record forms
// ---------------------------------------------------------------------------

export async function getLookups() {
  const supabase = await createClient();
  const [statuses, apptStatuses, projectTypes, projectStatuses, natures, fbStatuses, projects, managers, agencies, companies] =
    await Promise.all([
      supabase.from("lead_statuses").select("id, code, name").order("id"),
      supabase.from("appointment_statuses").select("id, name").order("id"),
      supabase.from("project_types").select("id, code, description").order("id"),
      supabase.from("project_statuses").select("id, name").order("id"),
      supabase.from("nature_of_enquiry").select("id, name").order("id"),
      supabase.from("fb_statuses").select("id, name").order("id"),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("users").select("id, first_name, last_name, email").in("role", ["manager", "agent"]).order("id"),
      supabase.from("agencies").select("id, name").order("name"),
      supabase.from("companies").select("id, name").order("name"),
    ]);

  return {
    statuses: statuses.data ?? [],
    apptStatuses: apptStatuses.data ?? [],
    projectTypes: projectTypes.data ?? [],
    projectStatuses: projectStatuses.data ?? [],
    natures: natures.data ?? [],
    fbStatuses: fbStatuses.data ?? [],
    projects: projects.data ?? [],
    managers: (managers.data ?? []).map((m) => ({ ...m, name: fullName(m) })),
    agencies: agencies.data ?? [],
    companies: companies.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const LEAD_SELECT = `
  id, company_name, contact_name, contact_title, phone, email, website,
  address, city, state, zip, county, sic_code, description, list_source,
  employees, covered_employees, autos, sales_volume, years_in_business,
  estimated_annual_premium, notes_dcm, notes_client, lead_date, import_date,
  date_last_worked, created_at,
  status:lead_statuses(id, code, name),
  project:projects(id, name, company:companies(id, name)),
  agency:agencies(id, name),
  assigned:users!leads_assigned_user_id_fkey(id, first_name, last_name, email),
  insurance:insurance_details(*)
`;

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
    xdate: shortDate(insurance?.ultimate_xdate),
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

/** Totals per status code, for the leads filter chips. */
export async function getLeadCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("status:lead_statuses(code)");
  if (error) throw error;
  const counts = {};
  for (const r of data ?? []) {
    const code = one(r.status)?.code;
    if (code) counts[code] = (counts[code] || 0) + 1;
  }
  return { total: (data ?? []).length, counts };
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

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

// Accent bar per lead status, matching the palette used across the UI.
const BAR = {
  appt: "bg-emerald-500",
  survey: "bg-violet-500",
  hot: "bg-rose-500",
  xdate: "bg-sky-500",
  profile: "bg-amber-500",
  new: "bg-slate-400",
};

const APPT_SELECT = `
  id, appt_date, appt_time, duration_min, rep_name,
  status:appointment_statuses(id, name),
  user:users(id, first_name, last_name),
  lead:leads(id, company_name, contact_name, status:lead_statuses(code, name))
`;

function toApptView(a) {
  const lead = one(a.lead);
  const leadStatus = lead ? one(lead.status) : null;
  const user = one(a.user);
  const rep = a.rep_name || shortName(user);
  const { time, ampm } = splitTime(a.appt_time);

  return {
    id: a.id,
    date: a.appt_date,
    time,
    ampm,
    co: lead?.company_name ?? "—",
    detail: [leadStatus?.name, lead?.contact_name, `${a.duration_min ?? 30} min`]
      .filter(Boolean)
      .join(" · "),
    rep,
    repI: initialsOf(rep),
    repC: colorFor(rep),
    bar: BAR[leadStatus?.code] ?? BAR.new,
    leadId: lead?.id ?? null,
    status: one(a.status)?.name ?? "—",
  };
}

async function fetchAppointments({ from, to, limit = 400 } = {}) {
  const supabase = await createClient();
  let q = supabase.from("appointments").select(APPT_SELECT).order("appt_date").limit(limit);
  if (from) q = q.gte("appt_date", from);
  if (to) q = q.lte("appt_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toApptView);
}

/** Today's and tomorrow's appointments — the shape the dashboard renders. */
export async function getAppointments() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const rows = await fetchAppointments({ from: isoDay(today), to: isoDay(tomorrow) });
  return {
    today: rows.filter((a) => a.date === isoDay(today)),
    tomorrow: rows.filter((a) => a.date === isoDay(tomorrow)),
  };
}

/** Everything scheduled this week, grouped by day, for the appointments page. */
export async function getWeekAppointments() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + 6);

  const rows = await fetchAppointments({ from: isoDay(today), to: isoDay(end) });
  const groups = new Map();
  for (const a of rows) {
    if (!groups.has(a.date)) groups.set(a.date, []);
    groups.get(a.date).push(a);
  }
  return { rows, groups: [...groups.entries()] };
}

/** A calendar month keyed by day-of-month. */
export async function getCalendarMonth(year, month /* 0-indexed */) {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const rows = await fetchAppointments({ from: isoDay(first), to: isoDay(last) });

  const byDay = {};
  for (const a of rows) {
    const day = Number(String(a.date).slice(8, 10));
    byDay[day] = (byDay[day] || 0) + 1;
  }
  return { rows, byDay, count: rows.length };
}

// ---------------------------------------------------------------------------
// Clients (companies) and projects
// ---------------------------------------------------------------------------

/** Lead and appointment totals per company, plus the assigned manager. */
async function companyRollups(companyIds) {
  const out = { leads: {}, appts: {}, managers: {} };
  if (!companyIds.length) return out;

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, company_id, assignments:project_assignments(ae:users!project_assignments_ae_user_id_fkey(first_name, last_name, email))")
    .in("company_id", companyIds);

  const projectToCompany = {};
  for (const p of projects ?? []) {
    projectToCompany[p.id] = p.company_id;
    const ae = one((p.assignments ?? [])[0]?.ae);
    if (ae && !out.managers[p.company_id]) out.managers[p.company_id] = shortName(ae);
  }

  const projectIds = Object.keys(projectToCompany).map(Number);
  if (!projectIds.length) return out;

  const { data: leads } = await supabase.from("leads").select("id, project_id").in("project_id", projectIds);
  const leadToCompany = {};
  for (const l of leads ?? []) {
    const c = projectToCompany[l.project_id];
    if (!c) continue;
    leadToCompany[l.id] = c;
    out.leads[c] = (out.leads[c] || 0) + 1;
  }

  const leadIds = Object.keys(leadToCompany).map(Number);
  if (leadIds.length) {
    const { data: appts } = await supabase.from("appointments").select("id, lead_id").in("lead_id", leadIds);
    for (const a of appts ?? []) {
      const c = leadToCompany[a.lead_id];
      if (c) out.appts[c] = (out.appts[c] || 0) + 1;
    }
  }
  return out;
}

export async function getClients() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("*").order("name");
  if (error) throw error;

  const rows = data ?? [];
  const roll = await companyRollups(rows.map((c) => c.id));

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

const PROJECT_SELECT = `
  *,
  company:companies(id, name),
  type:project_types(id, code, description),
  status:project_statuses(id, name),
  assignments:project_assignments(ae:users!project_assignments_ae_user_id_fkey(id, first_name, last_name, email)),
  leads(count)
`;

function toProjectView(p) {
  const company = one(p.company);
  return {
    id: p.id,
    name: p.name,
    client: company?.name ?? p.client_name ?? "—",
    clientId: company?.id ?? null,
    type: one(p.type)?.code ?? "—",
    leads: p.leads?.[0]?.count ?? 0,
    status: one(p.status)?.name ?? "—",
    manager: shortName(one((p.assignments ?? [])[0]?.ae)),
    color: colorFor(p.name),
    description: p.description,
    startDate: shortDate(p.start_date),
    endDate: shortDate(p.end_date),
    amount: p.amount_paid,
    raw: p,
  };
}

export async function getProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).order("id");
  if (error) throw error;
  return (data ?? []).map(toProjectView);
}

export async function getProject(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProjectView(data) : null;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const ROLE_LABEL = { admin: "Administrator", manager: "Manager", agent: "Agent", client: "Client" };

export async function getUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*, company:companies(id, name)")
    .order("id");
  if (error) throw error;

  return (data ?? []).map((u) => {
    const name = fullName(u);
    return {
      id: u.id,
      name,
      email: u.email,
      initials: initialsOf(name),
      color: colorFor(name),
      role: ROLE_LABEL[u.role] ?? u.role,
      roleTone: u.role,
      iplock: u.ip_locked,
      last: u.last_login ? timeAgo(u.last_login) : "Never",
      status: u.status === "active" ? "Active" : u.status === "invited" ? "Invited" : "Disabled",
      company: one(u.company),
      raw: u,
    };
  });
}

/** Account managers with their workload. */
export async function getAccountManagers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*, assignments:project_assignments!project_assignments_ae_user_id_fkey(project:projects(id, name, company_id, state))")
    .eq("role", "manager")
    .order("id");
  if (error) throw error;

  const { data: leads } = await supabase.from("leads").select("id, assigned_user_id");
  const { data: appts } = await supabase.from("appointments").select("id, user_id");

  const leadCount = {};
  for (const l of leads ?? []) if (l.assigned_user_id) leadCount[l.assigned_user_id] = (leadCount[l.assigned_user_id] || 0) + 1;
  const apptCount = {};
  for (const a of appts ?? []) if (a.user_id) apptCount[a.user_id] = (apptCount[a.user_id] || 0) + 1;

  return (data ?? []).map((m) => {
    const name = shortName(m);
    const projects = (m.assignments ?? []).map((a) => one(a.project)).filter(Boolean);
    return {
      name,
      initials: initialsOf(fullName(m)),
      color: colorFor(name),
      region: m.state || m.city || "—",
      clients: new Set(projects.map((p) => p.company_id).filter(Boolean)).size,
      appts: apptCount[m.id] || 0,
      leads: leadCount[m.id] || 0,
    };
  });
}

/** Appointments booked per rep, for the dashboard and report bars. */
export async function getReps() {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .in("role", ["manager", "agent"])
    .order("id");
  const { data: appts } = await supabase.from("appointments").select("id, user_id");

  const counts = {};
  for (const a of appts ?? []) if (a.user_id) counts[a.user_id] = (counts[a.user_id] || 0) + 1;

  const colors = ["bg-primary", "bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500"];
  const rows = (staff ?? [])
    .map((s) => ({ name: shortName(s), appts: counts[s.id] || 0 }))
    .filter((r) => r.appts > 0)
    .sort((a, b) => b.appts - a.appts)
    .slice(0, 5);

  const max = rows[0]?.appts || 1;
  return rows.map((r, i) => ({ ...r, pct: Math.round((r.appts / max) * 100), color: colors[i % colors.length] }));
}

// ---------------------------------------------------------------------------
// Insurance carriers
// ---------------------------------------------------------------------------

export async function getInsuranceCompanies() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agencies").select("*, leads(count)").order("name");
  if (error) throw error;

  // How many leads sit with each carrier, and across how many states.
  const { data: leadRows } = await supabase.from("leads").select("agency_id, state");
  const states = {};
  for (const l of leadRows ?? []) {
    if (!l.agency_id || !l.state) continue;
    (states[l.agency_id] ||= new Set()).add(l.state);
  }

  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    initials: initialsOf(a.name || ""),
    color: colorFor(a.name || ""),
    lines: a.association ?? "—",
    states: states[a.id]?.size ?? 0,
    xdates: a.leads?.[0]?.count ?? 0,
    status: (a.leads?.[0]?.count ?? 0) > 12 ? "Preferred" : "Active",
  }));
}

// ---------------------------------------------------------------------------
// Feedback, QA, bulletin, documents
// ---------------------------------------------------------------------------

export async function getFeedback() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("*, lead:leads(company_name), nature:nature_of_enquiry(name), fb_status:fb_statuses(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).map((f) => ({
    id: f.id,
    client: one(f.lead)?.company_name ?? "—",
    contact: f.submitted_by ?? "—",
    rating: f.rating ?? 0,
    date: shortDate(f.created_at),
    text: f.content ?? "",
    status: one(f.fb_status)?.name ?? "Open",
    nature: one(f.nature)?.name ?? "—",
  }));

  const rated = rows.filter((r) => r.rating > 0);
  const avg = rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : 0;
  const promoters = rated.length ? Math.round((rated.filter((r) => r.rating >= 4).length / rated.length) * 100) : 0;

  return { feedback: rows, summary: { avg, total: rows.length, promoters } };
}

export async function getQaCalls({ limit = 25 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_records")
    .select("id, call_date, qa_score, qa_result, user:users(first_name, last_name, email), lead:leads(company_name)")
    .not("qa_score", "is", null)
    .order("call_date", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id,
    rep: shortName(one(c.user)),
    client: one(c.lead)?.company_name ?? "—",
    score: c.qa_score ?? 0,
    result: c.qa_result ?? "Review",
    date: shortDate(c.call_date),
  }));
}

export async function getBulletin() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bulletin_board")
    .select("*, user:users(first_name, last_name, email), project:projects(id, name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((b) => {
    const author = shortName(one(b.user)) || "Admin";
    return {
      id: b.id,
      author,
      initials: initialsOf(fullName(one(b.user)) || "Admin"),
      color: colorFor(author),
      time: timeAgo(b.created_at),
      text: b.message,
      project: one(b.project)?.name ?? null,
    };
  });
}

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, company:companies(name), project:projects(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    type: d.file_type ?? "—",
    client: one(d.company)?.name ?? "—",
    size: fileSize(d.size_bytes),
    date: shortDate(d.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Imports, alerts, settings
// ---------------------------------------------------------------------------

const IMPORT_LABEL = { completed: "Complete", processing: "Processing", pending: "Processing", failed: "Failed" };

export async function getImports() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*, project:projects(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((i) => ({
    id: i.id,
    file: i.file_name,
    rows: i.row_count ?? 0,
    imported: i.imported_count ?? 0,
    errors: i.error_count ?? 0,
    status: IMPORT_LABEL[i.status] ?? i.status,
    date: dateTime(i.created_at),
    project: one(i.project)?.name ?? "—",
  }));
}

// Maps an alert trigger to the dot colour the demo used.
const ALERT_TONE = {
  xdate_30d: "hot",
  hot_lead: "hot",
  appt_created: "appt",
  appt_reminder: "appt",
  feedback_new: "survey",
  import_done: "new",
};

export async function getAlerts() {
  const supabase = await createClient();
  const [rules, log] = await Promise.all([
    supabase.from("alert_rules").select("*").order("id"),
    supabase
      .from("alert_log")
      .select("*, rule:alert_rules(name, trigger)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  if (rules.error) throw rules.error;

  const DESC = {
    xdate_30d: "Email the client when a policy X-date falls inside 30 days.",
    appt_created: "Notify the assigned rep and manager on new appointments.",
    appt_reminder: "Daily reminder of the day’s appointments.",
    hot_lead: "Alert the rep instantly when a hot X-date lead is assigned.",
    import_done: "Summary of each finished lead import.",
    feedback_new: "Alert admins when a client submits feedback.",
  };

  return {
    alertRules: (rules.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      desc: DESC[r.trigger] ?? r.trigger,
      on: r.enabled,
    })),
    recentAlerts: (log.data ?? []).map((l) => ({
      text: l.subject,
      time: timeAgo(l.created_at),
      tone: ALERT_TONE[one(l.rule)?.trigger] ?? "new",
    })),
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
// Dashboard + reports
// ---------------------------------------------------------------------------

export async function getDashboardStats() {
  const supabase = await createClient();
  const today = isoDay(new Date());

  const [leadRows, apptRows, companies] = await Promise.all([
    supabase.from("leads").select("id, lead_date, created_at, status:lead_statuses(code)"),
    supabase.from("appointments").select("id, appt_date"),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const leads = leadRows.data ?? [];
  const appts = apptRows.data ?? [];

  const DAY = 86400000;
  const now = Date.now();
  const at = (l) => new Date(l.lead_date || l.created_at).getTime();

  const thisMonth = leads.filter((l) => at(l) >= now - 30 * DAY).length;
  const prevMonth = leads.filter((l) => at(l) >= now - 60 * DAY && at(l) < now - 30 * DAY).length;
  const thisWeek = appts.filter((a) => new Date(a.appt_date).getTime() >= now - 7 * DAY).length;
  const prevWeek = appts.filter((a) => {
    const t = new Date(a.appt_date).getTime();
    return t >= now - 14 * DAY && t < now - 7 * DAY;
  }).length;

  const pct = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 1000) / 10);

  // Lead volume for the last 8 weeks, drawn as the dashboard sparkline.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * 7 * DAY;
    const end = now - (7 - i) * 7 * DAY;
    return { label: i === 7 ? "Now" : `W${i + 1}`, leads: leads.filter((l) => at(l) >= start && at(l) < end).length };
  });

  return {
    totalLeads: leads.length,
    apptsThisWeek: thisWeek,
    apptToday: appts.filter((a) => a.appt_date === today).length,
    activeClients: companies.count ?? 0,
    conversion: leads.length ? Math.round((appts.length / leads.length) * 1000) / 10 : 0,
    leadDelta: pct(thisMonth, prevMonth),
    apptDelta: thisWeek - prevWeek,
    weeks,
  };
}

export async function getReports() {
  const supabase = await createClient();
  const [leadRows, apptRows, feedbackRows] = await Promise.all([
    supabase.from("leads").select("id, state, status:lead_statuses(name)"),
    supabase.from("appointments").select("id, status:appointment_statuses(name)"),
    supabase.from("feedback").select("rating"),
  ]);

  const leads = leadRows.data ?? [];
  const appts = apptRows.data ?? [];
  const held = appts.filter((a) => one(a.status)?.name === "Held").length;
  const ratings = (feedbackRows.data ?? []).filter((f) => typeof f.rating === "number");

  return {
    leads: leads.length,
    appts: appts.length,
    showRate: appts.length ? Math.round((held / appts.length) * 100) : 0,
    conversion: leads.length ? Math.round((appts.length / leads.length) * 100) : 0,
    avgRating: ratings.length
      ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
      : 0,
  };
}
