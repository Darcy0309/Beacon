import assert from "node:assert/strict";
import { goalProgress, projectDays } from "../../src/lib/project-goals.js";

// A 30-day project, 10 days in.
const days = projectDays({ start: "2026-10-01", end: "2026-10-30", today: "2026-10-10" });
assert.deepEqual(days, { daysPassed: 10, daysLeft: 20, totalDays: 30, share: 10 / 30 });
// Before it starts, and after it ends.
assert.equal(projectDays({ start: "2026-11-01", end: "2026-11-30", today: "2026-10-10" }).daysPassed, 0);
assert.deepEqual(projectDays({ start: "2026-09-01", end: "2026-09-30", today: "2026-10-10" }), { daysPassed: 30, daysLeft: 0, totalDays: 30, share: 1 });
// No dates: nothing to judge pace by.
assert.deepEqual(projectDays({ today: "2026-10-10" }), { daysPassed: null, daysLeft: null, totalDays: null, share: null });

assert.equal(goalProgress({ goal: null, done: 5, share: 0.5 }), null, "no goal");
assert.equal(goalProgress({ goal: 0, done: 5, share: 0.5 }), null, "a goal of nothing");
assert.deepEqual(goalProgress({ goal: 300, done: 90, share: days.share }), { goal: 300, done: 90, pct: 30, owed: 210, extra: 0, expected: 100, status: "behind" });
assert.equal(goalProgress({ goal: 300, done: 100, share: days.share }).status, "on pace");
assert.deepEqual(goalProgress({ goal: 100, done: 112, share: 0.5 }), { goal: 100, done: 112, pct: 112, owed: 0, extra: 12, expected: 50, status: "met" });
assert.equal(goalProgress({ goal: 100, done: 40, share: null }).status, null, "no dates: no pace");
console.log("project-goals: ok");
