/**
 * Busy times from a personal calendar's file (.ics, as Google, Outlook and
 * iCloud give a private link to): when the person is busy, and nothing
 * else — no titles, guests, places or notes are read out of it. Each
 * occurrence in a window becomes time blocked out on the business's clock:
 * { startsOn, endsOn, start, end } (minutes past midnight, null for a whole
 * day). Pure: no fetching here.
 */

import ICAL from "ical.js";
import { addDays } from "./dates.js";

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** An instant as the day and minute it is on a clock (`timeZone`). */
function wallOf(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { day: iso(get("year"), get("month"), get("day")), minutes: get("hour") * 60 + get("minute") };
}

/** The instant a clock (`timeZone`) reads y-m-d h:mi, or null when the zone is not one. */
function instantOf(y, m, d, h, mi, timeZone) {
  try {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    // The zone's offset at that moment, found from what its clock reads then; once more across a change of clocks.
    const offsetAt = (ms) => {
      const w = wallOf(ms, timeZone);
      const [wy, wm, wd] = w.day.split("-").map(Number);
      return Date.UTC(wy, wm - 1, wd, Math.floor(w.minutes / 60), w.minutes % 60) - ms;
    };
    const first = guess - offsetAt(guess);
    return guess - offsetAt(first);
  } catch {
    return null;
  }
}

/**
 * When an event's time is: { day } for a whole-day date, else { ms }, or
 * { day, minutes } read straight off the business's clock when the file
 * names no zone for it (a "floating" time).
 */
function momentOf(time, tzid, businessZone) {
  if (time.isDate) return { day: iso(time.year, time.month, time.day), whole: true };
  const zone = time.zone?.tzid;
  if (zone && zone !== "floating") return { ms: time.toUnixTime() * 1000 };
  // A zone named but not described in the file: the system's own knowledge of it, if it has any.
  const ms = tzid ? instantOf(time.year, time.month, time.day, time.hour, time.minute, tzid) : null;
  if (ms != null) return { ms };
  return wallToMoment(time, businessZone);
}
const wallToMoment = (time, businessZone) => ({ ms: instantOf(time.year, time.month, time.day, time.hour, time.minute, businessZone) });

/** Not something to block time for: cancelled, or marked free. */
function isFree(vevent) {
  const v = (name) => String(vevent.getFirstPropertyValue(name) ?? "").toUpperCase();
  return v("status") === "CANCELLED" || v("transp") === "TRANSPARENT" || v("x-microsoft-cdo-busystatus") === "FREE";
}

/** One busy stretch as blocked time, day by day, kept to the window. */
function piecesOf(start, end, { timeZone, from, to }) {
  if (start.whole) {
    // A whole-day event ends on the day after its last (or is one day long).
    const last = end?.whole && end.day > start.day ? addDays(end.day, -1) : start.day;
    const a = start.day < from ? from : start.day;
    const b = last > to ? to : last;
    return a <= b ? [{ startsOn: a, endsOn: b, start: null, end: null }] : [];
  }
  if (start.ms == null || end?.ms == null || end.ms <= start.ms) return [];
  const s = wallOf(start.ms, timeZone);
  const e = wallOf(end.ms, timeZone);
  const out = [];
  for (let day = s.day; day <= e.day && out.length < 400; day = addDays(day, 1)) {
    const begins = day === s.day ? s.minutes : 0;
    const ends = day === e.day ? e.minutes : 1440;
    if (ends <= begins || day < from || day > to) continue;
    // Midnight to midnight is the whole day; a stretch to midnight ends at 11:59 PM.
    out.push(begins === 0 && ends === 1440
      ? { startsOn: day, endsOn: day, start: null, end: null }
      : { startsOn: day, endsOn: day, start: begins, end: Math.min(ends, 1439) });
  }
  return out.filter((p) => p.start == null || p.end > p.start);
}

/**
 * The busy times in a calendar file between `from` and `to` (days on the
 * business's clock, `timeZone`), at most `max` of them, in order. Repeating
 * events are followed through the window (with their exceptions); events
 * cancelled or marked free are left out. Throws when the text is not a
 * calendar file.
 */
