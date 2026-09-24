import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AUTH_ID_HEADER } from "@/lib/supabase/config";
import { PAGE_SIZE } from "@/lib/paging";
import { clientSlug } from "@/lib/data";

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

/** "9:30 AM" -> 570 (minutes past midnight) so appointments sort chronologically. */
function timeRank(v) {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 24 * 60 + 1;
  let h = Number(m[1]) % 12;
  if ((m[3] || "").toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

// ---------------------------------------------------------------------------
// Paged lists
//
// List pages fetch one page of rows and the exact total in a single request.
// Search and facet filters run in the database too, so they see every row
// and not just the page on screen.
// ---------------------------------------------------------------------------

/** These characters are syntax inside a PostgREST `or` filter. */
const searchTerm = (q) => `%${String(q).replace(/[,()"\\]/g, " ").trim()}%`;

/**
 * Apply search, facet filters and the page window to a query.
 *   search:  columns matched case-insensitively against `q`
 *   table:   set when the search columns live on an embedded resource
 *   columns: facet key -> column path, e.g. { status: "status.code" }
 * Any embed used in a filter must carry `!inner` in the select, otherwise
 * the filter narrows the embed instead of the parent rows.
 */
function paged(query, { page = 1, perPage = PAGE_SIZE, q = "", filters = {} }, { search = [], table, columns = {} } = {}) {
  if (q && search.length) {
    const term = searchTerm(q);
    query = query.or(search.map((c) => `${c}.ilike.${term}`).join(","), table ? { referencedTable: table } : undefined);
  }
  for (const [key, value] of Object.entries(filters)) {
    if (columns[key] && value) query = query.eq(columns[key], value);
  }
  const from = (page - 1) * perPage;
  return query.range(from, from + perPage - 1);
}

/** Run a paged query; a page past the end (a stale link) falls back to page 1. */
async function runPaged(build, params) {
  let { data, error, count } = await build(params);
  if (error?.code === "PGRST103" && params.page > 1) {
    ({ data, error, count } = await build({ ...params, page: 1 }));
  }
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

/** `!inner` when a facet filters through this embed, so it narrows the parent rows. */
const inner = (on) => (on ? "!inner" : "");

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * The signed-in user's profile, or null when signed out.
 *
 * The proxy has already verified the session for this request and stamped
 * the auth id on a request header, so only the profile query is needed.
 * Falls back to asking Supabase Auth when the header is absent. Cached per
 * request: the layout and the dashboard both call it.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();

  let authId = (await headers()).get(AUTH_ID_HEADER);
  if (!authId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authId = user?.id ?? null;
  }
  if (!authId) return null;

  const { data } = await supabase
    .from("users")
    .select("*, company:companies(id, name)")
    .eq("auth_id", authId)
    .maybeSingle();
  if (!data) return null;

  return {
    ...data,
    company: one(data.company),
    name: fullName(data),
    short: shortName(data),
    initials: initialsOf(fullName(data)),
  };
});

// ---------------------------------------------------------------------------
// Global search (the Ctrl+K palette)
// ---------------------------------------------------------------------------

const SEARCH_GROUPS = [
  { key: "leads", label: "Leads", href: (r) => `/leads/${r.id}` },
  { key: "clients", label: "Clients", href: (r) => `/clients/${clientSlug(r.title)}` },
  { key: "projects", label: "Projects", href: (r) => `/projects/${r.id}` },
  { key: "users", label: "Users", href: (r) => `/users?q=${encodeURIComponent(r.email ?? r.title ?? "")}` },
  { key: "documents", label: "Documents", href: (r) => `/documents?q=${encodeURIComponent(r.title ?? "")}` },
  { key: "carriers", label: "Carriers", href: (r) => `/insurance-companies?q=${encodeURIComponent(r.title ?? "")}` },
];

/**
 * Search every record type at once — the global_search() SQL function —
 * and return the non-empty groups with a link per hit.
 */
export async function globalSearch(q, { perGroup = 5 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", { q, per_group: perGroup });
  if (error) throw error;
  return SEARCH_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: (data?.[g.key] ?? []).map((r) => ({
      id: r.id,
      title: r.title || "—",
      subtitle: r.subtitle || "",
      href: g.href(r),
    })),
  })).filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Lookups — options for the record forms
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

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
    appt_time: a.appt_time,
    status: one(a.status)?.name ?? "—",
    // Where the block sits on a day/week time grid.
    startMin: timeRank(a.appt_time),
    duration: a.duration_min ?? 30,
  };
}

