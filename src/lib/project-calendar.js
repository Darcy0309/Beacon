/**
 * A project's calendar: its appointments and the time blocked out on it.
 * What is on a day, and what a slot someone means to book runs into. Pure
 * functions; days are "YYYY-MM-DD", times of day minutes past midnight.
 */

import { addDays, formatIso, weekdayOf } from "./dates.js";
import { WEEKDAYS, weekdayList } from "./project-info.js";

/** "9:30 AM", "13:00" or "13:00:00" as minutes past midnight; null when it is not a time. */
export function minutesOf(time) {
  const t = String(time ?? "").trim();
  let m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t);
  if (m) {
    const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
    return h * 60 + Number(m[2]);
  }
  m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
  return m && Number(m[1]) < 24 ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 630 -> "10:30 AM". */
export const clockOf = (minutes) => {
  const h = Math.floor(minutes / 60);
  return `${((h + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** The times a block can start or end at: every half hour from 6 AM to 9 PM. */
export const BLOCK_TIMES = Array.from({ length: 31 }, (_, i) => clockOf(360 + i * 30));

/** When a block applies each day: "All day" or "10:00 AM – 1:00 PM". */
export const blockHours = (b) => (b.start == null ? "All day" : `${clockOf(b.start)} – ${clockOf(b.end)}`);
/** Its days: "Oct 20", "Oct 20 – Oct 22", or every week, "Every Mon & Fri". */
export const blockDays = (b) => (b.weekdays
  ? `Every ${weekdayList(b.weekdays)}`
  : b.startsOn === b.endsOn ? formatIso(b.startsOn, "short") : `${formatIso(b.startsOn, "short")} – ${formatIso(b.endsOn, "short")}`);

/** Whether a block covers `day`: within its days and, for one kept every week, on one of its weekdays. */
export const blockOn = (b, day) => day >= b.startsOn && day <= b.endsOn && (!b.weekdays || b.weekdays.includes(weekdayOf(day)));

/**
 * The weekdays a client takes no appointments on (Project Info's days to
 * avoid; Sean, Oct 2026), as one block kept every week from `from` to `to`:
 * blocked all day, shown with the calendar's other blocked time, taken off
 * only by changing the Project Info. Null without any days. `project`: the
 * calendar's name, when several are shown together.
 */
export function weeklyBlock({ projectId, days, from, to, project = null }) {
  const weekdays = WEEKDAYS.map(([d]) => d).filter((d) => (days ?? []).map(Number).includes(d));
  if (!weekdays.length) return null;
  return {
    id: `w${projectId}`, startsOn: from, endsOn: to, start: null, end: null, weekdays, weekly: true,
    note: "Days to avoid, from Project Info", synced: false, by: null, byClient: false, ...(project ? { project } : {}),
  };
}

/**
 * What a calendar has on `day`, in the order of the day: blocked time, notes
 * on its times and appointments, each { kind, key, start, end, ... } (an
 * all-day block first).
 */
export function eventsOn(day, { appointments = [], blocks = [], notes = [] }) {
  const out = [];
  for (const b of blocks) {
    if (blockOn(b, day)) out.push({ kind: "block", key: `b${b.id}`, start: b.start ?? -1, end: b.end ?? 1440, block: b });
  }
  // A note on a time of day: there at its time, for the half hour it names.
  for (const n of notes) {
    if (n.date === day && n.start != null) out.push({ kind: "note", key: `n${n.id}`, start: n.start, end: n.start + 30, note: n });
  }
  for (const a of appointments) {
    if (a.date !== day) continue;
    const start = minutesOf(a.time);
    out.push({ kind: "appointment", key: `a${a.id}`, start: start ?? 1441, end: (start ?? 1441) + (a.duration ?? 30), appointment: a });
  }
  return out.sort((x, y) => x.start - y.start || x.key.localeCompare(y.key));
}

/** Per day from `from` to `to`: how many appointments and notes, and whether any of it is blocked ("day" or "part"). */
export function dayMarks({ appointments = [], blocks = [], notes = [] }, from, to) {
  const marks = {};
  for (const a of appointments) {
    if (a.date >= from && a.date <= to) (marks[a.date] ||= { appointments: 0, blocked: null }).appointments += 1;
  }
  for (const n of notes) {
    if (n.date >= from && n.date <= to) {
      const m = (marks[n.date] ||= { appointments: 0, blocked: null });
      m.notes = (m.notes ?? 0) + 1;
    }
  }
  for (const b of blocks) {
    for (let d = b.startsOn < from ? from : b.startsOn; d <= b.endsOn && d <= to; d = addDays(d, 1)) {
      if (b.weekdays && !b.weekdays.includes(weekdayOf(d))) continue;
      const m = (marks[d] ||= { appointments: 0, blocked: null });
      m.blocked = b.start == null ? "day" : m.blocked ?? "part";
    }
  }
  return marks;
}

/**
 * What a slot someone means to book ({ date, time, duration }) runs into:
 * blocked time, and appointments already there (not `exceptId`, the one
 * being moved). Each { kind, text }; none when the slot is clear, or not
 * yet a full date and time.
 */
export function slotClashes({ date, time, duration = 30, exceptId = null }, calendar) {
  const start = minutesOf(time);
  if (!date || start == null) return [];
  const end = start + (Number(duration) || 30);
  return eventsOn(date, calendar)
    // A note says something about a time without keeping it free: never in the way.
    .filter((e) => e.kind !== "note" && e.start < end && e.end > start && !(e.kind === "appointment" && e.appointment.id === exceptId))
    .map((e) => (e.kind === "block"
      ? { kind: "block", text: e.block.weekly
          ? `No appointments on ${weekdayList([weekdayOf(date)], { plural: true })} (the client's days to avoid, in Project Info)`
          : e.block.synced
          ? `Busy ${e.block.start == null ? "all day" : blockHours(e.block)}${e.block.by ? ` on ${e.block.by}'s calendar` : " on a connected calendar"}`
          : `Blocked out ${e.block.start == null ? "all day" : blockHours(e.block)}${e.block.note ? ` (${e.block.note})` : ""}` }
      : { kind: "appointment", text: `Already booked: ${e.appointment.time}${e.appointment.company ? ` ${e.appointment.company}` : ""}, ${e.appointment.duration ?? 30} min` }));
}
