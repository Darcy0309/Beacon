#!/usr/bin/env node
/** Texts to a client's producers (Sean, Nov 2026): who gets one, for which calls, and what it says. */
import assert from "node:assert/strict";
import { cleanProducers, producerTextTo } from "../../src/lib/project-info.js";
import { producerTextBody, producerTextKind } from "../../src/lib/producer-texts.js";
import { cross, schemas, validate } from "../../src/lib/validate.js";

// A mobile kept as ten digits; Texts only with one.
const kept = cleanProducers([
  { first: "Josh", last: "Huray", email: "josh@agency.test", leads: true, mobile: "(602) 555-0142", texts: true },
  { first: "Amy", mobile: "not a number", texts: true },
  { first: "Bo", mobile: "+1 480 555 0199", texts: false },
  { first: "Cy", mobile: "602.555.0142", texts: true },
]);
assert.deepEqual(kept.map((p) => [p.mobile, p.texts]), [["6025550142", true], ["", false], ["4805550199", false], ["6025550142", true]]);
assert.deepEqual(producerTextTo(kept), [{ name: "Josh Huray", mobile: "6025550142" }], "ticked with a mobile, each number once");
assert.deepEqual(producerTextTo(undefined), []);
// One known only by a mobile is still a producer.
assert.equal(cleanProducers([{ mobile: "6025550142" }]).length, 1);

// Which calls text them.
assert.equal(producerTextKind({ effect: "appointment", ownCall: true }), "new");
assert.equal(producerTextKind({ effect: "appointment", ownCall: false, moved: true }), "rescheduled");
assert.equal(producerTextKind({ effect: "appointment", ownCall: false }), null, "set again, unchanged: nothing");
assert.equal(producerTextKind({ effect: "confirm" }), "confirmed");
assert.equal(producerTextKind({ effect: "reschedule" }), "rescheduled", "Appointment-Rescheduled (Sean, Nov 2026)");
assert.equal(producerTextKind({ effect: "appointment_invalid" }), null);
assert.equal(producerTextKind({ effect: null }), null, "a lead: email only");

// What it says.
const facts = { from: "Signature Marketing", company: "ABC Trucking", when: "Thursday, November 20", time: "10:00 AM", contact: "Joe Smith", phone: "6025550100" };
assert.equal(producerTextBody("new", facts),
  "Signature Marketing: New appointment: ABC Trucking, Thursday, November 20 at 10:00 AM. Joe Smith, 602-555-0100. Details are in your email. Reply STOP to opt out.");
assert.equal(producerTextBody("rescheduled", facts),
  "Signature Marketing: Appointment rescheduled: ABC Trucking, now Thursday, November 20 at 10:00 AM. Joe Smith, 602-555-0100. Details are in your email. Reply STOP to opt out.");
assert.equal(producerTextBody("confirmed", facts),
  "Signature Marketing: Appointment confirmed: ABC Trucking, Thursday, November 20 at 10:00 AM. Joe Smith, 602-555-0100. Reply STOP to opt out.");
assert.equal(producerTextBody("new", { ...facts, emailed: false, contact: null, phone: null }),
  "Signature Marketing: New appointment: ABC Trucking, Thursday, November 20 at 10:00 AM. Reply STOP to opt out.");
assert.equal(producerTextBody("cancelled", facts), null);

// The form: Texts needs a mobile; a mobile must be a phone number.
const form = (raw) => validate(raw, schemas.projectInfo, cross.projectInfo).errors;
assert.deepEqual(form({ producer_first_1: "Josh", producer_texts_1: "on" }), { producer_mobile_1: "Add their mobile to text them" });
assert.ok(form({ producer_first_1: "Josh", producer_mobile_1: "555-01" }).producer_mobile_1, "not a phone number");
assert.deepEqual(form({ producer_first_1: "Josh", producer_mobile_1: "(602) 555-0142", producer_texts_1: "on" }), {});
console.log("producer-texts: ok");
