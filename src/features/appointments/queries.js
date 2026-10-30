/** Appointments and the calendar. */

import "server-only";
import { appointmentKind, cityState, colorFor, initialsOf, isoDay, longDate, shortName, splitTime, timeRank } from "@/lib/format";
import { addDays } from "@/lib/dates";
import { getBusinessToday } from "@/lib/server/business-day";
import { one, readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

// Accent bar per kind of appointment (its call result), matching the palette used across the UI.
const BAR = { "Appointment-Confirmed": "bg-emerald-500", "Appointment-Phone": "bg-sky-500", Appointment: "bg-violet-500" };

const APPT_SELECT = `
  id, appt_date, appt_time, duration_min, rep_name, confirmed_at,
  status:appointment_statuses(id, name),
  user:users!appointments_user_id_fkey(id, first_name, last_name),
  lead:leads(
    id, company_name, contact_name, contact_title, phone, email, city, state, client_note,
    result:call_results(name),
    project:projects!leads_project_id_fkey(id, name, company:companies(id, name))
  )
`;

// Not confirmed yet and still to come (today or later), as the dashboard's calendar has it.
export const AWAITING = "Awaiting confirmation";
// Statuses an appointment still waiting for its confirmation call can have (not Confirmed, Held, Cancelled, No Show).
const OPEN_STATUSES = ["Scheduled", "Rescheduled"];
/** An appointment ({ appt_date, confirmed_at, status, invalid_at }) still waiting for its confirmation call on `today`. */
function isAwaiting(a, today) {
  const status = one(a.status)?.name;
  return Boolean(today) && !a.confirmed_at && !a.invalid_at && a.appt_date >= today && (!status || OPEN_STATUSES.includes(status));
}

function toApptView(a, today = null) {
  const lead = one(a.lead);
  // Its kind as its call result says (Appointment, Appointment-Phone, Appointment-Confirmed), not the old system's status.
  const kind = appointmentKind(one(lead?.result)?.name, Boolean(a.confirmed_at));
  // Every calendar (Oct 2026: the client's admins and managers): one still to be confirmed reads Awaiting confirmation,
  // in the dashboard's yellow, rather than Scheduled, so it stands out on a day or week.
  const waiting = isAwaiting(a, today);
  const user = one(a.user);
  const rep = a.rep_name || shortName(user);
  const { time, ampm } = splitTime(a.appt_time);

  return {
    id: a.id,
    date: a.appt_date,
    time,
    ampm,
    co: lead?.company_name ?? "—",
    detail: [waiting ? AWAITING : kind, lead?.contact_name, `${a.duration_min ?? 30} min`]
      .filter(Boolean)
      .join(" · "),
    rep,
    repI: initialsOf(rep),
    repC: colorFor(rep),
    bar: waiting ? "bg-[var(--event-waiting)]" : BAR[kind] ?? BAR.Appointment,
    leadId: lead?.id ?? null,
    appt_time: a.appt_time,
    status: waiting ? AWAITING : one(a.status)?.name ?? "—",
    waiting,
    // Where the block sits on a day/week time grid.
    startMin: timeRank(a.appt_time),
    duration: a.duration_min ?? 30,
    // Enough to run the call from the calendar without opening the lead.
    contact: lead?.contact_name ?? null,
    contactTitle: lead?.contact_title ?? null,
    phone: lead?.phone ?? null,
    email: lead?.email ?? null,
    location: cityState(lead),
    kind,
    // Confirmed (the confirmation call made); one not yet, still to come, is awaiting it.
    confirmed: Boolean(a.confirmed_at),
    project: one(lead?.project)?.name ?? null,
    client: one(one(lead?.project)?.company)?.name ?? null,
    // What the client is told about it, written as it was set.
    clientNote: lead?.client_note ?? null,
    longDate: longDate(a.appt_date),
  };
}

/** Every appointment between two ISO days, inclusive, in date and time order. */
async function fetchAppointments({ from, to, projectIds = null, userId = null } = {}) {
  // A calendar of no projects (a client with none yet) is empty, not everyone's.
  if (projectIds && !projectIds.length) return [];
  const [supabase, today] = await Promise.all([createClient(), getBusinessToday()]);
  // A busy month passes the API's 1,000-row cap, so it is read in pages.
  const rows = await readAll((first, last) => {
    // Ones marked invalid were charged back: they are not on the calendar or in its counts.
    let q = supabase.from("appointments").select(APPT_SELECT).is("invalid_at", null).order("appt_date").order("id").range(first, last);
    if (from) q = q.gte("appt_date", from);
    if (to) q = q.lte("appt_date", to);
    // One client's or one project's calendar: the projects its appointments are kept on.
    if (projectIds) q = q.in("project_id", projectIds);
    // Those one manager set (the Appointments page's Manager filter).
    if (userId) q = q.eq("user_id", Number(userId));
    return q;
  });
  return rows
    .map((a) => toApptView(a, today))
    .sort((a, b) => a.date.localeCompare(b.date) || timeRank(a.appt_time) - timeRank(b.appt_time));
}

/** Today's and tomorrow's appointments, where the business is — the shape the dashboard renders. */
export async function getAppointments() {
  const today = await getBusinessToday();
  const tomorrow = addDays(today, 1);

  const rows = await fetchAppointments({ from: today, to: tomorrow });
  return {
    today: rows.filter((a) => a.date === today),
    tomorrow: rows.filter((a) => a.date === tomorrow),
  };
}

/** The seven days from the business's today, grouped by day, for the appointments page. */
export async function getWeekAppointments({ projectIds = null, userId = null } = {}) {
  const today = await getBusinessToday();
  // Narrowed as the page's list is (Oct 2026: its client, project, manager and Sales Rep), so its tiles follow them.
  const rows = await fetchAppointments({ from: today, to: addDays(today, 6), projectIds, userId });
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
export async function getCalendarRange(from, to, projectIds = null) {
  const rows = await fetchAppointments({ from, to, projectIds });
  const byDate = {};
  for (const a of rows) (byDate[a.date] ||= []).push(a);
  return { rows, byDate, count: rows.length };
}

/** A calendar month keyed by day-of-month. */
export async function getCalendarMonth(year, month /* 0-indexed */, projectIds = null) {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const rows = await fetchAppointments({ from: isoDay(first), to: isoDay(last), projectIds });

  const byDay = {};
  for (const a of rows) {
    const day = Number(String(a.date).slice(8, 10));
    byDay[day] = (byDay[day] || 0) + 1;
  }
  return { rows, byDay, count: rows.length };
}

/**
 * The projects of a client, or of the clients one Sales Rep owns (Oct 2026),
 * or both: an appointment list narrowed to them. Null when neither is asked.
 */
export async function clientProjectIds({ clientId = null, repId = null } = {}) {
  if (!clientId && !repId) return null;
  const supabase = await createClient();
  let q = supabase.from("projects").select("id, company:companies!inner(id, sales_rep_id)");
  if (clientId) q = q.eq("company_id", Number(clientId));
  if (repId) q = q.eq("company.sales_rep_id", Number(repId));
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p) => p.id);
}

