/** Appointments and the calendar. */

import "server-only";
import { cityState, colorFor, initialsOf, isoDay, longDate, shortName, splitTime, timeRank } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
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
  user:users(id, first_name, last_name),
  lead:leads(
    id, company_name, contact_name, contact_title, phone, email, city, state,
    status:lead_statuses(code, name),
    project:projects(id, name, company:companies(id, name))
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
    longDate: longDate(a.appt_date),
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
