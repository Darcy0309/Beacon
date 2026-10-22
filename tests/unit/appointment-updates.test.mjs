import assert from "node:assert/strict";
import { STATUS_KEYS, money, overdue, parseAmount, soldLines, statusLabel } from "../../src/lib/appointment-updates.js";

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
console.log("appointment-updates: ok");
