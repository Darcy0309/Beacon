/**
 * Pay rules in plain functions: the rates an administrator can pick, pay
 * periods, and how hours read. No imports beyond the date helpers, so the
 * browser, the server and the unit tests share them.
 */

import { addDays, addMonths, daysBetween, formatIso, formatRange, isIsoDate, makeIso, monthEnd, monthStart, weekdayOf } from "./dates.js";

export const PAY_MODELS = [
  ["commission", "Commission only"],
  ["hybrid", "Hybrid: hourly or commission, whichever is higher"],
];

export const ROUNDING = [
  ["hour_up", "Round each hour up"],
  ["day_up", "Round each day up"],
  ["day_nearest", "Round each day to the nearest"],
  ["none", "Exact minutes, no rounding"],
];

export const PAY_PERIODS = [
  ["weekly", "Weekly"],
  ["biweekly", "Every two weeks"],
  ["semimonthly", "Twice a month (1st–15th, 16th–end)"],
  ["monthly", "Monthly"],
  ["custom", "Custom schedule (the pay periods below)"],
];

/** Project rates: the key in the rules, the projects column, and what each is called. */
export const RATE_KINDS = [
  ["lead", "lead_rate", "Lead pay", "A DBDev Lead result: the name promoted to appointment setting"],
  ["appointment", "appointment_rate", "Appointment pay", "An appointment set from a call"],
  ["special", "confirmation_rate", "Special pay", "Added for the account manager who confirms an appointment (Appointment-Confirmed)"],
];

const cents = (n) => Math.round(Number(n) * 100);

export const usd = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The rates an administrator can pick for one kind of pay on a project:
 * $0 (not paid on this project), then every step from the range's minimum
 * to its maximum. The project's current rate stays listed even when it is
 * outside the range, so opening the form never changes it by itself.
 */
export function rateOptions(range, current = 0) {
  const lo = cents(range?.min ?? 0);
  const hi = cents(range?.max ?? 0);
  const step = Math.max(1, cents(range?.step ?? 1));
  const out = new Set([0]);
  for (let c = lo; c <= hi && out.size < 500; c += step) out.add(c);
  if (hi >= lo) out.add(hi);
  out.add(cents(current ?? 0));
  return [...out].sort((a, b) => a - b).map((c) => c / 100);
}

/** "7h 30m", "45m", "0m". */
export function hoursLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest}m`;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** Minutes as decimal hours for payroll: 450 → "7.50". */
export const hoursDecimal = (minutes) => ((Number(minutes) || 0) / 60).toFixed(2);

/** "8 AM", "12 PM", "3 PM" for an hour of the day (0–23). */
export function hourLabel(hour) {
  const h = Number(hour);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

/** Days of a period, for its notes and counts: "Wed 12/31". */
export const shortDay = (iso) => `${formatIso(iso, "weekday").slice(0, 3)} ${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * Work days in a period, as the business counts them: Monday to Friday,
 * less the days it is closed (an optional day still counts).
 */
export function workDays(from, to, closed = []) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return 0;
  const off = new Set(closed);
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = weekdayOf(d);
    if (w !== 0 && w !== 6 && !off.has(d)) n += 1;
  }
  return n;
}

/**
 * Days typed for a period ("12/31, 1/1, 1/2" or "Mon 1/19"): each read as a
 * date in the period, whose year it takes (so in 12/30–1/13, "1/1" is the
 * new year's). Returns { dates, bad }: the dates, in order, each once, and
 * what could not be read or is not in the period.
 */
export function parsePeriodDays(text, from, to) {
  const dates = new Set();
  const bad = [];
  for (const raw of String(text ?? "").split(/[,;\n]+/)) {
    const part = raw.replace(/^\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*/i, "").trim();
    if (!part) continue;
    let iso = null;
    const full = part.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? null;
    const us = part.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (full) iso = isIsoDate(part) ? part : null;
    else if (us) {
      const [m, d] = [Number(us[1]), Number(us[2])];
      const years = us[3] ? [Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3])] : [Number(from?.slice(0, 4)), Number(to?.slice(0, 4))];
      iso = years.map((y) => makeIso(y, m, d)).find((x) => x && x >= from && x <= to) ?? (us[3] ? makeIso(years[0], m, d) : null);
    }
    if (iso && iso >= from && iso <= to) dates.add(iso);
    else bad.push(raw.trim());
  }
  return { dates: [...dates].sort(), bad };
}

/** A period from the schedule as the pages show it. */
export function periodView(p) {
  return {
    id: p.id,
    from: p.starts_on,
    to: p.ends_on,
    payDate: p.pay_date ?? null,
    closed: p.closed_dates ?? [],
    closedLabel: p.closed_label ?? "",
    optional: p.optional_dates ?? [],
    optionalLabel: p.optional_label ?? "",
    workDays: workDays(p.starts_on, p.ends_on, p.closed_dates ?? []),
  };
}

/**
 * The period of a schedule (sorted by start) that contains `today`, or the
 * one `offset` places from it. A day between periods (or past the last)
 * counts as in the latest period begun; before the first, the first.
 * Returns null for an empty schedule, or a step past either end.
 */