async function fetchAppointments({ from, to, limit = 400 } = {}) {
  const supabase = await createClient();
  let q = supabase.from("appointments").select(APPT_SELECT).order("appt_date").limit(limit);
  if (from) q = q.gte("appt_date", from);
  if (to) q = q.lte("appt_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [])
    .map(toApptView)
    .sort((a, b) => a.date.localeCompare(b.date) || timeRank(a.appt_time) - timeRank(b.appt_time));
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

/**
 * Appointments between two ISO days, inclusive — what the calendar's day and
 * week views render. `byDate` keys the same rows by "YYYY-MM-DD".
 */
export async function getCalendarRange(from, to) {
  const rows = await fetchAppointments({ from, to });
  const byDate = {};
  for (const a of rows) (byDate[a.date] ||= []).push(a);
  return { rows, byDate, count: rows.length };
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

const projectSelect = ({ company = false, type = false, status = false } = {}) => `
  *,
  company:companies${inner(company)}(id, name),
  type:project_types${inner(type)}(id, code, description),
  status:project_statuses${inner(status)}(id, name),
  assignments:project_assignments(ae:users!project_assignments_ae_user_id_fkey(id, first_name, last_name, email)),
  leads(count)
`;
const PROJECT_SELECT = projectSelect();

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

/** One page of projects, searched and filtered in the database. */
export async function listProjects(params) {
  const supabase = await createClient();
  const { rows, total } = await runPaged(
    (p) =>
      paged(
        supabase
          .from("projects")
          .select(
            projectSelect({ company: Boolean(p.filters?.client), type: Boolean(p.filters?.type), status: Boolean(p.filters?.status) }),
            { count: "exact" }
          )
          .order("id"),
        p,
        { search: ["name", "client_name"], columns: { status: "status.name", type: "type.code", client: "company.name" } }
      ),
    params
  );
  return { rows: rows.map(toProjectView), total };
}

/** Whole-table figures for the projects page tiles: a few columns per row, no embeds to speak of. */
export async function getProjectStats() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("amount_paid, type:project_types(code), status:project_statuses(name), leads(count)");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    type: one(p.type)?.code ?? "—",
    status: one(p.status)?.name ?? "—",
    leads: p.leads?.[0]?.count ?? 0,
    amount: Number(p.amount_paid ?? 0),
  }));
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

const USER_STATUS_LABEL = { active: "Active", invited: "Invited", disabled: "Disabled" };

/** Facet options for the users table, in the order the roles and statuses are usually listed. */
export const USER_ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));
export const USER_STATUS_OPTIONS = Object.entries(USER_STATUS_LABEL).map(([value, label]) => ({ value, label }));

function toUserView(u) {
  const name = fullName(u);
  return {
    id: u.id,
    name,
    email: u.email,
    initials: initialsOf(name),
    color: colorFor(name),
    role: ROLE_LABEL[u.role] ?? u.role,
    roleTone: u.role,
    mfa: Boolean(u.mfa),
    last: u.last_login ? timeAgo(u.last_login) : "Never",
    status: USER_STATUS_LABEL[u.status] ?? "Disabled",
    company: one(u.company),
    raw: u,
  };
}

/**
 * One page of users, searched and filtered in the database, with each
 * account's two-factor status attached. The `mfa` facet filters on the
 * page's rows, since the status lives in the auth schema rather than a
 * column we can sort or window on.
 */
export async function listUsers(params) {
  const supabase = await createClient();
  const { mfa: mfaFilter, ...filters } = params.filters ?? {};
  const [{ rows, total }, { data: mfa }] = await Promise.all([
    runPaged(
      (p) =>
        paged(supabase.from("users").select("*, company:companies(id, name)", { count: "exact" }).order("id"), p, {
          search: ["first_name", "last_name", "email"],
          columns: { role: "role", status: "status" },
        }),
      { ...params, filters }
    ),
    supabase.rpc("mfa_status"),
  ]);

  const enabled = new Set((mfa ?? []).filter((m) => m.enabled).map((m) => m.user_id));
  let list = rows.map((u) => toUserView({ ...u, mfa: enabled.has(u.id) }));
  if (mfaFilter) list = list.filter((u) => String(u.mfa) === mfaFilter);
  return { rows: list, total };
}

/** Whole-table figures for the users page tiles, including two-factor uptake. */
export async function getUserStats() {
  const supabase = await createClient();
  const [{ data, error }, { data: mfa }] = await Promise.all([
    supabase.from("users").select("id, role, status"),
    supabase.rpc("mfa_status"),
  ]);
  if (error) throw error;
  const enabled = new Set((mfa ?? []).filter((m) => m.enabled).map((m) => m.user_id));
  return (data ?? []).map((u) => ({ ...u, mfa: enabled.has(u.id) }));
}

