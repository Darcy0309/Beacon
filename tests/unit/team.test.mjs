import assert from "node:assert/strict";
import { GIFTS, TEAM_FILTERS, birthdayLabel, birthdayOf, giftOf, tenure } from "../../src/lib/team.js";

assert.equal(GIFTS.length, 9);
assert.deepEqual(giftOf("cake"), ["cake", "🎂", "Birthday cake"]);
assert.equal(birthdayOf("", "4"), null, "no month: none");
assert.equal(birthdayOf("3", "14"), "2000-03-14");
assert.equal(birthdayOf("2", "29"), "2000-02-29", "29 February is kept (2000 is a leap year)");
assert.throws(() => birthdayOf("4", "31"), /not in that month/);
assert.equal(birthdayLabel("2000-03-14"), "March 14");
assert.equal(tenure("2026-10-05", "2026-10-22"), "New this month");
assert.equal(tenure("2026-02-23", "2026-10-22"), "7 months");
assert.equal(tenure("2023-10-22", "2026-10-22"), "3 years");
const pick = (k) => TEAM_FILTERS.find(([key]) => key === k)[2];
assert.equal(pick("leads")({ does: "Lead development & appointment setting" }), true);
assert.equal(pick("appts")({ does: "Lead development" }), false);
assert.equal(pick("admins")({ role: "admin" }), true);
console.log("team: ok");
