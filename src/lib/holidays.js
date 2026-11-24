// US holidays on the calendars (Sean, Nov 2026: "show us holiday at calendar"): the federal holidays, each on its
// date and, when that falls on a weekend, the weekday it is observed (a Saturday's on the Friday before, a Sunday's on
// the Monday after), as offices and carriers keep them. Pure, so every calendar and the tests share it.

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday … 6 Saturday

/** The `n`th `weekday` (0 Sunday … 6 Saturday) of a month; n = -1 for its last. */
function nth(y, m, weekday, n) {
  if (n > 0) {
    const first = (weekday - dow(y, m, 1) + 7) % 7 + 1;
    return iso(y, m, first + (n - 1) * 7);
  }
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = days - ((dow(y, m, days) - weekday + 7) % 7);
  return iso(y, m, last);
}

/** A year's federal holidays on their own dates: [{ date, name }]. */
function onTheirDates(y) {
  return [
    { date: iso(y, 1, 1), name: "New Year's Day", fixed: true },
    { date: nth(y, 1, 1, 3), name: "Martin Luther King Jr. Day" },
    { date: nth(y, 2, 1, 3), name: "Presidents' Day" },
    { date: nth(y, 5, 1, -1), name: "Memorial Day" },
    { date: iso(y, 6, 19), name: "Juneteenth", fixed: true },
    { date: iso(y, 7, 4), name: "Independence Day", fixed: true },
    { date: nth(y, 9, 1, 1), name: "Labor Day" },
    { date: nth(y, 10, 1, 2), name: "Columbus Day" },
    { date: iso(y, 11, 11), name: "Veterans Day", fixed: true },
    { date: nth(y, 11, 4, 4), name: "Thanksgiving Day" },
    { date: iso(y, 12, 25), name: "Christmas Day", fixed: true },
  ];
}

const cache = new Map();

/**
 * The holidays falling in a year, by date: { "2026-07-03": { name: "Independence Day", observed: true }, … }. A fixed
 * one on a weekend is also listed on its observed weekday (New Year's Day on a Saturday: December 31 before).
 */
export function holidaysOf(year) {
  const y = Number(year);
  if (cache.has(y)) return cache.get(y);
  const out = {};
  for (const year2 of [y, y + 1]) {
    for (const h of onTheirDates(year2)) {
      const [hy, hm, hd] = h.date.split("-").map(Number);
      if (hy === y) out[h.date] = { name: h.name, observed: false };
      if (!h.fixed) continue;
      const day = dow(hy, hm, hd);
      if (day !== 0 && day !== 6) continue;
      const shifted = new Date(Date.UTC(hy, hm - 1, hd + (day === 6 ? -1 : 1)));
      const at = iso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
      if (at.startsWith(`${y}-`) && !out[at]) out[at] = { name: h.name, observed: true };
    }
  }
  cache.set(y, out);
  return out;
}

/** The holiday on a day (YYYY-MM-DD), or null: { name, observed }. */
export function holidayOn(day) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(day ?? ""))) return null;
  return holidaysOf(Number(String(day).slice(0, 4)))[String(day).slice(0, 10)] ?? null;
}

/** As a calendar says it: "Independence Day", or "Independence Day (observed)". */
export const holidayLabel = (h) => (h ? `${h.name}${h.observed ? " (observed)" : ""}` : "");

/** The colour holidays wear on the calendars. */
export const HOLIDAY_COLOR = "var(--neon-rose)";
