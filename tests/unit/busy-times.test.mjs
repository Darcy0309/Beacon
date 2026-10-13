#!/usr/bin/env node
/** Unit tests for reading busy times from a personal calendar's file, and for which links are read at all. */
import { busyTimes, calendarLink } from "../../src/lib/busy-times.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
const cal = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flat(), "END:VCALENDAR"].join("\r\n");
const ev = (...lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
const NY = ["BEGIN:VTIMEZONE", "TZID:America/New_York", "BEGIN:STANDARD", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "END:STANDARD", "BEGIN:DAYLIGHT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "END:DAYLIGHT", "END:VTIMEZONE"];
// The business keeps Arizona time: UTC-7 all year.
const opts = { timeZone: "America/Phoenix", from: "2026-10-19", to: "2026-11-15" };
const t = (h, m = 0) => h * 60 + m;
const block = (day, start, end) => ({ startsOn: day, endsOn: day, start, end });

// --- a time, on the business's clock ----------------------------------------------
is("a time in UTC lands on the business's clock", busyTimes(cal(ev("UID:1", "DTSTART:20261022T170000Z", "DTEND:20261022T180000Z", "SUMMARY:Private")), opts), [block("2026-10-22", t(10), t(11))]);
is("a time in a zone the file describes (2 PM New York is 11 AM in Arizona)",
  busyTimes(cal(NY, ev("UID:2", "DTSTART;TZID=America/New_York:20261020T140000", "DTEND;TZID=America/New_York:20261020T150000")), opts), [block("2026-10-20", t(11), t(12))]);
is("a zone only named: the system's own knowledge of it (9 AM Paris is midnight in Arizona)",
  busyTimes(cal(ev("UID:3", "DTSTART;TZID=Europe/Paris:20261021T090000", "DTEND;TZID=Europe/Paris:20261021T100000")), opts), [block("2026-10-21", t(0), t(1))]);
is("no zone at all: read off the business's clock; a length instead of an end", busyTimes(cal(ev("UID:4", "DTSTART:20261026T100000", "DURATION:PT45M")), opts), [block("2026-10-26", t(10), t(10, 45))]);

// --- whole days, and stretches over midnight ----------------------------------------
is("a whole-day event blocks its days (its end is the day after)", busyTimes(cal(ev("UID:5", "DTSTART;VALUE=DATE:20261023", "DTEND;VALUE=DATE:20261025")), opts),
  [{ startsOn: "2026-10-23", endsOn: "2026-10-24", start: null, end: null }]);
is("over midnight: to 11:59 PM, then from midnight", busyTimes(cal(ev("UID:6", "DTSTART:20261027T220000", "DTEND:20261028T013000")), opts),
  [block("2026-10-27", t(22), 1439), block("2026-10-28", 0, t(1, 30))]);
is("days in between are whole days", busyTimes(cal(ev("UID:7", "DTSTART:20261027T120000", "DTEND:20261029T120000")), opts).map((b) => [b.startsOn, b.start, b.end]),
  [["2026-10-27", 720, 1439], ["2026-10-28", null, null], ["2026-10-29", 0, 720]]);

// --- repeating --------------------------------------------------------------------
const weekly = busyTimes(cal(NY, ev("UID:8", "DTSTART;TZID=America/New_York:20261020T140000", "DTEND;TZID=America/New_York:20261020T150000",
  "RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=America/New_York:20261027T140000")), opts);
is("weekly, every Tuesday in the window but the one left out", weekly.map((b) => b.startsOn), ["2026-10-20", "2026-11-03", "2026-11-10"]);
is("…an hour later in Arizona once New York's clocks go back", weekly.map((b) => b.start), [t(11), t(12), t(12)]);
is("an old daily event is followed up to the window and no further",
  busyTimes(cal(ev("UID:9", "DTSTART:20200106T080000Z", "DTEND:20200106T083000Z", "RRULE:FREQ=DAILY")), { ...opts, from: "2026-10-19", to: "2026-10-21" }).map((b) => b.startsOn),
  ["2026-10-19", "2026-10-20", "2026-10-21"]);
is("one occurrence moved keeps its new time", busyTimes(cal(
  ev("UID:10", "DTSTART:20261020T170000Z", "DTEND:20261020T180000Z", "RRULE:FREQ=WEEKLY;COUNT=2"),
  ev("UID:10", "RECURRENCE-ID:20261027T170000Z", "DTSTART:20261027T200000Z", "DTEND:20261027T210000Z")), opts).map((b) => [b.startsOn, b.start]),
  [["2026-10-20", t(10)], ["2026-10-27", t(13)]]);

// --- what is not busy ----------------------------------------------------------------
is("free time, cancelled events and what is outside the window are left out", busyTimes(cal(
  ev("UID:11", "DTSTART:20261022T170000Z", "DTEND:20261022T180000Z", "TRANSP:TRANSPARENT"),
  ev("UID:12", "DTSTART:20261022T190000Z", "DTEND:20261022T200000Z", "STATUS:CANCELLED"),
  ev("UID:13", "DTSTART:20261022T210000Z", "DTEND:20261022T220000Z", "X-MICROSOFT-CDO-BUSYSTATUS:FREE"),
  ev("UID:14", "DTSTART:20270105T170000Z", "DTEND:20270105T180000Z")), opts), []);
is("the same stretch twice is one block", busyTimes(cal(ev("UID:15", "DTSTART:20261022T170000Z", "DTEND:20261022T180000Z"), ev("UID:16", "DTSTART:20261022T170000Z", "DTEND:20261022T180000Z")), opts).length, 1);
check("nothing personal is read: only days and times come out",
  Object.keys(busyTimes(cal(ev("UID:17", "DTSTART:20261022T170000Z", "DTEND:20261022T180000Z", "SUMMARY:Doctor", "LOCATION:Clinic", "DESCRIPTION:Private")), opts)[0]).join() === "startsOn,endsOn,start,end");
let said = "";
try { busyTimes("<html>Sign in</html>", opts); } catch (e) { said = e.message; }
is("a page that is not a calendar is refused", said, "That link did not return a calendar.");

// --- which links are read -------------------------------------------------------------
is("Google, Outlook and iCloud links", ["https://calendar.google.com/calendar/ical/x/private-abc/basic.ics", "https://outlook.office365.com/owa/calendar/a/b/calendar.ics",
  "https://outlook.live.com/owa/calendar/a/b/calendar.ics", "webcal://p12-caldav.icloud.com/published/2/abc"].map((u) => calendarLink(u).provider), ["Google Calendar", "Outlook", "Outlook", "iCloud"]);
is("webcal:// is read over https", calendarLink("webcal://p12-caldav.icloud.com/published/2/abc").url, "https://p12-caldav.icloud.com/published/2/abc");
check("anywhere else is refused: other sites, the server's own network, plain http, look-alike hosts",
  ["https://example.com/cal.ics", "https://127.0.0.1/cal.ics", "https://localhost/x", "http://calendar.google.com/x", "https://calendar.google.com.evil.io/x",
    "https://evil.io/calendar.google.com", "https://user:pw@calendar.google.com/x", "https://calendar.google.com:8443/x", "file:///etc/passwd", "not a link", ""]
    .every((u) => Boolean(calendarLink(u).error)));

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll busy times checks passed.");
