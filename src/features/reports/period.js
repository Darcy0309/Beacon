/**
 * The production report's date range, read from the URL: a preset
 * (?period=today|yesterday|week|month|last-month) or ?period=custom with
 * ?from=&to=. Days are calendar days in the business's time zone.
 */

import { todayIn } from "@/lib/dates";

export const PERIODS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["last-month", "Last month"],
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

const day = (iso) => new Date(`${iso}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/**
 * { period, from, to, label, error } for the report. A custom range that is
 * missing, reversed or longer than a year falls back to today, with a
 * message saying why.
 */
export function readPeriod(sp, timeZone) {
  const today = day(todayIn(timeZone));
  const period = PERIODS.some(([key]) => key === sp?.period) || sp?.period === "custom" ? sp.period : "today";
  const range = (from, to, label) => ({ period, from: iso(from), to: iso(to), label, error: null });

  switch (period) {
    case "yesterday":
      return range(addDays(today, -1), addDays(today, -1), "Yesterday");
    case "week": {
      // Weeks start on Monday.
      const back = (today.getUTCDay() + 6) % 7;
      return range(addDays(today, -back), today, "This week");
    }
    case "month":
      return range(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), today, "This month");
    case "last-month": {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return range(first, last, "Last month");
    }
    case "custom": {
      const from = ISO.test(sp?.from ?? "") ? day(sp.from) : null;
      const to = ISO.test(sp?.to ?? "") ? day(sp.to) : null;
      let error = null;
      if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) error = "Choose both a start and an end date.";
      else if (to < from) error = "The start date is after the end date.";
      else if ((to - from) / 86400000 > MAX_DAYS) error = "Choose a range of a year or less.";
      if (error) return { ...range(today, today, "Today"), period: "today", error };
      const label = sp.from === sp.to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
      return range(from, to, label);
    }
    default:
      return range(today, today, "Today");
  }
}

function fmt(d) {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** The first day of a tile's trend: the range's start, or two weeks before its end if that is earlier. */
export function trendStart(range, days = 14) {
  const back = iso(addDays(day(range.to), 1 - days));
  return back < range.from ? back : range.from;
}

/** Every day in the range, oldest first (for a per-day series). */
export function daysBetween(from, to) {
  const out = [];
  for (let d = day(from); d <= day(to) && out.length <= MAX_DAYS; d = addDays(d, 1)) out.push(iso(d));
  return out;
}
