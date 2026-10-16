#!/usr/bin/env node
/** Unit tests for display formatting: the tel: links the Call buttons dial. */
import { appointmentKind, telHref } from "../../src/lib/format.js";

let failures = 0;
const eq = (label, got, want) => {
  if (got === want) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++; }
};

eq("a US number gets its country code", telHref("(602) 555-0142"), "tel:+16025550142");
eq("…written with a leading 1", telHref("1-602-555-0142"), "tel:+16025550142");
eq("an extension is dialled after a pause", telHref("(214) 269-7488 x203"), "tel:+12142697488,203");
eq("…written as ext.", telHref("214.269.7488 ext. 15"), "tel:+12142697488,15");
eq("…or extension", telHref("214 269 7488 extension 9"), "tel:+12142697488,9");
eq("no number, no link", telHref(""), null);
eq("…nor for nothing at all", telHref(null), null);

// An appointment as its call result says (Sean, Oct 2026), never the old system's "Survey appointment".
for (const r of ["Appointment", "Appointment-Phone", "Appointment-Confirmed"]) eq(`an appointment's kind is its call result: ${r}`, appointmentKind(r), r);
eq("…else Appointment", appointmentKind("Survey appointment"), "Appointment");
eq("…or Appointment-Confirmed once confirmed", appointmentKind(null, true), "Appointment-Confirmed");

console.log(failures ? `\n${failures} format check(s) failed.\n` : "\nAll format checks passed.\n");
process.exit(failures ? 1 : 0);
