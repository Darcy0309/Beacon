#!/usr/bin/env node
/** Unit tests for Program Funding (lib/funding.js). */
import { readFunding, fundingSchedule, monthlyBill, fundingTotals, billsMonthly, monthDay } from "../../src/lib/funding.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const same = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const rates = { lead: 15, appt: 75 };

// --- The client's own example ------------------------------------------------
// 200 leads and 50 appointments over 6 payments: leads $3,000, appointments $3,750, setup $500,
// list $350, $7,600 in all; the first the first 50 leads with the fees ($1,600), then 5 of $1,200.
const example = readFunding({ plan: "installments", leads: 200, appts: 50, apptsIncluded: true, setupFee: 500, listFee: 350,
  payments: 6, firstLeads: 50, firstDue: "2027-01-01", dueDay: 15 });
const s = fundingSchedule(example, rates);
same("the client's example: $7,600 in all", [s.total, s.leadAmount, s.apptAmount, s.fees], [7600, 3000, 3750, 850]);
same("…the first $1,600: the first 50 leads and the fees", [s.payments[0].amount, s.payments[0].leads, s.payments[0].fees], [1600, 50, 850]);
same("…then five of $1,200", s.payments.slice(1).map((p) => p.amount), [1200, 1200, 1200, 1200, 1200]);
same("…the first on the day given, the rest on the 15th of each month", s.payments.map((p) => p.due),
  ["2027-01-01", "2027-02-15", "2027-03-15", "2027-04-15", "2027-05-15", "2027-06-15"]);
same("…the leads they cover adding up to 200, the appointments to 50", [s.payments.reduce((n, p) => n + p.leads, 0), s.payments.reduce((n, p) => n + p.appts, 0)], [200, 50]);
same("…labelled in order", s.payments.map((p) => p.label).join(), "Payment 1 of 6,Payment 2 of 6,Payment 3 of 6,Payment 4 of 6,Payment 5 of 6,Payment 6 of 6");

// --- The usual: appointments billed monthly, apart from the leads ------------
const leadsOnly = readFunding({ plan: "installments", leads: 200, appts: 50, setupFee: 500, listFee: 350, payments: 3, firstDue: "2027-01-01" });
const l = fundingSchedule(leadsOnly, rates);
same("appointments outside the installments: the leads and fees only", l.total, 3850);
same("…over 2-3 installments, the first block an even share when not given", [l.payments.length, l.payments[0].leads, l.payments[0].amount], [3, 67, 1855]);
check("…the payments adding up to the total to the cent", Math.round(l.payments.reduce((n, p) => n + p.amount * 100, 0)) === l.total * 100, JSON.stringify(l.payments.map((p) => p.amount)));
same("…and the appointments billed monthly", billsMonthly(leadsOnly), { leads: false, appts: true });
same("a month's bill: its valid appointments only", monthlyBill(leadsOnly, { leads: 40, appts: 4 }, rates), { leads: 0, appts: 4, amount: 300 });

// --- Billed monthly, paid in advance ------------------------------------------
const monthly = readFunding({ plan: "monthly", setupFee: 500, firstDue: "2027-01-10" });
const m = fundingSchedule(monthly, rates);
same("billed monthly: only the fees fixed, with the first", m.payments.map((p) => [p.amount, p.label, p.due]), [[500, "Setup & list fees", "2027-01-10"]]);
same("…each month's leads and appointments at the rates", monthlyBill(monthly, { leads: 40, appts: 4 }, rates), { leads: 40, appts: 4, amount: 900 });
same("…no fees, no fixed payments", fundingSchedule(readFunding({ plan: "monthly" }), rates).payments, []);
const advance = fundingSchedule(readFunding({ plan: "advance", leads: 100, setupFee: 250, payments: 6, firstDue: "2027-02-01" }), rates);
same("paid in advance: one payment of it all, whatever the count", advance.payments.map((p) => [p.amount, p.leads, p.label]), [[1750, 100, "Paid in advance"]]);

// --- Safe figures and dates ---------------------------------------------------
same("junk reads as nothing: billed monthly, one payment", [readFunding({ plan: "x", payments: "-3", leads: "abc" }).plan, readFunding({ payments: "-3" }).payments, readFunding({ leads: "abc" }).leads], ["monthly", 1, 0]);
same("no more than 36 payments", readFunding({ plan: "installments", payments: 500 }).payments, 36);
same("a due day past the 28th kept to the 28th", readFunding({ dueDay: 31 }).dueDay, 28);
same("the due day from the first date when not given", readFunding({ firstDue: "2027-03-20" }).dueDay, 20);
same("months roll into the next year", monthDay("2027-11-05", 3, 15), "2028-02-15");
same("without a first date, no due dates", fundingSchedule(readFunding({ plan: "installments", leads: 10, payments: 2 }), rates).payments.map((p) => p.due), [null, null]);
same("cents kept exact: $10.01 a lead, 3 leads over 2", fundingSchedule(readFunding({ plan: "installments", leads: 3, payments: 2, firstLeads: 1 }), { lead: 10.01 }).payments.map((p) => p.amount), [10.01, 20.02]);

// --- Billed and paid ----------------------------------------------------------
same("billed, paid and still owed", fundingTotals([{ amount: 1600, paidAt: "2027-01-02" }, { amount: 1200 }, { amount: 1200.5 }]), { billed: 4000.5, paid: 1600, owed: 2400.5 });

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll funding checks passed.");
