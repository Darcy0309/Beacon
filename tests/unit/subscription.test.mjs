import assert from "node:assert/strict";
import { subscriptionNotice } from "../../src/lib/subscription.js";

const today = "2026-10-21";
assert.equal(subscriptionNotice(null, today), null, "no end date: nothing to say");
assert.equal(subscriptionNotice("2026-12-31", today), null, "more than 30 days off: nothing yet");
assert.deepEqual(subscriptionNotice("2026-11-20", today), { daysLeft: 30, ended: false, text: "ends in 30 days" });
assert.equal(subscriptionNotice("2026-10-22", today).text, "ends tomorrow");
assert.equal(subscriptionNotice("2026-10-21", today).text, "ends today");
assert.deepEqual(subscriptionNotice("2026-10-20", today), { daysLeft: -1, ended: true, text: "ended yesterday" });
assert.equal(subscriptionNotice("2026-10-01", today).text, "ended 20 days ago");
// Across a change of clocks (Nov 1): whole days still.
assert.equal(subscriptionNotice("2026-11-03", "2026-10-31").daysLeft, 3);
console.log("subscription: ok");
