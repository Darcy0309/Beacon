import { getBusinessTimeZone, getProductionReport } from "@/features/reports/queries";
import { readPeriod } from "@/features/reports/period";
import { getCurrentUser } from "@/lib/server/session";
import { rolesForPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

const COLUMNS = [
  ["Day", (r) => r.day],
  ["Rep", (r) => r.rep],
  ["Project", (r) => r.project],
  ["Calls", (r) => r.calls],
  ["Leads", (r) => r.leads],
  ["Appointments", (r) => r.appointments],
  ["Confirmations", (r) => r.confirmations],
  ["Chargebacks", (r) => r.chargebacks],
  ["Pay (USD)", (r) => r.amount.toFixed(2)],
];

const cell = (v) => {
  const s = v == null ? "" : String(v);
  // Quote anything with a delimiter, quote or newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const idParam = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);

/**
 * The production report as a CSV, for payroll: the same range and filters as
 * the page, run as the signed-in user, so only an administrator gets every rep.
 */
export async function GET(request) {
  const me = await getCurrentUser();
  if (!me || !rolesForPath("/reports/production")?.includes(me.role)) {
    return new Response("You don't have access to the production report.", { status: 403 });
  }

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const range = readPeriod(sp, await getBusinessTimeZone());
  if (range.error) return new Response(range.error, { status: 400 });

  try {
    const rows = await getProductionReport({
      from: range.from,
      to: range.to,
      projectId: idParam(sp.project),
      userId: me.role === "admin" ? idParam(sp.rep) : null,
    });
    const lines = [COLUMNS.map(([h]) => h).join(","), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(","))];
    const name = range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lighthouse-production-${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[production csv]", err?.message ?? err);
    return new Response("The production report is unavailable right now.", { status: 502 });
  }
}
