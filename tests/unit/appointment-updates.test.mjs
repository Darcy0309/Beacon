import assert from "node:assert/strict";
import { PICKABLE_STATUSES, STATUS_KEYS, UPDATE_STATUSES, dueLine, money, overdue, parseAmount, soldLines, statusLabel, updateBy } from "../../src/lib/appointment-updates.js";

assert.equal(STATUS_KEYS.length, 9, "nine statuses, as Sean listed them");
assert.equal(statusLabel("valid_quoting"), "Valid-Quoting");
assert.equal(statusLabel("sold"), "Sold Account");

assert.equal(parseAmount(""), null);
assert.equal(parseAmount("$12,500.50"), 12500.5);
assert.ok(Number.isNaN(parseAmount("twelve")));
assert.equal(money(12500), "$12,500");
assert.equal(money(12500.5), "$12,500.50");

assert.deepEqual(soldLines({}), { error: "Enter the premium on at least one policy line" });
assert.deepEqual(soldLines({ auto: { premium: "4,000", carrier: "" } }), { error: "Auto: choose the carrier it was placed with" });
assert.deepEqual(soldLines({ eo: { premium: "abc", carrier: "Hartford" } }), { error: "E&O: enter the premium as an amount" });
assert.deepEqual(soldLines({ liability: { premium: "10000", carrier: "Travelers" }, auto: { premium: "2,500.25", carrier: "Progressive" }, health: { premium: "", carrier: "" } }),
  { lines: [{ line: "liability", premium: 10000, carrier: "Travelers" }, { line: "auto", premium: 2500.25, carrier: "Progressive" }], total: 12500.25 });

assert.equal(overdue("no_status", "2026-10-30", "2026-10-31"), true, "past its day, no status: late");
assert.equal(overdue("no_status", "2026-10-30", "2026-10-30"), false, "on its day: not yet");
assert.equal(overdue("valid", "2026-10-30", "2026-11-05"), false, "updated: never late");

// Valid-Not Updated (Sean, Nov 2026): given by the system once the due date passes, listed but not picked.
assert.equal(statusLabel("valid_not_updated"), "Valid-Not Updated");
assert.ok(UPDATE_STATUSES.some(([k]) => k === "valid_not_updated") && !PICKABLE_STATUSES.some(([k]) => k === "valid_not_updated") && !STATUS_KEYS.includes("valid_not_updated"),
  "listed (to filter by), not offered or accepted");
const day = (d) => d.slice(5);
assert.deepEqual(dueLine({ update: "no_status", dueOn: "2026-11-12" }, "2026-11-10", day), { text: "Due by 11-12", late: false });
assert.deepEqual(dueLine({ update: "no_status", dueOn: "2026-11-12" }, "2026-11-16", day), { text: "Overdue · due 11-12", late: true });
assert.deepEqual(dueLine({ update: "valid_not_updated", dueOn: "2026-11-12" }, "2026-11-16", day), { text: "Not updated · was due 11-12", late: true },
  "the red date stays once it is Valid-Not Updated");
assert.equal(dueLine({ update: "no_status", dueOn: "2026-11-12", invalid: true }, "2026-11-16", day), null, "found invalid: no update asked for");
assert.equal(dueLine({ update: "sold", dueOn: "2026-11-12" }, "2026-11-16", day), null);
assert.equal(updateBy("valid_not_updated", null), "Lighthouse (not updated by the due date)");
assert.equal(updateBy("sold", "Pat Lee"), "Pat Lee");
assert.equal(updateBy("sold", null), "—");
console.log("appointment-updates: ok");
