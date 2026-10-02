/** People: user accounts, account managers, reps and their workload. */

import "server-only";
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
    let query = supabase.from("users").select("*, company:companies(id, name)", { count: "exact" }).order("id");
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
