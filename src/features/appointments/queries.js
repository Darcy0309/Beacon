/** Appointments and the calendar. */

import "server-only";
import { cityState, colorFor, initialsOf, isoDay, longDate, shortName, splitTime, timeRank } from "@/lib/format";
import { addDays } from "@/lib/dates";
import { getBusinessToday } from "@/lib/server/business-day";
import { one, readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

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
  user:users!appointments_user_id_fkey(id, first_name, last_name),
  lead:leads(
    id, company_name, contact_name, contact_title, phone, email, city, state, client_note,
    status:lead_statuses(code, name),
    project:projects!leads_project_id_fkey(id, name, company:companies(id, name))
  )
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
    // Enough to run the call from the calendar without opening the lead.
    contact: lead?.contact_name ?? null,
    contactTitle: lead?.contact_title ?? null,
    phone: lead?.phone ?? null,
    email: lead?.email ?? null,
    location: cityState(lead),
    leadStatus: leadStatus?.name ?? null,
    statusCode: leadStatus?.code ?? "new",
    project: one(lead?.project)?.name ?? null,
    client: one(one(lead?.project)?.company)?.name ?? null,
    // What the client is told about it, written as it was set.
    clientNote: lead?.client_note ?? null,
    longDate: longDate(a.appt_date),
  };
}

/** Every appointment between two ISO days, inclusive, in date and time order. */
async function fetchAppointments({ from, to, projectIds = null } = {}) {
  // A calendar of no projects (a client with none yet) is empty, not everyone's.
  if (projectIds && !projectIds.length) return [];
  const supabase = await createClient();
  // A busy month passes the API's 1,000-row cap, so it is read in pages.
  const rows = await readAll((first, last) => {
    // Ones marked invalid were charged back: they are not on the calendar or in its counts.
    let q = supabase.from("appointments").select(APPT_SELECT).is("invalid_at", null).order("appt_date").order("id").range(first, last);
    if (from) q = q.gte("appt_date", from);
    if (to) q = q.lte("appt_date", to);
    // One client's or one project's calendar: the projects its appointments are kept on.
    if (projectIds) q = q.in("project_id", projectIds);
    return q;
  });
  return rows
    .map(toApptView)
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
export async function getWeekAppointments() {
  const today = await getBusinessToday();
  const rows = await fetchAppointments({ from: today, to: addDays(today, 6) });
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
 * The Appointments page's list (Sean, Oct 2026): appointments from `from` to
 * `to` (their day), filtered by client (`clientId`: its projects'), project
 * (one kept on it, or set from it), the manager who set it (`userId`) and
 * status (`status`, a name; "Invalid" shows the ones marked invalid, which
 * are otherwise left out). In date and time order, at most 2,000. Each:
 * when, the company and contact, client, project, agent, status, who set it.
 */
export async function listAppointments({ from, to, clientId = null, projectId = null, userId = null, status = null }) {
  const supabase = await createClient();
  let projectIds = null;
  if (clientId) {
    const { data, error } = await supabase.from("projects").select("id").eq("company_id", clientId);
    if (error) throw error;
    projectIds = (data ?? []).map((p) => p.id);
    if (!projectIds.length) return { rows: [], capped: false };
  }
  let statusId = null;
  if (status && status !== "Invalid") {
    const { data } = await supabase.from("appointment_statuses").select("id").eq("name", status).maybeSingle();
    if (!data) return { rows: [], capped: false };
    statusId = data.id;
  }
  const MAX = 2000;
  const rows = await readAll((first, last) => {
    let q = supabase.from("appointments")
      .select(`id, appt_date, appt_time, duration_min, rep_name, invalid_at,
        status:appointment_statuses(name),
        setter:users!appointments_user_id_fkey(first_name, last_name),
        project:projects!appointments_project_id_fkey(id, name, company:companies(id, name)),
        lead:leads!inner(id, company_name, contact_name, city, state)`)
      // Only with a lead still there to open (one deleted leaves nothing to show).
      .gte("appt_date", from).lte("appt_date", to)
      .order("appt_date").order("id").range(first, last);
    if (status === "Invalid") q = q.not("invalid_at", "is", null);
    else {
      q = q.is("invalid_at", null);
      if (statusId) q = q.eq("status_id", statusId);
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
      status: a.invalid_at ? "Invalid" : one(a.status)?.name ?? "—",
      manager: setter ? [setter.first_name, setter.last_name].filter(Boolean).join(" ") || "—" : "—",
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
    supabase.from("users").select("id, first_name, last_name").in("role", ["admin", "manager", "agent"]).order("first_name").order("last_name").limit(1000),
    supabase.from("appointment_statuses").select("name").order("id"),
  ]);
  return {
    clients: (companies.data ?? []).map((c) => ({ value: String(c.id), label: c.name })),
    projects: (projects.data ?? []).map((p) => ({ value: String(p.id), label: p.name, clientId: p.company_id })),
    managers: (staff.data ?? []).map((u) => ({ value: String(u.id), label: [u.first_name, u.last_name].filter(Boolean).join(" ") || "—" })),
    statuses: (statuses.data ?? []).map((s) => ({ value: s.name, label: s.name })),
  };
}
