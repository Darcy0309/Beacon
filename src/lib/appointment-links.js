// "Add to calendar" for an appointment on a lead sheet, and a map for its
// address. Dependency-free (pure) so the server, the sheet's .ics route and
// the tests share it.

/** Minutes past midnight for "9:30 AM", or null. */
function minutesOf(time) {
  const m = String(time ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
}

/** How far `timeZone` is ahead of UTC at an instant, in minutes. */
function offsetAt(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ms)).map((p) => [p.type, p.value])
  );
  return (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms) / 60000;
}

/**
 * When an appointment starts and ends, as instants: its day ("2026-10-09")
 * and time ("10:00 AM") are on the business's clock (`timeZone`). Null
 * without a day and a time it can read.
 */
export function appointmentSpan(date, time, durationMin, timeZone) {
  const minutes = minutesOf(time);
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(date ?? "")) || minutes == null) return null;
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let start = wall - offsetAt(wall, timeZone) * 60000;
  // Across a change of clocks the first guess is an hour out; the second is right.
  start = wall - offsetAt(start, timeZone) * 60000;
  return { start: new Date(start), end: new Date(start + (Number(durationMin) || 30) * 60000) };
}

/** 20261009T170000Z */
const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Links that open the appointment in Google Calendar and Outlook (Microsoft
 * 365) ready to save, and the .ics file (Apple Calendar, Outlook on a
 * desktop) at `icsUrl` when there is one.
 * `event`: { title, start, end, location, details }.
 */
export function calendarLinks(event, icsUrl = null) {
  const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const google = `https://calendar.google.com/calendar/render?${q({
    action: "TEMPLATE", text: event.title, dates: `${stamp(event.start)}/${stamp(event.end)}`, details: event.details, location: event.location,
  })}`;
  const outlook = `https://outlook.office.com/calendar/0/deeplink/compose?${q({
    path: "/calendar/action/compose", rru: "addevent", subject: event.title,
    startdt: event.start.toISOString(), enddt: event.end.toISOString(), body: event.details, location: event.location,
  })}`;
  return [
    { label: "Google", href: google },
    { label: "Outlook", href: outlook },
    ...(icsUrl ? [{ label: "Apple", href: icsUrl }] : []),
  ];
}

// Text in an .ics file: commas, semicolons and backslashes escaped, new lines as \n.
const icsText = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets continue on the next, after a space (RFC 5545).
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(chunk);
      chunk = "";
      size = 0;
    }
    chunk += ch;
    size += n;
  }
  out.push(chunk);
  return out.join("\r\n ");
}

/** The appointment as an .ics file any calendar program opens. `uid`: the same for the same appointment. */
export function appointmentIcs(event, uid) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lighthouse CRM//Lead sheet//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.details ? [`DESCRIPTION:${icsText(event.details)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}

/** Google Maps for an address: a search page that works in any browser, on a desktop too. */
export const mapLink = (address) =>
  address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