/** Account managers with their workload. */
export async function getAccountManagers() {
  const supabase = await createClient();
  // Workload comes pre-counted from the user_workload view.
  const [{ data, error }, { data: workload }] = await Promise.all([
    supabase
      .from("users")
      .select("*, assignments:project_assignments!project_assignments_ae_user_id_fkey(project:projects(id, name, company_id, state))")
      .eq("role", "manager")
      .order("id"),
    supabase.from("user_workload").select("*"),
  ]);
  if (error) throw error;

  const leadCount = {};
  const apptCount = {};
  for (const w of workload ?? []) {
    leadCount[w.user_id] = Number(w.lead_count) || 0;
    apptCount[w.user_id] = Number(w.appt_count) || 0;
  }

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

/** The top five reps by appointments, shaped for the dashboard and report bars. */
function shapeReps(list) {
  const colors = ["bg-primary", "bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500"];
  const rows = (list ?? [])
    .map((r) => ({ name: shortName(r), appts: Number(r.appts) || 0 }))
    .filter((r) => r.appts > 0)
    .slice(0, 5);
  const max = rows[0]?.appts || 1;
  return rows.map((r, i) => ({ ...r, pct: Math.round((r.appts / max) * 100), color: colors[i % colors.length] }));
}

/** Appointments booked per rep — the rep_workload() SQL function, busiest first. */
export async function getReps() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rep_workload");
  if (error) throw error;
  return shapeReps(data);
}

/** The signed-in user's own leads and appointments, for their reports page. */
export async function getMyWorkload() {
  const me = await getCurrentUser();
  if (!me) return { leads: 0, appts: 0 };
  const supabase = await createClient();
  const { data } = await supabase.from("user_workload").select("*").eq("user_id", me.id).maybeSingle();
  return { leads: Number(data?.lead_count) || 0, appts: Number(data?.appt_count) || 0 };
}

// ---------------------------------------------------------------------------
// Insurance carriers
// ---------------------------------------------------------------------------

const toCarrierView = (a, states) => ({
  id: a.id,
  name: a.name,
  initials: initialsOf(a.name || ""),
  color: colorFor(a.name || ""),
  lines: a.association ?? "—",
  states: states[a.id]?.size ?? 0,
  xdates: a.leads?.[0]?.count ?? 0,
  status: (a.leads?.[0]?.count ?? 0) > 12 ? "Preferred" : "Active",
});

/**
 * One page of carriers, searched and filtered in the database, plus the
 * whole-table figures the tiles need (every carrier's lead count and the
 * states its leads sit in — two small columns per row).
 */
export async function listInsuranceCompanies(params) {
  const supabase = await createClient();
  const [{ rows, total }, { data: all }, { data: leadRows }] = await Promise.all([
    runPaged(
      (p) =>
        paged(supabase.from("agencies").select("*, leads(count)", { count: "exact" }).order("name"), p, {
          search: ["name", "association"],
          columns: { lines: "association" },
        }),
      params
    ),
    supabase.from("agencies").select("id, association, leads(count)"),
    supabase.from("agency_footprint").select("*"),
  ]);

  // toCarrierView reads `states[id].size`; the view already counted them.
  const states = {};
  for (const f of leadRows ?? []) states[f.agency_id] = { size: Number(f.state_count) || 0 };

  const associations = [...new Set((all ?? []).map((a) => a.association).filter(Boolean))].sort();
  return {
    rows: rows.map((a) => toCarrierView(a, states)),
    total,
    stats: (all ?? []).map((a) => toCarrierView(a, states)),
    associations,
  };
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

export const QA_RESULT_OPTIONS = ["Passed", "Review", "Failed"].map((v) => ({ value: v, label: v }));

const toQaView = (c) => ({
  id: c.id,
  rep: shortName(one(c.user)),
  client: one(c.lead)?.company_name ?? "—",
  score: c.qa_score ?? 0,
  result: c.qa_result ?? "Review",
  date: shortDate(c.call_date),
});

/**
 * One page of scored calls, plus every score for the tiles and the reps
 * who appear in the scored calls, for the rep facet. Search matches the
 * lead's company name; the rep facet filters by user id.
 */
export async function listQaCalls(params) {
  const supabase = await createClient();
  const searching = Boolean(params.q);
  const [{ rows, total }, { data: scores }, { data: reps }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("call_records")
            .select(
              `id, call_date, qa_score, qa_result, user:users(id, first_name, last_name, email), lead:leads${inner(searching)}(company_name)`,
              { count: "exact" }
            )
            .not("qa_score", "is", null)
            .order("call_date", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["company_name"], table: "lead", columns: { result: "qa_result", rep: "user_id" } }
        ),
      params
    ),
    supabase.from("call_records").select("qa_score, qa_result").not("qa_score", "is", null),
    supabase.from("users").select("id, first_name, last_name, email").in("role", ["manager", "agent"]).order("id"),
  ]);

  return {
    rows: rows.map(toQaView),
    total,
    stats: (scores ?? []).map((c) => ({ score: c.qa_score ?? 0, result: c.qa_result ?? "Review" })),
    reps: (reps ?? []).map((u) => ({ value: String(u.id), label: shortName(u) })),
  };
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

