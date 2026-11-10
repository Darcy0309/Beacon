#!/usr/bin/env node
/** Unit tests for times on a person's own clock (lib/own-clock.js; client, Nov 2026). */
import assert from "node:assert/strict";
import { knownZone, stampIn, zoneShort } from "../../src/lib/own-clock.js";

const at = "2026-11-10T00:30:00Z"; // Nov 9, 4:30 PM in Los Angeles; 5:30 PM in Phoenix
assert.equal(zoneShort("America/Los_Angeles", new Date(at)), "PST");
assert.equal(zoneShort("Nowhere/Atlantis"), null);
assert.equal(knownZone("America/Los_Angeles", "America/Phoenix"), "America/Los_Angeles");
assert.equal(knownZone("Nowhere/Atlantis", "America/Phoenix"), "America/Phoenix");
assert.equal(knownZone(null, "America/Phoenix"), "America/Phoenix");
// The client's case: set for 4:30 PM in California, shown as 4:30 PM PST, not Arizona's 5:30.
assert.equal(stampIn(at, "America/Los_Angeles", "America/Phoenix"), "11/09/2026, 4:30 PM PST");
assert.equal(stampIn(at, null, "America/Phoenix"), "11/09/2026, 5:30 PM", "older reminders: the business's clock");
assert.equal(stampIn(at, "America/Phoenix", "America/Phoenix"), "11/09/2026, 5:30 PM", "the business's own zone: not named");
assert.equal(stampIn(null, "America/Los_Angeles", "America/Phoenix"), "—");
console.log("own clock: ok");
