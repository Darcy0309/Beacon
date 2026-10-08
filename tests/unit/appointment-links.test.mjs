#!/usr/bin/env node
/** Unit tests for "Add to calendar" on a lead sheet, its map link, EINs and SIC labels. */
import { appointmentIcs, appointmentSpan, calendarLinks, mapLink } from "../../src/lib/appointment-links.js";
import { normalizeEin, rowsToImport } from "../../src/lib/csv.js";
import { sicLabel } from "../../src/lib/format.js";
import { schemas, validate } from "../../src/lib/validate.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

// Phoenix keeps one clock all year; New York changes on Nov 1, 2026.
const az = appointmentSpan("2026-10-09", "10:00 AM", 30, "America/Phoenix");
check("10:00 AM in Phoenix is 17:00 UTC, for 30 minutes", az?.start.toISOString() === "2026-10-09T17:00:00.000Z" && az.end.toISOString() === "2026-10-09T17:30:00.000Z", JSON.stringify(az));
const before = appointmentSpan("2026-10-30", "9:00 AM", 60, "America/New_York");
const after = appointmentSpan("2026-11-02", "9:00 AM", 60, "America/New_York");
check("…on either side of a change of clocks, 9:00 AM stays 9:00 AM",
  before?.start.toISOString() === "2026-10-30T13:00:00.000Z" && after?.start.toISOString() === "2026-11-02T14:00:00.000Z", `${before?.start.toISOString()} ${after?.start.toISOString()}`);
check("12:30 PM is after noon, 12:15 AM just after midnight",
  appointmentSpan("2026-10-09", "12:30 PM", 30, "UTC")?.start.toISOString() === "2026-10-09T12:30:00.000Z"
  && appointmentSpan("2026-10-09", "12:15 AM", 30, "UTC")?.start.toISOString() === "2026-10-09T00:15:00.000Z");
check("no time it can read, no span", appointmentSpan("2026-10-09", "morning", 30, "UTC") === null && appointmentSpan(null, "9:00 AM", 30, "UTC") === null);

const event = { ...az, title: "Appointment: A & Sons Elect", location: "12 Main St, Phoenix AZ 85004", details: "Contact: Daniel, Owner\nAppt set with Daniel and Henry, both owners" };
const links = calendarLinks(event, "https://crm.example/sheet/t.k/appointment.ics");
const google = new URL(links[0].href);
check("Google: the event ready to save, at the right time", links[0].label === "Google" && google.searchParams.get("dates") === "20261009T170000Z/20261009T173000Z"
  && google.searchParams.get("text") === event.title && google.searchParams.get("location") === event.location, links[0].href);
const outlook = new URL(links[1].href);
check("Outlook: the same, in Microsoft 365", links[1].label === "Outlook" && outlook.hostname === "outlook.office.com"
  && outlook.searchParams.get("startdt") === "2026-10-09T17:00:00.000Z" && outlook.searchParams.get("subject") === event.title, links[1].href);
check("Apple: the .ics file, when there is one", links[2]?.label === "Apple" && links[2].href.endsWith("/appointment.ics") && calendarLinks(event).length === 2);

const ics = appointmentIcs(event, "appointment-7@lighthouse-crm");
check("the .ics: one event, its times in UTC, lines ending CRLF",
  ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("DTSTART:20261009T170000Z\r\n") && ics.includes("DTEND:20261009T173000Z\r\n") && ics.endsWith("END:VCALENDAR\r\n") && !/[^\r]\n/.test(ics));
check("…its text escaped (commas, new lines) and long lines folded",
  ics.includes("LOCATION:12 Main St\\, Phoenix AZ 85004") && ics.includes("Contact: Daniel\\, Owner\\nAppt set") && ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), ics);

check("the map opens Google Maps' search for the address, in any browser",
  mapLink("1502 20th St, Santa Monica CA 90404") === "https://www.google.com/maps/search/?api=1&query=1502%2020th%20St%2C%20Santa%20Monica%20CA%2090404" && mapLink("") === null);

check("an EIN is written one way, however it was typed", normalizeEin("123456789") === "12-3456789" && normalizeEin("12-3456789") === "12-3456789" && normalizeEin(" 12 345 6789 ") === "12-3456789");
check("…a spreadsheet's dropped leading zero is put back", normalizeEin("23456789") === "02-3456789");
check("…anything else is not an EIN", normalizeEin("12345") === null && normalizeEin("") === null && normalizeEin(null) === null);
check("the lead form says so", /9 digits/.test(validate({ company_name: "X", ein: "1234" }, schemas.lead).errors.ein ?? "") && !validate({ company_name: "X", ein: "12-3456789" }, schemas.lead).errors.ein);
const imported = rowsToImport([["Company", "Tax ID", "Locations"], ["A Co", "123456789", "3"], ["B Co", "n/a", ""]]);
check("a list's EIN column imports, written one way; one that is not an EIN is left out",
  imported.rows[0].lead.ein === "12-3456789" && imported.rows[0].lead.location === "3" && !("ein" in imported.rows[1].lead), JSON.stringify(imported.rows));

const withNotes = rowsToImport([["Company", "Notes", "Notes to Client"], ["C Co", "left vm", "old history"]]);
check("a list's Notes are the client notes; the old system's notes to client are internal, apart from the lead",
  withNotes.rows[0].lead.client_note === "left vm" && JSON.stringify(withNotes.rows[0].notes) === JSON.stringify({ internal_notes: "old history" }) && !("internal_notes" in withNotes.rows[0].lead),
  JSON.stringify(withNotes.rows[0]));

check("an SIC code reads with what it means", sicLabel("1731", "Electrical Work") === "1731 – Electrical Work" && sicLabel("9999", null) === "9999" && sicLabel(null, null) === null);

console.log(failures ? `\n${failures} appointment link check(s) failed.\n` : "\nAll appointment link checks passed.\n");
process.exit(failures ? 1 : 0);