export function scheduledPeriod(schedule, today, offset = 0) {
  if (!schedule?.length) return null;
  let i = schedule.findIndex((p) => p.from <= today && today <= p.to);
  if (i === -1) {
    i = schedule.reduce((at, p, k) => (p.from <= today ? k : at), -1);
    if (i === -1) i = 0;
  }
  const p = schedule[i + offset];
  return p ? { from: p.from, to: p.to, payDate: p.payDate, scheduled: true } : null;
}

/**
 * The pay period that contains `today` ("YYYY-MM-DD"), or with `offset` the
 * one that many periods before (-1) or after (1). `time` holds the rules'
 * pay_period and, for weekly and two-weekly periods, period_start: any day a
 * period starts on; for a custom schedule, `time.schedule` (periodView rows,
 * by start), falling back to two weeks from period_start while it is empty.
 */
export function payPeriod(today, time = {}, offset = 0) {
  if (time.pay_period === "custom") {
    const found = scheduledPeriod(time.schedule, today, offset);
    if (found) return found;
    if (time.schedule?.length) {
      // A step past the schedule's end: the period as long as the nearest one, next to it.
      const edge = offset < 0 ? time.schedule[0] : time.schedule[time.schedule.length - 1];
      const len = daysBetween(edge.from, edge.to) + 1;
      return offset < 0 ? { from: addDays(edge.from, -len), to: addDays(edge.from, -1) } : { from: addDays(edge.to, 1), to: addDays(edge.to, len) };
    }
    return payPeriod(today, { ...time, pay_period: "biweekly" }, offset);
  }
  const kind = time.pay_period ?? "weekly";
  if (kind === "weekly" || kind === "biweekly") {
    const len = kind === "weekly" ? 7 : 14;
    const anchor = isIsoDate(time.period_start) ? time.period_start : "2026-10-05";
    const n = Math.floor(daysBetween(anchor, today) / len) + offset;
    const from = addDays(anchor, n * len);
    return { from, to: addDays(from, len - 1) };
  }
  if (kind === "semimonthly") {
    // Halves of the month, counted from the half that contains today.
    const firstHalf = Number(today.slice(8, 10)) <= 15;
    let half = Number(today.slice(0, 4)) * 24 + (Number(today.slice(5, 7)) - 1) * 2 + (firstHalf ? 0 : 1) + offset;
    const year = Math.floor(half / 24);
    half -= year * 24;
    const month = Math.floor(half / 2) + 1;
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    return half % 2 === 0 ? { from: first, to: `${first.slice(0, 8)}15` } : { from: `${first.slice(0, 8)}16`, to: monthEnd(first) };
  }
  const from = addMonths(monthStart(today), offset);
  return { from, to: monthEnd(from) };
}

/** What a pay period is called: "This pay period", "Last pay period". */
export const PERIOD_PRESETS = [
  ["current", "This pay period", 0],
  ["previous", "Last pay period", -1],
];

/**
 * The report's period from the URL: ?period=current (the default) or
 * previous, or ?period=custom with ?from=&to= (a year at most). A custom
 * range that is missing, reversed or too long falls back to the current
 * pay period, with a message saying why.
 */
export function readPayPeriod(sp, today, time) {
  if (sp?.period === "custom") {
    const { from, to } = sp;
    let error = null;
    if (!isIsoDate(from) || !isIsoDate(to)) error = "Choose both a start and an end date.";
    else if (to < from) error = "The start date is after the end date.";
    else if (daysBetween(from, to) > 366) error = "Choose a range of a year or less.";
    if (!error) {
      // One of the schedule's periods, picked from its list: called so, with its pay date.
      const planned = time?.pay_period === "custom" ? time.schedule?.find((p) => p.from === from && p.to === to) : null;
      const label = planned ? `Pay period · ${formatRange(from, to)}${planned.payDate ? ` · paid ${formatIso(planned.payDate, "short")}` : ""}` : formatRange(from, to);
      return { period: "custom", from, to, payDate: planned?.payDate ?? null, label, error: null };
    }
    const current = payPeriod(today, time, 0);
    return { period: "current", ...current, label: `This pay period · ${formatRange(current.from, current.to)}`, error };
  }
  const [key, label, offset] = PERIOD_PRESETS.find(([k]) => k === sp?.period) ?? PERIOD_PRESETS[0];
  const range = payPeriod(today, time, offset);
  const paid = range.payDate ? ` · paid ${formatIso(range.payDate, "short")}` : "";
  return { period: key, ...range, label: `${label} · ${formatRange(range.from, range.to)}${paid}`, error: null };
}

/** The periods a dashboard figure can be counted over, in the order they are offered. */
export const TILE_PERIODS = [
  ["period", "Pay period"],
  ["week", "Week"],
  ["month", "Month"],
];

/**
 * The days a dashboard figure counts (the business's `today`): this pay
 * period (the default, following the pay rules and any custom schedule), this
 * week (Monday to Sunday) or this month. Returns { key, from, to, label }.
 */
export function tileRange(key, today, time = {}) {
  if (key === "week") {
    const from = addDays(today, -((weekdayOf(today) + 6) % 7));
    return { key, from, to: addDays(from, 6), label: "this week" };
  }
  if (key === "month") {
    return { key, from: monthStart(today), to: monthEnd(today), label: "this month" };
  }
  const p = payPeriod(today, time, 0);
  return { key: "period", from: p.from, to: p.to, label: "this pay period" };
}