/**
 * One page of documents, plus the type and client of every document for the
 * tiles and facet options.
 */
export async function listDocuments(params) {
  const supabase = await createClient();
  const [{ rows, total }, { data: all }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("documents")
            .select(`*, company:companies${inner(Boolean(p.filters?.client))}(name), project:projects(name)`, { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["name"], columns: { type: "file_type", client: "company.name" } }
        ),
      params
    ),
    supabase.from("documents").select("file_type, company:companies(name)"),
  ]);

  const stats = (all ?? []).map((d) => ({ type: d.file_type ?? "—", client: one(d.company)?.name ?? "—" }));
  const distinct = (key) => [...new Set(stats.map((d) => d[key]).filter((v) => v && v !== "—"))].sort();

  return {
    rows: rows.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.file_type ?? "—",
      client: one(d.company)?.name ?? "—",
      size: fileSize(d.size_bytes),
      date: shortDate(d.created_at),
    })),
    total,
    stats,
    types: distinct("type"),
    clients: distinct("client"),
  };
}

// ---------------------------------------------------------------------------
// Imports, alerts, settings
// ---------------------------------------------------------------------------

const IMPORT_LABEL = { completed: "Complete", processing: "Processing", pending: "Processing", failed: "Failed" };

export const IMPORT_STATUS_OPTIONS = [
  { value: "completed", label: "Complete" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

/**
 * One page of import batches, plus the row totals of every batch for the
 * tiles and the projects that have been imported into, for the facet.
 */
export async function listImports(params) {
  const supabase = await createClient();
  const [{ rows, total }, { data: all }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("import_batches")
            .select(`*, project:projects${inner(Boolean(p.filters?.project))}(name)`, { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["file_name"], columns: { status: "status", project: "project.name" } }
        ),
      params
    ),
    supabase.from("import_batches").select("row_count, imported_count, error_count, project:projects(name)").order("created_at", { ascending: false }),
  ]);

  const stats = (all ?? []).map((i) => ({
    rows: i.row_count ?? 0,
    imported: i.imported_count ?? 0,
    errors: i.error_count ?? 0,
    project: one(i.project)?.name ?? "—",
  }));

  return {
    rows: rows.map((i) => ({
      id: i.id,
      file: i.file_name,
      rows: i.row_count ?? 0,
      imported: i.imported_count ?? 0,
      errors: i.error_count ?? 0,
      status: IMPORT_LABEL[i.status] ?? i.status,
      date: dateTime(i.created_at),
      project: one(i.project)?.name ?? "—",
    })),
    total,
    stats,
    projects: [...new Set(stats.map((i) => i.project).filter((v) => v !== "—"))].sort(),
  };
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

// ---------------------------------------------------------------------------
// Security and activity
// ---------------------------------------------------------------------------

/** Whether the signed-in user has an authenticator app set up. */
export async function getMyTwoFactor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { enabled: false, factors: [] };
  const totp = data?.totp ?? [];
  return {
    enabled: totp.some((f) => f.status === "verified"),
    factors: totp.map((f) => ({ id: f.id, name: f.friendly_name, status: f.status, created: shortDate(f.created_at) })),
  };
}

const ACTION_LABEL = {
  sign_in: "Signed in",
  sign_out: "Signed out",
  "mfa.enable": "Turned on two-factor",
  "mfa.disable": "Turned off two-factor",
  "lead.create": "Created a lead",
  "lead.update": "Updated a lead",
  "lead.delete": "Deleted a lead",
  "project.create": "Created a project",
  "project.update": "Updated a project",
  "company.create": "Created a client",
  "company.update": "Updated a client",
  "user.create": "Created a user",
  "user.update": "Updated a user",
  "leads.import": "Imported leads",
};