/**
 * The Appointments page's list (Sean, Oct 2026): appointments from `from` to
 * `to` (their day), filtered by client (`clientId`: its projects'), project
 * (one kept on it, or set from it), the manager who set it (`userId`) and
 * status (`status`, a name; "Invalid" shows the ones marked invalid, which
 * are otherwise left out). In date and time order, at most 2,000. Each:
 * when, the company and contact, client, project, agent, status, who set it.
 */
export async function listAppointments({ from, to, clientId = null, projectId = null, userId = null, status = null, repId = null }) {
  const [supabase, today] = await Promise.all([createClient(), getBusinessToday()]);
  const projectIds = await clientProjectIds({ clientId, repId });
  if (projectIds && !projectIds.length) return { rows: [], capped: false };
  let statusId = null;
  // Awaiting confirmation (Oct 2026): still open, not confirmed, today or later.
  const awaiting = status === AWAITING;
  const openIds = awaiting
    ? ((await supabase.from("appointment_statuses").select("id").in("name", OPEN_STATUSES)).data ?? []).map((r) => r.id)
    : null;
  if (status && status !== "Invalid" && !awaiting) {
    const { data } = await supabase.from("appointment_statuses").select("id").eq("name", status).maybeSingle();
    if (!data) return { rows: [], capped: false };
    statusId = data.id;
  }
  const MAX = 2000;
  const rows = await readAll((first, last) => {
    let q = supabase.from("appointments")
      .select(`id, appt_date, appt_time, duration_min, rep_name, invalid_at, confirmed_at,
        status:appointment_statuses(name),
        setter:users!appointments_user_id_fkey(id, first_name, last_name), follow_up_user_id,
        project:projects!appointments_project_id_fkey(id, name, company:companies(id, name)),
        lead:leads!inner(id, company_name, contact_name, city, state)`)
      // Only with a lead still there to open (one deleted leaves nothing to show).
      .gte("appt_date", from).lte("appt_date", to)
      .order("appt_date").order("id").range(first, last);
    if (status === "Invalid") q = q.not("invalid_at", "is", null);
    else {
      q = q.is("invalid_at", null);
      if (statusId) q = q.eq("status_id", statusId);
      if (awaiting) q = q.is("confirmed_at", null).gte("appt_date", today).in("status_id", openIds);
    }
    if (projectIds) q = q.in("project_id", projectIds);
    if (projectId) q = q.or(`project_id.eq.${Number(projectId)},set_project_id.eq.${Number(projectId)}`);
    if (userId) q = q.eq("user_id", Number(userId));
    return q;
  }, { max: MAX });
  const shaped = rows.map((a) => {
    const lead = one(a.lead);
    const project = one(a.project);
    const setter = one(a.setter);
    const { time, ampm } = splitTime(a.appt_time);
    return {
      id: a.id, date: a.appt_date, time, ampm, appt_time: a.appt_time, duration: a.duration_min ?? 30,
      co: lead?.company_name ?? "—", contact: lead?.contact_name ?? null, location: cityState(lead), leadId: lead?.id ?? null,
      client: one(project?.company)?.name ?? "—", project: project?.name ?? "—", agent: a.rep_name || "—",
      status: a.invalid_at ? "Invalid" : isAwaiting(a, today) ? AWAITING : one(a.status)?.name ?? "—",
      manager: setter ? [setter.first_name, setter.last_name].filter(Boolean).join(" ") || "—" : "—",
      // Who follows it up now (handed over from a manager who left; Oct 2026), else who set it: where a message about it goes.
      managerId: a.follow_up_user_id ?? setter?.id ?? null,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || timeRank(a.appt_time) - timeRank(b.appt_time));
  return { rows: shaped, capped: rows.length >= MAX };
}

/**
 * What the Appointments page's filters offer, as the signed-in person may
 * see it: clients, projects (each with its client), the staff who set
 * appointments, and the appointment statuses.
 */
export async function getAppointmentFilters() {
  const supabase = await createClient();
  const [companies, projects, staff, statuses] = await Promise.all([
    supabase.from("companies").select("id, name").order("name").limit(2000),
    supabase.from("projects").select("id, name, company_id").order("name").limit(5000),
    supabase.from("users").select("id, first_name, last_name, role").in("role", ["admin", "manager", "agent"]).order("first_name").order("last_name").limit(1000),
    supabase.from("appointment_statuses").select("name").order("id"),
  ]);
  return {
    clients: (companies.data ?? []).map((c) => ({ value: String(c.id), label: c.name })),
    projects: (projects.data ?? []).map((p) => ({ value: String(p.id), label: p.name, clientId: p.company_id })),
    managers: (staff.data ?? []).map((u) => ({ value: String(u.id), label: [u.first_name, u.last_name].filter(Boolean).join(" ") || "—", role: u.role })),
    // Awaiting confirmation first: what the list says of an upcoming one not confirmed yet (Oct 2026).
    statuses: [{ value: AWAITING, label: AWAITING }, ...(statuses.data ?? []).map((s) => ({ value: s.name, label: s.name }))],
  };
}

/** One row of client_appointments(), shaped for the lists. */
function shapeClientAppointment(r) {
  const { time, ampm } = splitTime(r.appt_time);
  return {
    id: r.id, leadId: r.lead_id, co: r.company ?? "—", location: [r.city, r.state].filter(Boolean).join(", ") || null,
    projectId: r.project_id, project: r.project ?? "—", agent: r.agent ?? "—", developedAt: r.developed_at,
    date: r.appt_date, time, ampm, apptTime: r.appt_time, status: r.status, xdate: r.xdate,
    manager: r.manager ?? "—", managerId: r.manager_id,
    update: r.update_status, updateLabel: r.update_label, updateAt: r.update_at, updateBy: r.update_by,
    potential: r.potential_premium == null ? null : Number(r.potential_premium),
    total: r.total_premium == null ? null : Number(r.total_premium),
    soldLines: r.sold_lines ?? null, dueOn: r.due_on, lastNote: r.last_note ?? null,
  };
}

/**
 * Appointments as a client's list shows them (Sean, Oct 2026), by their day
 * from `from` to `to`: client_appointments(), which gives the manager's name
 * (a client cannot read the staff) and each one's update. `status`: only
 * those showing it.
 */
export async function getClientAppointments({ from, to, projectId = null, status = null, companyId = null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_appointments", {
    p_from: from, p_to: to, p_project_id: projectId ? Number(projectId) : null, p_status: status || null, p_company_id: companyId ? Number(companyId) : null,
  });
  if (error) throw error;
  return (data ?? []).map(shapeClientAppointment);
}

/** A lead's appointments (newest first), as the client's list shows them: for its page. */
export async function getLeadAppointments(leadId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_appointments", { p_from: "2000-01-01", p_to: "2100-01-01", p_lead_id: Number(leadId) });
  if (error) throw error;
  return (data ?? []).map(shapeClientAppointment);
}

const UPDATE_COLUMNS = `id, appointment_id, lead_id, status, previous_status, note, potential_premium, sold_lines, total_premium, created_at,
  by:users!appointment_updates_created_by_fkey(first_name, last_name, role),
  appointment:appointments(appt_date, appt_time, follow_up_user_id, setter:users!appointments_user_id_fkey(id, first_name, last_name)),
  lead:leads(id, company_name), project:projects(id, name), company:companies(id, name)`;

function shapeUpdate(u) {
  const by = one(u.by);
  const appt = one(u.appointment);
  const setter = one(appt?.setter);
  return {
    id: u.id, appointmentId: u.appointment_id, leadId: u.lead_id, status: u.status, previous: u.previous_status, note: u.note,
    potential: u.potential_premium == null ? null : Number(u.potential_premium),
    total: u.total_premium == null ? null : Number(u.total_premium), lines: u.sold_lines ?? null, at: u.created_at,
    by: by ? [by.first_name, by.last_name].filter(Boolean).join(" ") || "—" : "—", byClient: by?.role === "client",
    apptDate: appt?.appt_date ?? null, apptTime: appt?.appt_time ?? null,
    manager: setter ? [setter.first_name, setter.last_name].filter(Boolean).join(" ") || "—" : "—", managerId: appt?.follow_up_user_id ?? setter?.id ?? null,
    co: one(u.lead)?.company_name ?? "—", project: one(u.project)?.name ?? "—", client: one(u.company)?.name ?? "—",
    companyId: one(u.company)?.id ?? null,
  };
}

/**
 * Every update to a lead's appointments, newest first: its page's Appointment Updates, for
 * administrators and managers and the client's own people (lead_client_updates(), which names who
 * made each one; a client cannot read the staff).
 */
export async function getLeadAppointmentUpdates(leadId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_client_updates", { p_lead_id: Number(leadId) });
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id, appointmentId: u.appointment_id, status: u.status, previous: u.previous_status, note: u.note,
    potential: u.potential_premium == null ? null : Number(u.potential_premium),
    total: u.total_premium == null ? null : Number(u.total_premium), lines: u.sold_lines ?? null, at: u.created_at,
    by: u.by_name ?? "—", byClient: Boolean(u.by_client), apptDate: u.appt_date ?? null, apptTime: u.appt_time ?? null,
  }));
}

/**
 * Appointment Updates (administrators, Data & Insights): every update as it
 * came in, newest first, from `from` to `to` (the business's days), for one
 * client or status if asked.
 */
export async function getAppointmentUpdatesFeed({ from, to, companyId = null, companyIds = null, status = null }) {
  const supabase = await createClient();
  let q = supabase.rpc("appointment_updates_between", { p_from: from, p_to: to }).select(UPDATE_COLUMNS)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1000);
  if (companyId) q = q.eq("company_id", Number(companyId));
  // A Sales Rep's clients (none: nothing).
  if (companyIds) q = q.in("company_id", companyIds.length ? companyIds : [0]);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(shapeUpdate);
}