export function busyTimes(text, { timeZone, from, to, max = 500 }) {
  if (!/BEGIN:VCALENDAR/i.test(String(text ?? ""))) throw new Error("That link did not return a calendar.");
  let parsed;
  try {
    parsed = ICAL.parse(text);
  } catch {
    throw new Error("That calendar could not be read.");
  }
  const calendars = (Array.isArray(parsed[0]) ? parsed : [parsed]).map((j) => new ICAL.Component(j));
  const window = { timeZone, from, to };
  const untilMs = instantOf(...addDays(to, 2).split("-").map(Number), 0, 0, timeZone) ?? Date.parse(`${addDays(to, 2)}T00:00:00Z`);
  const out = [];

  for (const calendar of calendars) {
    for (const vt of calendar.getAllSubcomponents("vtimezone")) {
      try {
        ICAL.TimezoneService.register(vt);
      } catch { /* a zone the file describes badly is read as named, below */ }
    }
    const vevents = calendar.getAllSubcomponents("vevent");
    const exceptions = new Map();
    for (const v of vevents) {
      if (!v.hasProperty("recurrence-id")) continue;
      const uid = String(v.getFirstPropertyValue("uid") ?? "");
      exceptions.set(uid, [...(exceptions.get(uid) ?? []), v]);
    }
    for (const v of vevents) {
      if (v.hasProperty("recurrence-id") || !v.hasProperty("dtstart")) continue;
      const event = new ICAL.Event(v);
      for (const x of exceptions.get(event.uid) ?? []) event.relateException(x);
      const tzOf = (comp, name) => comp.getFirstProperty(name)?.getParameter("tzid") ?? null;

      if (!event.isRecurring()) {
        if (isFree(v)) continue;
        out.push(...piecesOf(momentOf(event.startDate, tzOf(v, "dtstart"), timeZone), momentOf(event.endDate, tzOf(v, "dtend") ?? tzOf(v, "dtstart"), timeZone), window));
        continue;
      }
      const iterator = event.iterator();
      for (let i = 0, next; i < 4000 && (next = iterator.next()); i++) {
        const occurrence = event.getOccurrenceDetails(next);
        const item = occurrence.item?.component ?? v;
        const start = momentOf(occurrence.startDate, tzOf(item, "dtstart") ?? tzOf(v, "dtstart"), timeZone);
        const startsMs = start.whole ? Date.parse(`${start.day}T00:00:00Z`) : start.ms;
        if (startsMs != null && startsMs > untilMs) break;
        if (isFree(item)) continue;
        out.push(...piecesOf(start, momentOf(occurrence.endDate, tzOf(item, "dtend") ?? tzOf(item, "dtstart") ?? tzOf(v, "dtstart"), timeZone), window));
        if (out.length > max * 4) break;
      }
    }
  }

  // In order, without repeats (the same stretch on two calendars is one block).
  const seen = new Set();
  return out
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || (a.start ?? -1) - (b.start ?? -1) || (a.end ?? 1441) - (b.end ?? 1441))
    .filter((p) => {
      const key = `${p.startsOn}|${p.endsOn}|${p.start}|${p.end}`;
      return seen.has(key) ? false : seen.add(key);
    })
    .slice(0, max);
}

/**
 * The hosts a calendar link may be on: Google, Outlook and iCloud. The
 * server reads a link somebody typed in, so it reads only these, over
 * https, and follows a redirect only to another of them.
 */
const CALENDAR_HOSTS = [
  [/^calendar\.google\.com$/, "Google Calendar"],
  [/^www\.google\.com$/, "Google Calendar"],
  [/^outlook\.(live|office|office365)\.com$/, "Outlook"],
  [/^(p\d+-)?(caldav|calendars)\.icloud\.com$/, "iCloud"],
];

/**
 * A calendar link as it will be read: { url, provider }, or { error }
 * saying what is wrong with it. "webcal://" is the same link over https.
 */
export function calendarLink(input) {
  const text = String(input ?? "").trim().replace(/^webcals?:\/\//i, "https://");
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: "Paste the whole link, starting with https://" };
  }
  if (url.protocol !== "https:") return { error: "The link must start with https://" };
  if (url.username || url.password || (url.port && url.port !== "443")) return { error: "That is not a calendar link" };
  const host = url.hostname.toLowerCase();
  const provider = CALENDAR_HOSTS.find(([re]) => re.test(host))?.[1];
  if (!provider) return { error: "Use the private link from Google Calendar, Outlook or iCloud" };
  if (text.length > 1000) return { error: "That link is too long" };
  return { url: url.toString(), provider };
}
