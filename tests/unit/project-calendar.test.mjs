#!/usr/bin/env node
/** Unit tests for a project's calendar: what is on a day, and what a slot being booked runs into. */
import { BLOCK_TIMES, blockDays, blockHours, blockOn, clockOf, dayMarks, eventsOn, minutesOf, slotClashes, weeklyBlock } from "../../src/lib/project-calendar.js";

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

// The client's days to avoid (Project Info): every Monday and Friday, blocked all day, every week.
const weekly = weeklyBlock({ projectId: 12, days: [5, 1], from: "2026-10-01", to: "2026-10-31" });
is("days to avoid as one block kept every week", [weekly.id, weekly.weekdays, weekly.weekly, weekly.start, blockDays(weekly), blockHours(weekly)],
  ["w12", [1, 5], true, null, "Every Mon & Fri", "All day"]);
is("…none without any days", [weeklyBlock({ projectId: 12, days: [], from: "2026-10-01", to: "2026-10-31" }), weeklyBlock({ projectId: 12, days: null, from: "2026-10-01", to: "2026-10-31" })], [null, null]);
is("…on those weekdays only", ["2026-10-19", "2026-10-20", "2026-10-23", "2026-10-25", "2026-11-02"].map((d) => blockOn(weekly, d)), [true, false, true, false, false]);
const avoiding = { appointments: cal.appointments, blocks: [weekly] };
is("…shaded on the month: each Monday and Friday", Object.entries(dayMarks(avoiding, "2026-10-01", "2026-10-31")).filter(([, m]) => m.blocked).map(([d]) => d),
  ["2026-10-02", "2026-10-05", "2026-10-09", "2026-10-12", "2026-10-16", "2026-10-19", "2026-10-23", "2026-10-26", "2026-10-30"]);
is("…in a day's list on a Monday, not on a Tuesday", [eventsOn("2026-10-19", avoiding).map((e) => e.key), eventsOn("2026-10-20", avoiding).map((e) => e.key)], [["bw12"], ["a1", "a2"]]);
is("…and booking on one says why", slotClashes({ date: "2026-10-23", time: "10:00 AM" }, avoiding).map((c) => c.text),
  ["No appointments on Fridays (the client's days to avoid, in Project Info)"]);
is("…several calendars together name theirs", weeklyBlock({ projectId: 3, days: [2], from: "2026-10-01", to: "2026-10-31", project: "Rural Mutual Appts" }).project, "Rural Mutual Appts");

// A note on a time of day ("Hour Text"): in the day's list at its time, counted on the month, never in the way of a booking.
const noted = { ...cal, notes: [{ id: 7, date: "2026-10-20", start: 600, text: "Owner back from vacation" }] };
is("a note sits at its time among the day's events", eventsOn("2026-10-20", noted).filter((e) => e.kind === "note").map((e) => [e.key, e.start, e.end]), [["n7", 600, 630]]);
is("…counted on its day", dayMarks(noted, "2026-10-01", "2026-10-31")["2026-10-20"].notes, 1);
is("…and booking at that time is not warned of it", slotClashes({ date: "2026-10-20", time: "10:00 AM" }, { appointments: [], blocks: [], notes: noted.notes }), []);
is("no notes: the calendar is as it was", eventsOn("2026-10-20", cal).some((e) => e.kind === "note"), false);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll project calendar checks passed.");
