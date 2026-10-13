#!/usr/bin/env node
/** Unit tests for a project's calendar: what is on a day, and what a slot being booked runs into. */
import { BLOCK_TIMES, blockDays, blockHours, clockOf, dayMarks, eventsOn, minutesOf, slotClashes } from "../../src/lib/project-calendar.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

is("times of day, as people write them and as the database keeps them", ["9:30 AM", "12:00 PM", "12:15 AM", "13:00:00", "noon"].map(minutesOf), [570, 720, 15, 780, null]);
is("…and back", [clockOf(570), clockOf(780), clockOf(0)], ["9:30 AM", "1:00 PM", "12:00 AM"]);
is("blocks start and end on the half hour, 6 AM to 9 PM", [BLOCK_TIMES[0], BLOCK_TIMES.at(-1), BLOCK_TIMES.length], ["6:00 AM", "9:00 PM", 31]);

const cal = {
  appointments: [
    { id: 1, date: "2026-10-20", time: "10:00 AM", duration: 30, company: "Acme Plumbing" },
    { id: 2, date: "2026-10-20", time: "2:00 PM", duration: 60, company: "Beta Roofing" },
  ],
  blocks: [
    { id: 7, startsOn: "2026-10-20", endsOn: "2026-10-20", start: 720, end: 780, note: "Lunch" },
    { id: 8, startsOn: "2026-10-22", endsOn: "2026-10-23", start: null, end: null, note: null },
  ],
};
is("a day in order: appointments and blocked time", eventsOn("2026-10-20", cal).map((e) => e.key), ["a1", "b7", "a2"]);
is("a block in words", [blockHours(cal.blocks[0]), blockHours(cal.blocks[1]), blockDays(cal.blocks[1])], ["12:00 PM – 1:00 PM", "All day", "Oct 22 – Oct 23"]);
is("the month's marks: appointments counted, days blocked whole or in part",
  dayMarks(cal, "2026-10-01", "2026-10-31"), { "2026-10-20": { appointments: 2, blocked: "part" }, "2026-10-22": { appointments: 0, blocked: "day" }, "2026-10-23": { appointments: 0, blocked: "day" } });

is("a free slot runs into nothing", slotClashes({ date: "2026-10-20", time: "11:00 AM", duration: 30 }, cal), []);
is("…one ending as another starts is free too", slotClashes({ date: "2026-10-20", time: "9:30 AM", duration: 30 }, cal), []);
is("a slot over an appointment says which", slotClashes({ date: "2026-10-20", time: "10:15 AM" }, cal).map((c) => c.text), ["Already booked: 10:00 AM Acme Plumbing, 30 min"]);
is("…unless it is the appointment being moved", slotClashes({ date: "2026-10-20", time: "10:15 AM", exceptId: 1 }, cal), []);
is("a slot in blocked time says so, with the note", slotClashes({ date: "2026-10-20", time: "12:30 PM" }, cal).map((c) => c.text), ["Blocked out 12:00 PM – 1:00 PM (Lunch)"]);
is("any time on a day blocked whole", slotClashes({ date: "2026-10-23", time: "4:00 PM" }, cal).map((c) => c.kind), ["block"]);
is("a long one runs into both", slotClashes({ date: "2026-10-20", time: "1:30 PM", duration: 60 }, cal).map((c) => c.kind), ["appointment"]);
is("no date or time yet: nothing to say", slotClashes({ date: "", time: "10:00 AM" }, cal).length + slotClashes({ date: "2026-10-20", time: "" }, cal).length, 0);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll project calendar checks passed.");
