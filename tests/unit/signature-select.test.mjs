#!/usr/bin/env node
/** Unit tests for Signature Select (Nov 2026): what a term has charged and where it stands. */
import { addMonthsIso, annualEnd, currentTerm, dollars, termCharges, termStatus, termSummary } from "../../src/lib/signature-select.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

check("a month on, the same day; the month's last when it has fewer", addMonthsIso("2026-01-15", 1) === "2026-02-15" && addMonthsIso("2026-01-31", 1) === "2026-02-28" && addMonthsIso("2026-11-30", 3) === "2027-02-28");
check("an annual term's end: a year on, less a day", annualEnd("2026-01-01") === "2026-12-31" && annualEnd("2026-05-08") === "2027-05-07");

const monthly = { plan: "monthly", amount: 250, starts_on: "2026-08-19", ends_on: null };
check("a monthly term charges each month from its start, to today", JSON.stringify(termCharges(monthly, "2026-11-19")) === JSON.stringify(["2026-08-19", "2026-09-19", "2026-10-19", "2026-11-19"]));
check("…its months and total so far", JSON.stringify(termSummary(monthly, "2026-11-19")) === JSON.stringify({ months: 4, charged: 1000, status: "on" }));
check("…stopping at its end", termCharges({ ...monthly, ends_on: "2026-10-01" }, "2026-11-19").length === 2);
const annual = { plan: "annual", amount: 2400, starts_on: "2026-01-01", ends_on: "2026-12-31" };
check("an annual term charges once, on its start", JSON.stringify(termCharges(annual, "2026-11-19")) === JSON.stringify(["2026-01-01"]) && termSummary(annual, "2026-11-19").months === null);
check("…none before it starts", termCharges({ ...annual, starts_on: "2027-01-01", ends_on: "2027-12-31" }, "2026-11-19").length === 0);
check("where a term stands", termStatus(annual, "2026-11-19") === "on" && termStatus(annual, "2027-01-01") === "ended" && termStatus({ ...annual, starts_on: "2027-01-01" }, "2026-11-19") === "upcoming");
const renewed = { plan: "annual", amount: 2600, starts_on: "2027-01-01", ends_on: "2027-12-31" };
check("the term on now, else the latest", currentTerm([annual, renewed], "2026-11-19") === annual && currentTerm([annual, renewed], "2027-02-01") === renewed && currentTerm([], "2026-11-19") === null);
check("dollars", dollars(1250) === "$1,250" && dollars(12.5) === "$12.50");

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nsignature select: all passed");
