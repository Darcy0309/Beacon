/**
 * A call list's filter (see supabase/migrations/…_call_list_filters.sql):
 * a window of the year the name renews in, and lists of values to include
 * or exclude. Pure functions, shared by the page, the form and the action.
 *
 *   { renewal: { from: "11-01", to: "01-31", exclude },
 *     city: { values: ["phoenix"], exclude }, … }
 */

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// February counts its 29th, so a leap year's renewals are never left out.
export const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The criteria offered besides the renewal window, in the order shown. */
export const FILTER_FIELDS = [
  { key: "city", label: "City", not: "Not city" },
  { key: "zip", label: "ZIP code", not: "Not ZIP code" },
  { key: "county", label: "County", not: "Not county" },
  { key: "sic", label: "Industry (SIC)", not: "Not industry (SIC)" },
  { key: "carrier", label: "Carrier", not: "Not carrier" },
  { key: "year", label: "Year developed", not: "Not developed in" },
  { key: "developer", label: "Developed by", not: "Not developed by" },
  { key: "result", label: "Call result", not: "Not call result" },
];

const pad = (n) => String(n).padStart(2, "0");
/** "MM-DD" for a month (1-12) and day, or null when there is no such day. */
export function monthDay(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > MONTH_DAYS[m - 1]) return null;
  return `${pad(m)}-${pad(d)}`;
}
const isMonthDay = (v) => typeof v === "string" && /^\d\d-\d\d$/.test(v) && monthDay(v.slice(0, 2), v.slice(3)) === v;

/** The whole of one month (1-12) as a window. */
export const monthWindow = (month) => ({ from: monthDay(month, 1), to: monthDay(month, MONTH_DAYS[month - 1]) });

/** "Nov 1" from "11-01". */
export const monthDayLabel = (md) => (isMonthDay(md) ? `${MONTH_NAMES[Number(md.slice(0, 2)) - 1]} ${Number(md.slice(3))}` : "");

/** Whether a date ("YYYY-MM-DD") falls in a window of the year, whatever the year (Nov 1 – Jan 31 wraps). */
export function renewsIn(window, iso) {
  if (!window?.from || !window?.to) return true;
  if (!iso) return false;
  const md = iso.slice(5, 10);
  return window.from <= window.to ? md >= window.from && md <= window.to : md >= window.from || md <= window.to;
}

/**
 * Only what the filter knows, well formed: a valid window, value lists of
 * short strings (at most 300 each), and `exclude` as a boolean. Empty
 * criteria are left out, so no filter is {}.
 */
export function cleanCriteria(raw) {
  const out = {};
  const c = raw && typeof raw === "object" ? raw : {};
  if (isMonthDay(c.renewal?.from) && isMonthDay(c.renewal?.to)) {
    out.renewal = { from: c.renewal.from, to: c.renewal.to, exclude: c.renewal.exclude === true };
  }
  for (const { key } of FILTER_FIELDS) {
    const values = Array.isArray(c[key]?.values)
      ? [...new Set(c[key].values.filter((v) => typeof v === "string" || typeof v === "number").map((v) => String(v).trim().slice(0, 120)).filter(Boolean))].slice(0, 300)
      : [];
    if (values.length) out[key] = { values, exclude: c[key].exclude === true };
  }
  return out;
}

/** How many criteria are set. */
export const criteriaCount = (c) => Object.keys(cleanCriteria(c)).length;

/**
 * The filter in words, one phrase per criterion: "Renews Nov 1 – Jan 31",
 * "City: Phoenix, Mesa", "Not carrier: Hartford". `options` give the labels.
 */
export function describeCriteria(c, options = {}) {
  const clean = cleanCriteria(c);
  const out = [];
  if (clean.renewal) {
    const span = `${monthDayLabel(clean.renewal.from)} – ${monthDayLabel(clean.renewal.to)}`;
    out.push({ key: "renewal", text: clean.renewal.exclude ? `Not renewing ${span}` : `Renews ${span}`, exclude: clean.renewal.exclude });
  }
  for (const { key, label, not } of FILTER_FIELDS) {
    const f = clean[key];
    if (!f) continue;
    const names = f.values.map((v) => options[key]?.find((o) => String(o.value) === v)?.label ?? v);
    const shown = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
    out.push({ key, text: `${f.exclude ? not : label}: ${shown}`, exclude: f.exclude });
  }
  return out;
}
