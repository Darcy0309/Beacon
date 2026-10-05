import { getPayReport, getPayRules, getWorkDays } from "@/features/pay/queries";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { rolesForPath } from "@/lib/nav";
import { hourLabel, hoursDecimal, readPayPeriod } from "@/lib/pay";

export const dynamic = "force-dynamic";

const cell = (v) => {
  const s = v == null ? "" : String(v);
  // Quote anything with a delimiter, quote or newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const money = (n) => (Number(n) || 0).toFixed(2);
const idParam = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);

// [heading, value, summed in the Total row]
const PEOPLE = [
  ["Account manager", (p) => p.name],
  ["Email", (p) => p.email],
  ["Pay type", (p) => (p.model === "hybrid" ? "Hybrid" : "Commission")],
  ["Hourly rate (USD)", (p) => (p.model === "hybrid" && p.rate != null ? money(p.rate) : "")],
  ["Hours worked", (p) => hoursDecimal(p.workedMinutes), true],
  ["Hours paid", (p) => hoursDecimal(p.paidMinutes), true],
  ["Hourly pay (USD)", (p) => money(p.hourlyPay), true],
  ["Commission (USD)", (p) => money(p.commission), true],
  ["Pay due (USD)", (p) => money(p.pay), true],
  ["Paid by", (p) => (p.model === "hybrid" ? (p.paidBy === "hourly" ? "Hourly" : "Commission") : "Commission")],
  ["Pay per hour (USD)", (p) => (p.perHour == null ? "" : money(p.perHour))],
  ["Calls", (p) => p.calls, true],
  ["Leads", (p) => p.leads, true],
  ["Appointments", (p) => p.appointments, true],
  ["Confirmations", (p) => p.confirmations, true],
  ["Chargebacks", (p) => p.chargebacks, true],
];

const DAYS = [
  ["Day", (d) => d.day],
  ["Hours worked", (d) => hoursDecimal(d.worked)],
  ["Hours paid", (d) => hoursDecimal(d.paid)],
  ["Hour by hour (minutes worked → paid)", (d) => d.hours.map((h) => `${hourLabel(h.hour)} ${h.minutes}${h.paid !== h.minutes ? `→${h.paid}` : ""}`).join("; ")],
];

/**
 * Pay & hours as a CSV, for payroll: the same period as the page, run as the
 * signed-in user, so only an administrator gets everyone. One row a person
 * with a Total row; with ?user= one person's days instead.
 */
export async function GET(request) {
  const me = await getCurrentUser();
  if (!me || !rolesForPath("/reports/pay")?.includes(me.role)) {
    return new Response("You don't have access to pay and hours.", { status: 403 });
  }

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const [rules, today] = await Promise.all([getPayRules(), getBusinessToday()]);
  const range = readPayPeriod(sp, today, rules.time);
  if (range.error) return new Response(range.error, { status: 400 });
  const userId = me.role === "admin" ? idParam(sp.user) : sp.user ? me.id : null;

  try {
    let lines;
    let kind;
    if (userId) {
      const days = await getWorkDays({ from: range.from, to: range.to, userId });
      lines = [DAYS.map(([h]) => h).join(","), ...days.map((d) => DAYS.map(([, get]) => cell(get(d))).join(","))];
      kind = `hours-${userId}`;
    } else {
      const people = await getPayReport({ from: range.from, to: range.to });
      const total = Object.fromEntries(["workedMinutes", "paidMinutes", "hourlyPay", "commission", "pay", "calls", "leads", "appointments", "confirmations", "chargebacks"]
        .map((k) => [k, people.reduce((n, p) => n + p[k], 0)]));
      const totalLine = PEOPLE.map(([, get, summed], i) => (i === 0 ? "Total" : summed ? cell(get(total)) : "")).join(",");
      lines = [PEOPLE.map(([h]) => h).join(","), ...people.map((p) => PEOPLE.map(([, get]) => cell(get(p))).join(",")), ...(people.length ? [totalLine] : [])];
      kind = "pay";
    }
    const name = range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lighthouse-${kind}-${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[pay csv]", err?.message ?? err);
    return new Response("Pay and hours are unavailable right now.", { status: 502 });
  }
}