/** How active each account has been — the activity_summary() SQL function. */
export async function getActivitySummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activity_summary");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const name = fullName(r) || r.email;
    return {
      id: r.user_id,
      name,
      email: r.email,
      initials: initialsOf(name),
      color: colorFor(name),
      role: ROLE_LABEL[r.role] ?? r.role,
      roleTone: r.role,
      loginsMonth: Number(r.logins_month) || 0,
      logins30d: Number(r.logins_30d) || 0,
      actions30d: Number(r.actions_30d) || 0,
      lastActive: r.last_active ? timeAgo(r.last_active) : "Never",
      lastActiveAt: r.last_active,
    };
  });
}

/** One page of the activity trail, newest first. */
export async function listActivity(params) {
  const supabase = await createClient();
  const { rows, total } = await runPaged(
    (p) =>
      paged(
        supabase
          .from("activity_log")
          .select(`*, user:users${inner(Boolean(p.filters?.user))}(id, first_name, last_name, email, role)`, { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        p,
        { search: ["detail"], columns: { action: "action", user: "user.email" } }
      ),
    params
  );

  return {
    rows: rows.map((r) => {
      const u = one(r.user);
      const name = fullName(u) || u?.email || "—";
      return {
        id: r.id,
        who: name,
        initials: initialsOf(name),
        color: colorFor(name),
        role: ROLE_LABEL[u?.role] ?? u?.role ?? "—",
        action: ACTION_LABEL[r.action] ?? r.action,
        actionKey: r.action,
        detail: r.detail ?? "",
        entity: r.entity ?? "",
        entityId: r.entity_id,
        when: dateTime(r.created_at),
        ago: timeAgo(r.created_at),
      };
    }),
    total,
  };
}

/** The distinct actions recorded, for the activity page's filter. */
export async function getActivityActions() {
  const supabase = await createClient();
  const { data } = await supabase.from("activity_log").select("action");
  const seen = [...new Set((data ?? []).map((r) => r.action))].sort();
  return seen.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a }));
}

export async function getSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*");
  const map = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return { settings: map };
}

// ---------------------------------------------------------------------------
// Dashboard + reports
// ---------------------------------------------------------------------------

export async function getDashboardStats() {
  const supabase = await createClient();
  const { data: s, error } = await supabase.rpc("dashboard_stats");
  if (error) throw error;

  const pct = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 1000) / 10);

  // Eight-week buckets, oldest first, drive both the big chart and the tile sparklines.
  const weeks = (s?.weeks ?? []).map((w, i) => ({
    label: i === 7 ? "Now" : `W${i + 1}`,
    leads: w.leads,
    appts: w.appts,
    conversion: w.leads ? Math.round((w.appts / w.leads) * 100) : 0,
  }));

  return {
    totalLeads: s?.leads_total ?? 0,
    apptsThisWeek: s?.appts_7d ?? 0,
    apptToday: s?.appts_today ?? 0,
    activeClients: s?.active_clients ?? 0,
    conversion: s?.leads_total ? Math.round((s.appts_total / s.leads_total) * 1000) / 10 : 0,
    leadDelta: pct(s?.leads_30d ?? 0, s?.leads_30_60d ?? 0),
    apptDelta: (s?.appts_7d ?? 0) - (s?.appts_7_14d ?? 0),
    weeks,
    series: {
      leads: weeks.map((w) => w.leads),
      appts: weeks.map((w) => w.appts),
      conversion: weeks.map((w) => w.conversion),
      // Lead volume per campaign, rendered as bars.
      clients: s?.project_leads ?? [],
    },
    // Appointments per rep, so the dashboard needs no separate query.
    reps: shapeReps(s?.reps),
  };
}

export async function getReports() {
  const supabase = await createClient();
  const { data: r, error } = await supabase.rpc("report_stats");
  if (error) throw error;

  const leads = r?.leads ?? 0;
  const appts = r?.appts ?? 0;
  const ratings = r?.ratings ?? { count: 0, avg: 0 };

  return {
    leads,
    appts,
    projects: r?.projects ?? 0,
    showRate: appts ? Math.round(((r?.held ?? 0) / appts) * 100) : 0,
    conversion: leads ? Math.round((appts / leads) * 100) : 0,
    avgRating: ratings.count ? Math.round(Number(ratings.avg) * 10) / 10 : 0,
    byStatus: r?.by_status ?? {},
    // [[state, count], ...] — the top eight, busiest first.
    byState: r?.by_state ?? [],
    apptByStatus: r?.appt_by_status ?? {},
    // Six months, oldest first: { key: "2026-09", label: "Sep", leads, appts }.
    months: r?.months ?? [],
  };
}
