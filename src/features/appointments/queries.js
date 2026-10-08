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
async function fetchAppointments({ from, to } = {}) {
  const supabase = await createClient();
  // A busy month passes the API's 1,000-row cap, so it is read in pages.
  const rows = await readAll((first, last) => {
    // Ones marked invalid were charged back: they are not on the calendar or in its counts.
    let q = supabase.from("appointments").select(APPT_SELECT).is("invalid_at", null).order("appt_date").order("id").range(first, last);
    if (from) q = q.gte("appt_date", from);
    if (to) q = q.lte("appt_date", to);
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
