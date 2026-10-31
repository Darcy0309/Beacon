#!/usr/bin/env node
/** Unit tests for display formatting: the tel: links the Call buttons dial. */
import { appointmentKind, formatPhone, telHref, typePhone } from "../../src/lib/format.js";

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

// Phone numbers kept one way, 602-555-0100 (Sean, Oct 2026), and nothing else in the field.
for (const typed of ["6025550100", "(602) 555-0100", "602.555.0100", "+1 602 555 0100", "1-602-555-0100", " 602-555-0100 "]) {
  eq(`"${typed}" is kept as 602-555-0100`, formatPhone(typed), "602-555-0100");
}
eq("an extension kept after it", formatPhone("(602) 555-0100 ext. 203"), "602-555-0100 x203");
eq("…written as x", formatPhone("6025550100x15"), "602-555-0100 x15");
eq("a note after it is not a phone number", formatPhone("602-555-0100 cell"), null);
eq("…nor nine digits", formatPhone("602-555-010"), null);
eq("…nor nothing", formatPhone(""), null);
eq("typing: grouped as it comes", ["6", "602", "6025", "602555", "6025550", "6025550100"].map(typePhone).join(" | "), "6 | 602 | 602-5 | 602-555 | 602-555-0 | 602-555-0100");
eq("…pasted with brackets and spaces", typePhone("(602) 555-0100"), "602-555-0100");
eq("…a word after it dropped", typePhone("602-555-0100 cell"), "602-555-0100");
eq("…no more than ten digits", typePhone("60255501009"), "602-555-0100");
eq("…an extension once it is whole", [typePhone("602-555-0100 x"), typePhone("602-555-0100 ext 2034567"), typePhone("602-555 x")].join(" | "), "602-555-0100 x | 602-555-0100 x203456 | 602-555");
eq("…its leading 1 dropped once there are eleven digits", typePhone("16025550100"), "602-555-0100");

console.log(failures ? `\n${failures} format check(s) failed.\n` : "\nAll format checks passed.\n");
process.exit(failures ? 1 : 0);
