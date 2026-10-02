/**
 * The account manager's day: their projects, each project's call list in
 * weighted order, the appointments waiting on their confirmation, and the
 * call results a lead sheet offers.
 */

import "server-only";
import { cache } from "react";
import { daysBetween, todayIn } from "@/lib/dates";
import { shortDate, timeAgo } from "@/lib/format";
import { getBusinessTimeZone } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABEL = { DBDV: "Database development", APPT: "Appointment setting" };

/** "Worked today" … "Never" — the Last worked filter, by calendar day where the business is. */
function workedBucket(iso, tz) {
  if (!iso) return "Never";
  const days = daysBetween(todayIn(tz, new Date(iso)), todayIn(tz));
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  return "Over a week ago";
}

/** My Projects: what the signed-in person is assigned to (everything, for an administrator). Cached per request. */
export const getWorkProjects = cache(async function getWorkProjects() {
  const supabase = await createClient();
  const [{ data, error }, tz] = await Promise.all([supabase.rpc("work_projects"), getBusinessTimeZone()]);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client ?? "—",
    type: p.type,
    typeLabel: TYPE_LABEL[p.type] ?? p.type ?? "—",
    timezone: p.timezone ?? "—",
    state: p.state ?? "—",
    status: p.status ?? "—",
    apptProjectId: p.appt_project_id,
    namesLeft: Number(p.names_left),
    namesLeftAll: Number(p.names_left_all),
    followUps: Number(p.follow_ups),
    lastWorkedAt: p.last_worked,
    lastWorked: p.last_worked ? timeAgo(p.last_worked) : "Never",
    worked: workedBucket(p.last_worked, tz),
  }));
});

/** One project from My Projects, or null when it is not the caller's. */
export async function getWorkProject(id) {
  return (await getWorkProjects()).find((p) => p.id === Number(id)) ?? null;
}

/** One page of a rep's call list, in the order they should call it. */
export async function getCallList(projectId, { page = 1, perPage = 50, q = "", rep = null } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("call_list", {
    p_project_id: Number(projectId),
    p_rep: rep,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
    p_search: q || null,
  });
  if (error) throw error;
  const rows = (data ?? []).map((r, i) => ({
    id: r.id,
    position: (page - 1) * perPage + i + 1,
    company: r.company_name ?? "—",
    contact: r.contact_name ?? "—",
    phone: r.phone ?? "—",
    place: [r.city, r.state].filter(Boolean).join(", ") || "—",
    result: r.result,
    weight: r.call_weight,
    last: Boolean(r.sort_last),
    lastCalled: r.date_last_worked ? timeAgo(r.date_last_worked) : "Not called yet",
    renewal: r.renewal_date ? shortDate(r.renewal_date) : "—",
  }));
  return { rows, total: Number(data?.[0]?.total ?? 0) };
}
/**
 * The first name on a rep's list that is not in `except` (the name on screen
 * and any skipped on the way to it). Skipping writes nothing, so the list's
 * order stays put; without the skipped names Skip would bounce between the
 * top two.
 */
export async function getNextOnList(projectId, except = []) {
  const skip = new Set(except);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("call_list", { p_project_id: Number(projectId), p_limit: Math.min(skip.size + 1, 500) });
  if (error) throw error;
  const next = (data ?? []).find((r) => !skip.has(r.id));
  return { next: next?.id ?? null, left: Number(data?.[0]?.total ?? 0) };
}

/**
 * Appointments the signed-in person set that still need confirming. Only
 * upcoming ones: a meeting that has already happened has nothing to confirm.
 * (From yesterday, so a US evening is not cut off by the server's UTC date.)
 */
export async function getFollowUps({ projectId } = {}) {
  const me = await getCurrentUser();
  if (!me) return [];
  const supabase = await createClient();
  let q = supabase
    .from("appointments")
    .select("id, appt_date, appt_time, qa_status, set_project_id, lead:leads(id, company_name, contact_name, phone, project_id)")
    .eq("user_id", me.id)
    .is("confirmed_at", null)
    .is("invalid_at", null)
    .gte("appt_date", new Date(Date.now() - 86400000).toISOString().slice(0, 10))
    .order("appt_date")
    .order("id");
  if (projectId) q = q.eq("set_project_id", Number(projectId));
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    leadId: a.lead?.id,
    projectId: a.lead?.project_id,
    company: a.lead?.company_name ?? "—",
    contact: a.lead?.contact_name ?? "—",
    phone: a.lead?.phone ?? "—",
    when: `${shortDate(a.appt_date)}${a.appt_time ? ` · ${a.appt_time}` : ""}`,
    date: a.appt_date,
    qa: a.qa_status ?? "passed",
  }));
}

/** Every call result, in the order the client listed them. Cached per request. */
export const getCallResults = cache(async function getCallResults() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_results")
    .select("id, project_type, name, viable, callable, sort_last, effect, applies_to, action")
    .order("project_type")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
});

/** The open appointment on a lead that a follow-up would confirm or invalidate. */
export async function getOpenAppointment(leadId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, appt_date, appt_time, user_id, set_stage, qa_status, confirmed_at")
    .eq("lead_id", Number(leadId))
    .is("invalid_at", null)
    .order("appt_create_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The people assigned to a project, for an administrator choosing whose list to look at. */
export async function getProjectReps(projectId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_assignments")
    .select("user:users!project_assignments_ae_user_id_fkey(id, first_name, last_name, email, status)")
    .eq("project_id", Number(projectId))
    .not("ae_user_id", "is", null);
  if (error) throw error;
  return (data ?? [])
    .map((r) => (Array.isArray(r.user) ? r.user[0] : r.user))
    .filter((u) => u && u.status === "active")
    .map((u) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
