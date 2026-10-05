#!/usr/bin/env node
/** Unit tests for pay: the rates an administrator picks from, pay periods, hours, and production totals. */
import { hourLabel, hoursDecimal, hoursLabel, payPeriod, rateOptions, readPayPeriod } from "../../src/lib/pay.js";
import { CSV_COLUMNS, groupProduction, totalOf, totalRow } from "../../src/features/reports/production.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// --- the rates to pick from ----------------------------------------------------
eq("lead pay: $0, then $8–$12 in 50¢ steps", rateOptions({ min: 8, max: 12, step: 0.5 }), [0, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12]);
eq("special pay: $0, then $5–$20 in $1 steps", rateOptions({ min: 5, max: 20, step: 1 }).length, 17);
eq("a current rate outside the range stays listed", rateOptions({ min: 8, max: 12, step: 0.5 }, 15).at(-1), 15);
eq("…and one between the steps too", rateOptions({ min: 8, max: 12, step: 1 }, 10.25).includes(10.25), true);
eq("no rounding drift in cents", rateOptions({ min: 0.1, max: 0.3, step: 0.1 }), [0, 0.1, 0.2, 0.3]);
eq("a step that misses the top still offers the top", rateOptions({ min: 30, max: 50, step: 7 }).at(-1), 50);

// --- hours --------------------------------------------------------------------
eq("7h 30m", hoursLabel(450), "7h 30m");
eq("45m", hoursLabel(45), "45m");
eq("1h", hoursLabel(60), "1h");
eq("0m", hoursLabel(0), "0m");
eq("decimal hours for payroll", [hoursDecimal(450), hoursDecimal(90), hoursDecimal(0)], ["7.50", "1.50", "0.00"]);
eq("hours of the day", [hourLabel(0), hourLabel(8), hourLabel(12), hourLabel(13), hourLabel(23)], ["12 AM", "8 AM", "12 PM", "1 PM", "11 PM"]);

// --- pay periods ----------------------------------------------------------------
const weekly = { pay_period: "weekly", period_start: "2026-10-05" };
eq("weekly: the week containing today", payPeriod("2026-10-08", weekly), { from: "2026-10-05", to: "2026-10-11" });
eq("weekly: the week before", payPeriod("2026-10-08", weekly, -1), { from: "2026-09-28", to: "2026-10-04" });
eq("weekly: before the start date, counted back", payPeriod("2026-10-01", weekly), { from: "2026-09-28", to: "2026-10-04" });
eq("weekly: the last day of a period", payPeriod("2026-10-11", weekly), { from: "2026-10-05", to: "2026-10-11" });
const biweekly = { pay_period: "biweekly", period_start: "2026-10-05" };
eq("two-weekly: the first fortnight", payPeriod("2026-10-18", biweekly), { from: "2026-10-05", to: "2026-10-18" });
eq("two-weekly: the next", payPeriod("2026-10-20", biweekly), { from: "2026-10-19", to: "2026-11-01" });
eq("two-weekly: the one before", payPeriod("2026-10-20", biweekly, -1), { from: "2026-10-05", to: "2026-10-18" });
const semi = { pay_period: "semimonthly" };
eq("twice a month: 1st–15th", payPeriod("2026-10-08", semi), { from: "2026-10-01", to: "2026-10-15" });
eq("twice a month: 16th–end", payPeriod("2026-10-20", semi), { from: "2026-10-16", to: "2026-10-31" });
eq("twice a month: before the 1st is last month's second half", payPeriod("2026-10-08", semi, -1), { from: "2026-09-16", to: "2026-09-30" });
eq("twice a month: across a year", payPeriod("2026-01-05", semi, -1), { from: "2025-12-16", to: "2025-12-31" });
eq("twice a month: February's second half", payPeriod("2026-02-20", semi), { from: "2026-02-16", to: "2026-02-28" });
const monthly = { pay_period: "monthly" };
eq("monthly", payPeriod("2026-10-08", monthly), { from: "2026-10-01", to: "2026-10-31" });
eq("monthly: the month before", payPeriod("2026-03-31", monthly, -1), { from: "2026-02-01", to: "2026-02-28" });

eq("the report opens on this pay period", (({ period, from, to }) => ({ period, from, to }))(readPayPeriod({}, "2026-10-08", weekly)),
  { period: "current", from: "2026-10-05", to: "2026-10-11" });
eq("…or the last one", (({ period, from }) => ({ period, from }))(readPayPeriod({ period: "previous" }, "2026-10-08", weekly)),
  { period: "previous", from: "2026-09-28" });
eq("a custom range", (({ period, from, to, error }) => ({ period, from, to, error }))(readPayPeriod({ period: "custom", from: "2026-09-01", to: "2026-09-30" }, "2026-10-08", weekly)),
  { period: "custom", from: "2026-09-01", to: "2026-09-30", error: null });
const reversed = readPayPeriod({ period: "custom", from: "2026-09-30", to: "2026-09-01" }, "2026-10-08", weekly);
check("a reversed range says so and shows this pay period", reversed.error && reversed.period === "current" && reversed.from === "2026-10-05", JSON.stringify(reversed));

// --- production totals ------------------------------------------------------------
const row = (o) => ({ calls: 0, leads: 0, appointments: 0, confirmations: 0, chargebacks: 0, leadPay: 0, appointmentPay: 0, specialPay: 0, chargebackAmount: 0, amount: 0, ...o });
const rows = [
  row({ day: "2026-10-05", userId: 1, rep: "Sean", projectId: 10, project: "DBDev", clientId: 7, client: "Capital", calls: 20, leads: 2, leadPay: 20, amount: 20 }),
  row({ day: "2026-10-06", userId: 1, rep: "Sean", projectId: 11, project: "Appts", clientId: 7, client: "Capital", appointments: 1, confirmations: 1, appointmentPay: 30, specialPay: 5, amount: 35 }),
  row({ day: "2026-10-06", userId: 2, rep: "Mike", projectId: 12, project: "Other", clientId: 8, client: "Bender", calls: 5, chargebacks: 1, chargebackAmount: -30, amount: -30 }),
];
const byRep = groupProduction(rows, "rep");
eq("by account manager: Sean's two days added", byRep.map((r) => [r.rep, r.calls, r.amount]), [["Sean", 20, 55], ["Mike", 5, -30]]);
eq("by client: Capital's two projects added", groupProduction(rows, "client").map((r) => [r.client, r.leadPay, r.appointmentPay, r.specialPay, r.amount]),
  [["Capital", 20, 30, 5, 55], ["Bender", 0, 0, 0, -30]]);
eq("by project: one row each", groupProduction(rows, "project").length, 3);
eq("day by day: rows as they are", groupProduction(rows, "day"), rows);
const total = totalOf(rows);
eq("the total", [total.calls, total.amount, total.chargebackAmount], [25, 25, -30]);
eq("the CSV's Total row: names blank, figures summed", totalRow(CSV_COLUMNS.project, total),
  ["Total", "", 25, 2, 1, 1, 1, "20.00", "30.00", "5.00", "-30.00", "25.00"]);
eq("every layout ends with the total pay", Object.values(CSV_COLUMNS).every((cols) => cols.at(-1)[0] === "Total pay (USD)"), true);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll pay checks passed.");
