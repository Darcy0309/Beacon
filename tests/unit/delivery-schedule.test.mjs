#!/usr/bin/env node
/** Unit tests for when held leads and appointments go to clients (Settings › Delivery). */
import { clearingDue, clearingHours, clockIn, deliverySettings, holds, nextClearing } from "../../src/lib/delivery-schedule.js";

let failures = 0;
const is = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}`); failures++; }
};

const off = deliverySettings(undefined);
is("nothing set: both straight away, as before; no clearing", [off.leads, off.appointments, off.every, clearingHours(off)], ["now", "now", 0, []]);
const sean = deliverySettings({ leads: "hold", appointments: "now", every: 2, from: 8, to: 18, zone: "America/Los_Angeles" });
is("Sean's: leads held, appointments straight away", [holds(sean, "lead"), holds(sean, "appointment")], [true, false]);
is("…cleared every 2 hours, 8 AM to 6 PM", clearingHours(sean), [8, 10, 12, 14, 16, 18]);
is("every 3 hours: 8, 11, 2 PM, 5 PM", clearingHours({ ...sean, every: 3 }), [8, 11, 14, 17]);
is("anything odd read safely", deliverySettings({ leads: "x", every: 7, from: 30, to: 2, zone: "Mars" }), { leads: "now", appointments: "now", every: 0, from: 8, to: 8, zone: "America/Los_Angeles" });

// 2026-10-16 17:00 UTC is 10 AM in Los Angeles (PDT), 18:00 UTC 11 AM.
const at = (iso) => new Date(iso);
is("the hour on the Pacific clock", clockIn("America/Los_Angeles", at("2026-10-16T17:00:00Z")), { hour: 10, day: "2026-10-16" });
is("10 AM Pacific is a clearing hour, 11 AM is not", [clearingDue(sean, at("2026-10-16T17:05:00Z")), clearingDue(sean, at("2026-10-16T18:05:00Z"))], [true, false]);
is("7 AM and 7 PM are outside the day", [clearingDue(sean, at("2026-10-16T14:00:00Z")), clearingDue(sean, at("2026-10-17T02:00:00Z"))], [false, false]);
is("the next one, said plainly", [nextClearing(sean, at("2026-10-16T17:30:00Z")), nextClearing(sean, at("2026-10-17T02:30:00Z")), nextClearing(off)],
  ["today at 12 PM Pacific", "tomorrow at 8 AM Pacific", null]);

console.log(failures ? `\n${failures} delivery schedule check(s) failed.\n` : "\nAll delivery schedule checks passed.\n");
process.exit(failures ? 1 : 0);
