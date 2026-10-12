/**
 * The administrator's production chart (production_chart()): its ranges,
 * how the days and hours are drawn, the high, low and average, leads and
 * appointments per hour worked, and the monthly goals spread over the days
 * shown. Pure functions on "YYYY-MM-DD" days.
 */

import { addDays, addMonths, isIsoDate, weekdayOf } from "./dates.js";

/** The ranges offered, stock-chart style; the last few under "More". */
export const CHART_RANGES = [
  { key: "1D", label: "1D" },
  { key: "5D", label: "5D" },
  { key: "1W", label: "1W" },
  { key: "2W", label: "2W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1 year", more: true },
  { key: "2Y", label: "2 years", more: true },
  { key: "custom", label: "Custom range…", more: true },
];

/** A day drawn by the hour: open to close, on the business's clock. */
export const DAY_OPEN = 5;
export const DAY_CLOSE = 18;
/** The 1D axis starts at this, and grows past it only when the day does. */
export const DAY_AXIS = 100;

const isWorkday = (iso) => weekdayOf(iso) !== 0 && weekdayOf(iso) !== 6;

/** The working days (Monday to Friday) from `from` to `to`. */
export function workdaysBetween(from, to) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) n += 1;
  return n;
}

/**
 * The days a range covers, up to `today`: { key, from, to }. 5D is five
 * working days, as a market's are; custom takes `from`/`to` (no further than
 * today, two years at most).
 */
