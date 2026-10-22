import assert from "node:assert/strict";
import { goalFromMonthly, goalProgress, monthlyPace, projectDays } from "../../src/lib/project-goals.js";

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
// Per month (Sean, Oct 2026): 5 a month over a year's project is 60; without dates, twelve months.
const year = projectDays({ start: "2026-01-01", end: "2026-12-31", today: "2026-04-15" });
assert.equal(goalFromMonthly(5, year), 60);
assert.equal(goalFromMonthly(5, projectDays({ start: "2026-01-01", end: "2026-06-30", today: "2026-04-15" })), 30, "six months: 30");
assert.equal(goalFromMonthly(5, projectDays({ today: "2026-04-15" })), 60, "no dates: a year");
assert.equal(goalFromMonthly("", year), null);
// 3.45 months in (105 days) with 14 done: 4.1 a month, behind a goal of 5; with 18, on pace.
const pace = monthlyPace({ perMonth: 5, done: 14, days: year, thisMonth: 2 });
assert.deepEqual([pace.avg, pace.status, pace.thisMonth], [4.1, "behind", 2]);
assert.equal(monthlyPace({ perMonth: 5, done: 18, days: year }).status, "on pace");
// The first weeks count as a whole month: 3 done ten days in is 3 a month.
assert.equal(monthlyPace({ perMonth: 5, done: 3, days: projectDays({ start: "2026-04-06", end: "2026-12-31", today: "2026-04-15" }) }).avg, 3);
assert.equal(monthlyPace({ perMonth: 5, done: 3, days: projectDays({ today: "2026-04-15" }) }).status, null, "no start date: no pace");
console.log("project-goals: ok");
