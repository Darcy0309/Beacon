/**
 * What a tile chart's bars stand for, along its foot (client, Nov 2026: "I don't know what the
 * bars represent"): a day's hours ("8a" … "6p"), a week's days ("Mon" … "Sun"), a month's or a
 * pay period's dates ("1" … "30"), each with the whole of it for the tooltip ("Mon, Nov 9").
 * Pure, for the dashboard's queries and tests.
 */
import { MONTHS, WEEKDAYS, weekdayOf } from "./dates.js";

const dayTitle = (iso) => `${WEEKDAYS[weekdayOf(iso)].slice(0, 3)}, ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${Number(iso.slice(8, 10))}`;

/** Days (ISO) → { labels, titles }: a week or less by weekday, more by date. */
export function dayAxis(days) {
  const week = days.length <= 7;
  return {
    labels: days.map((d) => (week ? WEEKDAYS[weekdayOf(d)].slice(0, 3) : String(Number(d.slice(8, 10))))),
    titles: days.map(dayTitle),
  };
}

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
const hourTitle = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

/**
 * A day by the hour: { [hour]: n } → { series, labels, titles }, the working day (8 AM to 6 PM)
 * widened to any hour with something in it.
 */
export function hourAxis(byHour) {
  const busy = Object.keys(byHour).map(Number).filter((h) => byHour[h]);
  const first = Math.min(8, ...busy);
  const last = Math.max(18, ...busy);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return { series: hours.map((h) => byHour[h] ?? 0), labels: hours.map(hourLabel), titles: hours.map(hourTitle) };
}
