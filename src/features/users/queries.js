/** People: user accounts, account managers, reps and their workload. */

import "server-only";
import { addDays } from "@/lib/dates";
import { colorFor, fullName, initialsOf, shortName, timeAgo } from "@/lib/format";
import { one, paged, runPaged } from "@/lib/server/query-helpers";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const ROLE_LABEL = { admin: "Administrator", manager: "Manager", agent: "Agent", client: "Client" };

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
 * account's two-factor status attached. Two-factor lives in the auth schema,
 * so the accounts that have it are read first and the `mfa` facet becomes an
 * id filter on the query itself: paging and totals count only matches.
 */
export async function listUsers(params) {
  const supabase = await createClient();
  const { mfa: mfaFilter, ...filters } = params.filters ?? {};
  // Without it the filter and every row's status would be wrong, not just missing.
  const { data: mfa, error: mfaError } = await supabase.rpc("mfa_status");
  if (mfaError) throw mfaError;
  const enabled = new Set((mfa ?? []).filter((m) => m.enabled).map((m) => m.user_id));
  const ids = [...enabled];

  const { rows, total } = await runPaged((p) => {
    let query = supabase.from("users").select("*, company:companies!users_company_id_fkey(id, name)", { count: "exact" }).order("id");
    if (mfaFilter === "true") query = query.in("id", ids);
    else if (mfaFilter === "false" && ids.length) query = query.not("id", "in", `(${ids.join(",")})`);
    return paged(query, p, {
      search: ["first_name", "last_name", "email"],
      columns: { role: "role", status: "status" },
    });
  }, { ...params, filters });

  return { rows: rows.map((u) => toUserView({ ...u, mfa: enabled.has(u.id) })), total };
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
/**
 * The Account Managers page over days chosen (Sean, Oct 2026; { from, to },
 * `today` the business's): per manager, the leads they developed and the
 * appointments they set (as the production report counts them, as the
 * dashboard does), the leads at appointment setting they called (each once),
 * and the appointments they set and leads they developed that were marked
 * invalid; and the team's, a day at a time up to today, for the tiles' lines.
 */
export async function getManagerPeriod({ from, to, today }) {
  const supabase = await createClient();
  const [report, stats] = await Promise.all([
    supabase.rpc("production_report", { p_from: from, p_to: to, p_project_id: null, p_user_id: null }),
    supabase.rpc("manager_period_stats", { p_from: from, p_to: to }),
  ]);
  if (report.error) throw report.error;
  if (stats.error) throw stats.error;
  const byUser = new Map();
  const person = (id) => {
    if (!byUser.has(id)) byUser.set(id, { developed: 0, appts: 0, called: 0, invalidAppts: 0, invalidLeads: 0 });
    return byUser.get(id);
  };
  const days = [];
  for (let d = from; d <= (to < today ? to : today); d = addDays(d, 1)) days.push(d);
  const at = new Map(days.map((d, i) => [d, i]));
  const line = () => days.map(() => 0);
  const series = { developed: line(), appts: line(), called: line(), invalidAppts: line(), invalidLeads: line() };
  const add = (key, day, n) => {
    const i = at.get(day);
    if (i !== undefined) series[key][i] += n;
  };
  for (const r of report.data ?? []) {
    const p = person(r.user_id);
    p.developed += Number(r.leads) || 0;
    p.appts += Number(r.appointments) || 0;
    add("developed", r.day, Number(r.leads) || 0);
    add("appts", r.day, Number(r.appointments) || 0);
  }
  for (const r of stats.data ?? []) {
    if (r.day == null) {
      // All the days together: a lead called on several of them, once.
      const p = person(r.user_id);
      p.called = Number(r.leads_called) || 0;
      p.invalidAppts = Number(r.appts_invalid) || 0;
      p.invalidLeads = Number(r.leads_invalid) || 0;
    } else {
      add("called", r.day, Number(r.leads_called) || 0);
      add("invalidAppts", r.day, Number(r.appts_invalid) || 0);
      add("invalidLeads", r.day, Number(r.leads_invalid) || 0);
    }
  }
  return { byUser, series };
}

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

  // What each holds (Sean, Oct 2026): leads, and apart from them the DB dev names still to call.
  const leadCount = {};
  const apptCount = {};
  const namesLeft = {};
  for (const w of workload ?? []) {
    leadCount[w.user_id] = Number(w.leads_held) || 0;
    apptCount[w.user_id] = Number(w.appt_count) || 0;
    namesLeft[w.user_id] = Number(w.names_left) || 0;
  }

  return (data ?? []).map((m) => {
    const name = shortName(m);
    const projects = (m.assignments ?? []).map((a) => one(a.project)).filter(Boolean);
    return {
      id: m.id,
      active: m.status === "active",
      name,
      initials: initialsOf(fullName(m)),
      color: colorFor(name),
      region: m.state || m.city || "—",
      clients: new Set(projects.map((p) => p.company_id).filter(Boolean)).size,
      appts: apptCount[m.id] || 0,
      leads: leadCount[m.id] || 0,
      names: namesLeft[m.id] || 0,
    };
  });
}

/** The top five reps by appointments, shaped for the dashboard and report bars. */
export function shapeReps(list) {
  const colors = ["bg-primary", "bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500"];
  const rows = (list ?? [])
    .map((r) => ({ name: shortName(r), appts: Number(r.appts) || 0 }))
    .filter((r) => r.appts > 0)
    .slice(0, 5);
  const max = rows[0]?.appts || 1;
  return rows.map((r, i) => ({ ...r, pct: Math.round((r.appts / max) * 100), color: colors[i % colors.length] }));
}

/** Active staff who can be put on a project, by name. */
export async function getAssignableStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, role")
    .in("role", ["admin", "manager", "agent"])
    .eq("status", "active")
    .order("first_name")
    .order("last_name");
  if (error) throw error;
  return (data ?? []).map((u) => ({ id: u.id, name: fullName(u), role: ROLE_LABEL[u.role] ?? u.role }));
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

/** Who can own a client (its Sales Rep) or hear about it: the active administrators and managers. */
export async function getSalesReps() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id, first_name, last_name, email, role")
    .in("role", ["admin", "manager"]).eq("status", "active").order("first_name").order("last_name");
  if (error) throw error;
  return (data ?? []).map((u) => ({ id: u.id, name: fullName(u), role: ROLE_LABEL[u.role] ?? u.role }));
}
