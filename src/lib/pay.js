/**
 * Pay rules in plain functions: the rates an administrator can pick, pay
 * periods, and how hours read. No imports beyond the date helpers, so the
 * browser, the server and the unit tests share them.
 */

import { addDays, addMonths, daysBetween, formatRange, isIsoDate, monthEnd, monthStart } from "./dates.js";

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

/**
 * The pay period that contains `today` ("YYYY-MM-DD"), or with `offset` the
 * one that many periods before (-1) or after (1). `time` holds the rules'
 * pay_period and, for weekly and two-weekly periods, period_start: any day a
 * period starts on.
 */
export function payPeriod(today, time = {}, offset = 0) {
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
    if (!error) return { period: "custom", from, to, label: formatRange(from, to), error: null };
    const current = payPeriod(today, time, 0);
    return { period: "current", ...current, label: `This pay period · ${formatRange(current.from, current.to)}`, error };
  }
  const [key, label, offset] = PERIOD_PRESETS.find(([k]) => k === sp?.period) ?? PERIOD_PRESETS[0];
  const range = payPeriod(today, time, offset);
  return { period: key, ...range, label: `${label} · ${formatRange(range.from, range.to)}`, error: null };
}
