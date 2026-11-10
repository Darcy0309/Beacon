/**
 * Program Funding (client, Nov 2026): how a client pays for a project's program.
 * Pure, for the form's preview, the server that keeps the schedule, and tests.
 *
 *   monthly       billed each month for what we produced (the most common): the month's
 *                 leads and valid appointments at the project's rates; setup and list fees,
 *                 if any, with the first
 *   installments  the program's total over a number of payments: the first the first block
 *                 of leads with the setup and list fees, the rest split evenly
 *   advance       the whole program paid up front
 *
 * Appointments are usually billed monthly, for the valid ones the client updates, apart from
 * the leads; `apptsIncluded` puts them in the installments instead.
 *
 * Money is worked in cents, so the payments always add up to the total to the cent.
 */

export const FUNDING_PLANS = [
  ["monthly", "Billed monthly for what we produce"],
  ["installments", "Installments"],
  ["advance", "Paid in advance"],
];
const PLAN_KEYS = new Set(FUNDING_PLANS.map(([k]) => k));
export const MAX_PAYMENTS = 36;

const cents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const count = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" for `day` of the month `add` months after `iso`'s (the day kept inside a short month). */
export function monthDay(iso, add, day) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + add;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), last);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A plan read from a form or a row, every figure made safe. */
export function readFunding(f = {}) {
  const plan = PLAN_KEYS.has(f.plan) ? f.plan : "monthly";
  const payments = Math.min(MAX_PAYMENTS, Math.max(1, count(f.payments) || 1));
  const firstDue = ISO.test(f.firstDue ?? "") ? f.firstDue : null;
  const dueDay = Math.min(28, Math.max(1, count(f.dueDay) || (firstDue ? Number(firstDue.slice(8, 10)) : 1)));
  return {
    plan,
    leads: count(f.leads),
    appts: count(f.appts),
    apptsIncluded: Boolean(f.apptsIncluded) && f.apptsIncluded !== "false",
    setupFee: cents(f.setupFee) / 100,
    listFee: cents(f.listFee) / 100,
    payments: plan === "advance" ? 1 : payments,
    firstLeads: f.firstLeads === "" || f.firstLeads == null ? null : count(f.firstLeads),
    firstDue,
    dueDay: Math.min(dueDay, 28),
  };
}

/** What each month's production is billed for: the leads (billed monthly), the appointments (unless in the installments). */
export const billsMonthly = (f) => ({ leads: f.plan === "monthly", appts: f.plan === "monthly" || !f.apptsIncluded });

/**
 * The program's total and its fixed payments.
 *   f      readFunding()'s
 *   rates  { lead, appt }: the project's billing per lead and per appointment ($)
 * → { total, leadAmount, apptAmount, fees, payments: [{ seq, due, amount, leads, appts, fees, label }] }
 * A monthly plan has only its fees as a fixed payment (with the first month's bill); the
 * months themselves are billed from what was produced (monthlyBill()).
 */
export function fundingSchedule(f, rates = {}) {
  const lead = cents(rates.lead);
  const appt = cents(rates.appt);
  const fees = cents(f.setupFee) + cents(f.listFee);
  const leadAmount = f.plan === "monthly" ? 0 : f.leads * lead;
  const apptAmount = f.plan !== "monthly" && f.apptsIncluded ? f.appts * appt : 0;
  const total = leadAmount + apptAmount + fees;
  const due = (i) => (f.firstDue ? (i === 0 ? f.firstDue : monthDay(f.firstDue, i, f.dueDay)) : null);
  const out = (list) => ({
    total: total / 100, leadAmount: leadAmount / 100, apptAmount: apptAmount / 100, fees: fees / 100,
    payments: list.map((p) => ({ ...p, amount: p.amount / 100, fees: p.fees / 100 })),
  });

  if (f.plan === "monthly") {
    return out(fees ? [{ seq: 1, due: due(0), amount: fees, leads: 0, appts: 0, fees, label: "Setup & list fees" }] : []);
  }
  const apptsIn = f.apptsIncluded ? f.appts : 0;
  if (f.plan === "advance" || f.payments === 1) {
    return out(total ? [{ seq: 1, due: due(0), amount: total, leads: f.leads, appts: apptsIn, fees, label: "Paid in advance" }] : []);
  }

  // The first: the first block of leads (as asked, else an even share) with the fees.
  const n = f.payments;
  const firstLeads = Math.min(f.leads, f.firstLeads ?? Math.ceil(f.leads / n));
  const first = firstLeads * lead + fees;
  // The rest split evenly, the cents left over on the last.
  const rest = Math.max(0, total - first);
  const each = Math.floor(rest / (n - 1));
  const leadsLeft = f.leads - firstLeads;
  const share = (whole, i) => Math.floor((whole * (i + 1)) / (n - 1)) - Math.floor((whole * i) / (n - 1));
  const list = [{ seq: 1, due: due(0), amount: first, leads: firstLeads, appts: 0, fees, label: `Payment 1 of ${n}` }];
  for (let i = 0; i < n - 1; i++) {
    list.push({
      seq: i + 2, due: due(i + 1), amount: i === n - 2 ? rest - each * (n - 2) : each,
      leads: share(leadsLeft, i), appts: share(apptsIn, i), fees: 0, label: `Payment ${i + 2} of ${n}`,
    });
  }
  return out(list);
}

/**
 * A month's bill from what was produced: { leads, appts, amount } at the project's rates, each
 * only where the plan bills it monthly. `produced`: { leads, appts } (valid appointments).
 */
export function monthlyBill(f, produced, rates = {}) {
  const bills = billsMonthly(f);
  const leads = bills.leads ? count(produced?.leads) : 0;
  const appts = bills.appts ? count(produced?.appts) : 0;
  return { leads, appts, amount: (leads * cents(rates.lead) + appts * cents(rates.appt)) / 100 };
}

/** Billed, paid and still owed over a project's payments ([{ amount, paidAt }]), in dollars. */
export function fundingTotals(payments) {
  const sum = (list) => Math.round(list.reduce((n, p) => n + cents(p.amount), 0)) / 100;
  const billed = sum(payments);
  const paid = sum(payments.filter((p) => p.paidAt));
  return { billed, paid, owed: Math.round((billed - paid) * 100) / 100 };
}

export const usd = (n) => Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
