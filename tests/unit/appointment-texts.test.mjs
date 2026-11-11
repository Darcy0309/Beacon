#!/usr/bin/env node
/** Unit tests for appointment reminder texts (lib/appointment-texts.js; client, Nov 2026). */
import assert from "node:assert/strict";
import { APPT_TEXT_DEFAULTS, apptReply, apptTextBody, apptTextSettings, apptTextWhen } from "../../src/lib/appointment-texts.js";

// The setting: checked, with the defaults for the rest.
assert.deepEqual(apptTextSettings(null, "America/Chicago"), { body: APPT_TEXT_DEFAULTS.body, hour: 10, zone: "America/Chicago" }, "unset: 10 AM on the business's clock");
assert.deepEqual(apptTextSettings({ body: "  Hi  ", hour: 9, zone: "America/New_York" }), { body: "Hi", hour: 9, zone: "America/New_York" });
assert.equal(apptTextSettings({ hour: 3 }).hour, 10, "not at night");
assert.equal(apptTextSettings({ hour: "11" }).hour, 11);
assert.equal(apptTextSettings({ zone: "Mars/Olympus" }, "Europe/Paris").zone, APPT_TEXT_DEFAULTS.zone, "a clock not offered: the default");
assert.equal(apptTextSettings({ body: "x".repeat(2000) }).body.length, 1600);
assert.equal(apptTextWhen({ hour: 10, zone: "America/Phoenix" }), "10 AM Arizona time, the day before");

// Filled in for an appointment.
const values = { first_name: "Marco", company: "Coastline Auto", client: "Capital Insurance", agent_name: "Jen Carter", appt_date: "Thursday, November 12", appt_time: "10:00 AM", my_name: "Kristy Wilkes" };
assert.equal(apptTextBody(APPT_TEXT_DEFAULTS.body, values),
  "Capital Insurance: Hi Marco, reminder of your appointment with Jen Carter tomorrow, Thursday, November 12 at 10:00 AM. Reply Y to confirm, N to cancel, R to reschedule.");
assert.equal(apptTextBody("Hi {first_name}, see {Agent_Name } then.", { agent_name: "Jen" }), "Hi, see Jen then.", "nothing to fill: it goes, with its space");
assert.equal(apptTextBody("{unknown} stays", values), "{unknown} stays");

// The prospect's answer.
for (const [said, meant] of [["Y", "Y"], ["y", "Y"], [" Yes! ", "Y"], ["yes.", "Y"], ["Confirmed", "Y"], ["N", "N"], ["no", "N"], ["Cancel", "N"],
  ["R", "R"], ["reschedule", "R"], ["\"R\"", "R"], ["Yes but can we move it?", null], ["What time?", null], ["", null], [null, null], ["STOP", null]]) {
  assert.equal(apptReply(said), meant, JSON.stringify(said));
}
console.log("appointment texts: ok");
