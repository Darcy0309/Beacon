/**
 * Calendar dates as "YYYY-MM-DD" strings: what the forms submit and the
 * database stores. Arithmetic runs in UTC on those strings, so a date never
 * moves a day with the viewer's time zone. Pure functions, no imports: safe
 * on the server, in the browser and in the unit tests.
 */

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n) => String(n).padStart(2, "0");

/** A UTC Date as "YYYY-MM-DD". */
export const toIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** "YYYY-MM-DD" as a UTC Date, or null when it is not a real date. */
export function fromIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || toIso(d) !== iso ? null : d;
}

export const isIsoDate = (iso) => fromIso(iso) !== null;

/** Year, month (1-12) and day as "YYYY-MM-DD", or null when there is no such day. */
export function makeIso(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1000 || year > 9999) return null;
  return isIsoDate(`${year}-${pad(month)}-${pad(day)}`) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** Today on the viewer's own calendar. */
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/**
 * Today in a given time zone (the business's), for the server, whose own
 * clock runs on UTC: after 5 pm in Phoenix it is already tomorrow in UTC.
 */
export const todayIn = (timeZone, now = new Date()) =>
  // en-CA formats as YYYY-MM-DD.
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Same day of the month n months on, or that month's last day when it is shorter. */
export function addMonths(iso, n) {
  const d = fromIso(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return toIso(target);
}

export const addYears = (iso, n) => addMonths(iso, 12 * n);
/** 0 for Sunday to 6 for Saturday. */
export const weekdayOf = (iso) => fromIso(iso).getUTCDay();
/** Whole days from a to b (negative when b is earlier). */
export const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
export const monthStart = (iso) => `${iso.slice(0, 8)}01`;
export const monthEnd = (iso) => addDays(addMonths(monthStart(iso), 1), -1);
export const sameMonth = (a, b) => Boolean(a && b) && a.slice(0, 7) === b.slice(0, 7);
export const clampIso = (iso, min, max) => (min && iso < min ? min : max && iso > max ? max : iso);

/** The 42 days a month view shows: six weeks, Sunday first, the month's 1st in the first week. */
export function monthGrid(iso) {
  const first = monthStart(iso);
  const start = addDays(first, -weekdayOf(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const STYLES = {
  long: { weekday: "short", month: "short", day: "numeric", year: "numeric" }, // Thu, Oct 1, 2026
  medium: { month: "short", day: "numeric", year: "numeric" }, // Oct 1, 2026
  full: { weekday: "long", month: "long", day: "numeric", year: "numeric" }, // Thursday, October 1, 2026
  month: { month: "long", year: "numeric" }, // October 2026
  short: { month: "short", day: "numeric" }, // Oct 1
};

export function formatIso(iso, style = "long") {
  const d = fromIso(iso);
  return d ? d.toLocaleDateString("en-US", { ...STYLES[style], timeZone: "UTC" }) : "";
}

/** "Sep 1 – Oct 1, 2026", or "Dec 28, 2026 – Jan 3, 2027" across years. */
export function formatRange(from, to) {
  if (!from || !to) return formatIso(from || to, "medium");
  if (from === to) return formatIso(from, "medium");
  if (from.slice(0, 4) === to.slice(0, 4)) return `${formatIso(from, "short")} – ${formatIso(to, "medium")}`;
  return `${formatIso(from, "medium")} – ${formatIso(to, "medium")}`;
}

/** "today", "tomorrow", "in 3 days", "in 2 weeks", "5 months ago"… */
export function relativeDay(iso, today = todayIso()) {
  const n = daysBetween(today, iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  const abs = Math.abs(n);
  const [count, unit] =
    abs < 14 ? [abs, "day"] : abs < 60 ? [Math.round(abs / 7), "week"] : abs < 730 ? [Math.round(abs / 30.44), "month"] : [Math.round(abs / 365.25), "year"];
  const text = `${count} ${unit}${count === 1 ? "" : "s"}`;
  return n > 0 ? `in ${text}` : `${text} ago`;
}

const MONTH_KEYS = MONTHS.map((m) => m.slice(0, 3).toLowerCase());
const DAY_KEYS = WEEKDAYS.map((d) => d.slice(0, 3).toLowerCase());
const monthIndex = (word) => {
  const i = MONTH_KEYS.indexOf(word.slice(0, 3));
  // "ma" alone is not a month; three letters at least, and a real prefix of the name.
  return i >= 0 && word.length >= 3 && MONTHS[i].toLowerCase().startsWith(word.replace(/\.$/, "")) ? i + 1 : 0;
};
const year2 = (y) => (y < 100 ? 2000 + y : y);

/**
 * Read a date someone typed: 10/1/2026, 10/1/26, 10/1, 2026-10-01, Oct 1,
 * October 1 2026, 1 Oct 2026, today, tomorrow, yesterday, a weekday (fri,
 * next friday), +3, -2, +2w, +1m, in 3 days. Null when it cannot.
 *
 * With `future`, a date given without a year is the next one on or after
 * today (so "Jan 5" typed in December means next January).
 */
export function parseTypedDate(text, { today = todayIso(), future = false } = {}) {
  const s = String(text ?? "")
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (["today", "tod", "now"].includes(s)) return today;
  if (["tomorrow", "tmr", "tmrw", "tom"].includes(s)) return addDays(today, 1);
  if (["yesterday", "yest"].includes(s)) return addDays(today, -1);

  const offset = (n, unit) => {
    const u = (unit ?? "d")[0];
    return u === "w" ? addDays(today, 7 * n) : u === "m" ? addMonths(today, n) : u === "y" ? addYears(today, n) : addDays(today, n);
  };
  let m = s.match(/^([+-]) ?(\d{1,3}) ?(d|days?|w|wks?|weeks?|m|mos?|months?|y|yrs?|years?)?$/);
  if (m) return offset(Number(m[2]) * (m[1] === "-" ? -1 : 1), m[3]);
  m = s.match(/^in (\d{1,3}) (days?|weeks?|months?|years?)$/);
  if (m) return offset(Number(m[1]), m[2]);

  m = s.match(/^(next )?([a-z]+)$/);
  if (m && DAY_KEYS.includes(m[2].slice(0, 3)) && WEEKDAYS[DAY_KEYS.indexOf(m[2].slice(0, 3))].toLowerCase().startsWith(m[2])) {
    let ahead = (DAY_KEYS.indexOf(m[2].slice(0, 3)) - weekdayOf(today) + 7) % 7;
    if (m[1] && ahead === 0) ahead = 7;
    return addDays(today, ahead);
  }

  // A month and day with no year: this year, or with `future`, the next one.
  const withYear = (month, day, year) => {
    if (year !== undefined) return makeIso(year2(year), month, day);
    const thisYear = makeIso(Number(today.slice(0, 4)), month, day);
    if (!thisYear || !future || thisYear >= today) return thisYear;
    return makeIso(Number(today.slice(0, 4)) + 1, month, day);
  };

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return makeIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) return withYear(Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3]));
  m = s.match(/^([a-z]+\.?) (\d{1,2})(?: (\d{4}))?$/);
  if (m && monthIndex(m[1])) return withYear(monthIndex(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3]));
  m = s.match(/^(\d{1,2}) ([a-z]+\.?)(?: (\d{4}))?$/);
  if (m && monthIndex(m[2])) return withYear(monthIndex(m[2]), Number(m[1]), m[3] === undefined ? undefined : Number(m[3]));
  return null;
}