export function chartRange(key, today, custom = {}) {
  const back = (n) => addDays(today, -n);
  switch (key) {
    case "5D": {
      let from = today;
      for (let n = isWorkday(today) ? 1 : 0; n < 5; ) {
        from = addDays(from, -1);
        if (isWorkday(from)) n += 1;
      }
      return { key, from, to: today };
    }
    case "1W": return { key, from: back(6), to: today };
    case "2W": return { key, from: back(13), to: today };
    case "1M": return { key, from: addDays(addMonths(today, -1), 1), to: today };
    case "3M": return { key, from: addDays(addMonths(today, -3), 1), to: today };
    case "6M": return { key, from: addDays(addMonths(today, -6), 1), to: today };
    case "YTD": return { key, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "1Y": return { key, from: addDays(addMonths(today, -12), 1), to: today };
    case "2Y": return { key, from: addDays(addMonths(today, -24), 1), to: today };
    case "custom": {
      const to = isIsoDate(custom.to) && custom.to <= today ? custom.to : today;
      let from = isIsoDate(custom.from) && custom.from <= to ? custom.from : addDays(to, -29);
      if (from < addMonths(to, -24)) from = addMonths(to, -24);
      return { key, from, to };
    }
    default: return { key: "1D", from: today, to: today };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8))}`;
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

/** The monthly goals ({ "2026-10-01": { leads, appts } }) a day of `month` carries: a working day's share. */
function dayGoal(goals, iso) {
  const month = `${iso.slice(0, 8)}01`;
  const g = goals?.[month];
  if (!g || !isWorkday(iso)) return { leads: g ? 0 : null, appts: g ? 0 : null };
  const end = addDays(addMonths(month, 1), -1);
  const wd = workdaysBetween(month, end) || 1;
  return { leads: g.leads != null ? g.leads / wd : null, appts: g.appts != null ? g.appts / wd : null };
}

/**
 * The points to draw: for one day, by the hour from open to close, each the
 * running total so far (anything before open counts at open, after close at
 * close); for up to three months, by the day; beyond, by the week (Monday
 * to Sunday). Each point: { label, title, leads, appts, goalLeads, goalAppts }.
 */
export function chartPoints({ days = [], hours = [] }, range, goals = {}) {
  if (range.from === range.to) {
    let leads = 0;
    let appts = 0;
    const g = dayGoal(goals, range.from);
    const out = [];
    for (let h = DAY_OPEN; h <= DAY_CLOSE; h++) {
      for (const x of hours.filter((y) => Math.min(Math.max(y.hour, DAY_OPEN), DAY_CLOSE) === h)) {
        leads += Number(x.leads) || 0;
        appts += Number(x.appts) || 0;
      }
      out.push({ label: hourLabel(h), title: `By ${hourLabel(h + 1 > 23 ? 23 : h + 1)}`, leads, appts, goalLeads: g.leads, goalAppts: g.appts, hour: h });
    }
    return out;
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  const point = (from, to, label, title) => {
    let leads = 0;
    let appts = 0;
    let goalLeads = null;
    let goalAppts = null;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      leads += Number(byDay.get(d)?.leads) || 0;
      appts += Number(byDay.get(d)?.appts) || 0;
      const g = dayGoal(goals, d);
      if (g.leads != null) goalLeads = (goalLeads ?? 0) + g.leads;
      if (g.appts != null) goalAppts = (goalAppts ?? 0) + g.appts;
    }
    return { label, title, leads, appts, goalLeads, goalAppts, from, to };
  };
  const span = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1;
  const out = [];
  if (span <= 93) {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(point(d, d, dayLabel(d), dayLabel(d)));
    return out;
  }
  // Weeks from the Monday on or before the first day, cut to the range at both ends.
  let start = addDays(range.from, -((weekdayOf(range.from) + 6) % 7));
  for (; start <= range.to; start = addDays(start, 7)) {
    const from = start < range.from ? range.from : start;
    const end = addDays(start, 6) > range.to ? range.to : addDays(start, 6);
    out.push(point(from, end, dayLabel(from), `Week of ${dayLabel(start)}`));
  }
  return out;
}

/**
 * The figures under the chart, for leads and for appointments: the total;
 * the high, low and average of a point (an hour for one day, else a day or
 * a week); per hour worked (lead managers' hours for leads, appointment
 * managers' for appointments); and the share of the goal for the days shown.
 */
export function chartStats({ days = [], hours = [] }, range, goals = {}, rates = {}) {
  const oneDay = range.from === range.to;
  const points = oneDay
    ? Array.from({ length: DAY_CLOSE - DAY_OPEN + 1 }, (_, i) => {
        const h = DAY_OPEN + i;
        const at = hours.filter((y) => Math.min(Math.max(y.hour, DAY_OPEN), DAY_CLOSE) === h);
        return { leads: at.reduce((n, y) => n + (Number(y.leads) || 0), 0), appts: at.reduce((n, y) => n + (Number(y.appts) || 0), 0) };
      })
    : chartPoints({ days }, range, {});
  const minutes = {
    leads: days.reduce((n, d) => n + (Number(d.lead_minutes) || 0), 0),
    appts: days.reduce((n, d) => n + (Number(d.appt_minutes) || 0), 0),
  };
  let goal = { leads: null, appts: null };
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const g = dayGoal(goals, d);
    if (g.leads != null) goal.leads = (goal.leads ?? 0) + g.leads;
    if (g.appts != null) goal.appts = (goal.appts ?? 0) + g.appts;
  }
  const stat = (k) => {
    const values = points.map((p) => p[k]);
    const total = values.reduce((a, b) => a + b, 0);
    const hoursWorked = minutes[k] / 60;
    return {
      total,
      high: values.length ? Math.max(...values) : 0,
      low: values.length ? Math.min(...values) : 0,
      average: values.length ? total / values.length : 0,
      hours: hoursWorked,
      perHour: hoursWorked > 0 ? total / hoursWorked : null,
      targetPerHour: rates[k] ?? null,
      goal: goal[k] != null ? Math.round(goal[k]) : null,
      ofGoal: goal[k] ? Math.round((total / goal[k]) * 100) : null,
    };
  };
  return { leads: stat("leads"), appts: stat("appts"), per: oneDay ? "hour" : points.length && points[0].from !== points[0].to ? "week" : "day" };
}

/** A round top for the value axis, at least `floor`. */
export function axisMax(v, floor = 4) {
  if (v <= floor) return floor;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * A monthly goal from the team behind it: managers × hours a day each ×
 * working days in the month × developed per hour. (5 lead managers, 4
 * hours a day, 21 days, 3 an hour = 1,260 leads.)
 */
export const goalFrom = ({ people, hoursPerDay, days, perHour }) =>
  Math.round((Number(people) || 0) * (Number(hoursPerDay) || 0) * (Number(days) || 0) * (Number(perHour) || 0));
