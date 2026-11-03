/**
 * The administrators' Reports (Sean, Nov 2026), from report_counts()'s rows
 * (a row a month, project and manager: leads, invalid leads, appointments,
 * confirmed, pending, invalid ones, rescheduled) and billing_report()'s. Each
 * tile counts the current month, or the last three or six; the billing
 * listing a range of days. Pure, so the page and the tests share it.
 */

import { addMonths, monthEnd, monthStart } from "./dates.js";

export const PERIODS = [["1", "1M"], ["3", "3M"], ["6", "6M"]];
/** A tile's months, from its address: 1 (the current month), 3 or 6. */
export const periodOf = (v) => (["1", "3", "6"].includes(String(v)) ? Number(v) : 1);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last `n` months to `today`'s, oldest first: [{ key: "2026-11", label: "Nov", from, to }]. */
export function lastMonths(today, n = 6) {
  const first = monthStart(today);
  return Array.from({ length: n }, (_, i) => {
    const m = addMonths(first, i - n + 1);
    return { key: m.slice(0, 7), label: MONTH_NAMES[Number(m.slice(5, 7)) - 1], from: m, to: monthEnd(m) };
  });
}

const FIGURES = ["leads", "invalid_leads", "appts", "confirmed", "pending", "invalid_appts", "rescheduled"];
const zero = () => Object.fromEntries(FIGURES.map((k) => [k, 0]));
const add = (into, r) => { for (const k of FIGURES) into[k] += Number(r[k] ?? 0); return into; };

/** The rows of the months given (their keys). */
export const inMonths = (rows, keys) => {
  const want = new Set(keys);
  return (rows ?? []).filter((r) => want.has(r.ym));
};

/** Every figure, summed. */
export const totals = (rows) => (rows ?? []).reduce(add, zero());

/**
 * Summed by whatever `keyOf(row)` gives (a Sales Rep, a client, a manager): [{ key, ...figures }].
 * Rows whose key is null are left out.
 */
export function groupBy(rows, keyOf) {
  const out = new Map();
  for (const r of rows ?? []) {
    const k = keyOf(r);
    if (k == null) continue;
    add(out.get(k) ?? out.set(k, { key: k, ...zero() }).get(k), r);
  }
  return [...out.values()];
}

/** A client's production: a lead 1, an appointment 2 (Sean's scoring; Nov 2026). */
export const units = (g) => g.leads + 2 * g.appts;

/** The top `n` clients by units: [{ key, leads, appts, units }], ties by name. `name(key)` for the order of ties. */
export function topClients(groups, n = 5, name = (k) => String(k)) {
  return groups.map((g) => ({ ...g, units: units(g) })).filter((g) => g.units > 0)
    .sort((a, b) => b.units - a.units || name(a.key).localeCompare(name(b.key))).slice(0, n);
}

/** Appointment Outcomes: scheduled (every one set), confirmed, rescheduled, invalid. */
export const outcomes = (t) => [["Scheduled", t.appts + t.invalid_appts], ["Confirmed", t.confirmed], ["Rescheduled", t.rescheduled], ["Invalid", t.invalid_appts]];

/** Each month's leads and appointments: [{ key, label, leads, appts }]. */
export const monthSeries = (rows, months) => months.map((m) => {
  const t = totals(inMonths(rows, [m.key]));
  return { key: m.key, label: m.label, leads: t.leads, appts: t.appts };
});

const money = (n) => Math.round(n * 100) / 100;

/** A billing row with its billing worked out: leads × the lead rate, appointments × the appointment rate, and both. */
export function withBilling(r) {
  const leadRate = r.bill_lead_rate == null ? null : Number(r.bill_lead_rate);
  const apptRate = r.bill_appointment_rate == null ? null : Number(r.bill_appointment_rate);
  const leadBilling = leadRate == null ? null : money(Number(r.leads) * leadRate);
  const apptBilling = apptRate == null ? null : money(Number(r.appts) * apptRate);
  return {
    ...r, leads: Number(r.leads), appts: Number(r.appts), confirmed: Number(r.confirmed), pending: Number(r.pending),
    invalid_appts: Number(r.invalid_appts), invalid_leads: Number(r.invalid_leads), names_called: Number(r.names_called), cost: money(Number(r.cost ?? 0)),
    leadBilling, apptBilling, totalBilling: leadBilling == null && apptBilling == null ? null : money((leadBilling ?? 0) + (apptBilling ?? 0)),
  };
}

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (n) => (n == null ? "" : n.toFixed(2));

/** The billing listing as a CSV, the columns of Sean's sample, a project a row, with a total. */
export function billingCsv(rows) {
  const head = ["Client", "Project", "Leads", "LeadBilling", "Appointments", "AppointmentBilling", "TotalBilling", "ConfirmedAppts", "InvalidAppts", "PendingAppts", "NamesCalled", "Cost"];
  const line = (r) => [r.client, r.project, r.leads, dollars(r.leadBilling), r.appts, dollars(r.apptBilling), dollars(r.totalBilling),
    r.confirmed, r.invalid_appts, r.pending, r.names_called, dollars(r.cost)];
  const sum = (k) => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  const total = ["Total", "", sum("leads"), dollars(sum("leadBilling")), sum("appts"), dollars(sum("apptBilling")), dollars(sum("totalBilling")),
    sum("confirmed"), sum("invalid_appts"), sum("pending"), sum("names_called"), dollars(sum("cost"))];
  return [head, ...rows.map(line), total].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** A figure's names as a CSV: the business, when, its manager, the cost, the Sales Rep. */
export function itemsCsv(items, kind) {
  const appt = !["leads", "invalid_leads"].includes(kind);
  const head = ["Company", appt ? "Date set" : "Date developed", ...(appt ? ["Appointment", "Status"] : ["Status"]), "Manager", "Cost", "Sales Rep", "Project"];
  const line = (i) => [i.company, i.at, ...(appt ? [[i.appt_date, i.appt_time].filter(Boolean).join(" "), i.status] : [i.status]), i.manager, dollars(Number(i.cost ?? 0)), i.sales_rep, i.project];
  return [head, ...items.map(line)].map((r) => r.map(cell).join(",")).join("\r\n");
}
