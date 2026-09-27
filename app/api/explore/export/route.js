import { exploreLeads, getCurrentUser } from "@/lib/queries";
import { readCriteria } from "@/lib/explore";
import { rolesForPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

// Enough for any real list; beyond this, narrow the question.
const MAX_ROWS = 10000;

const COLUMNS = [
  ["Company", (r) => r.company_name],
  ["Contact", (r) => r.contact_name],
  ["Phone", (r) => r.phone],
  ["Email", (r) => r.email],
  ["City", (r) => r.city],
  ["State", (r) => r.state],
  ["ZIP", (r) => r.zip],
  ["County", (r) => r.county],
  ["SIC", (r) => r.sic_code],
  ["Client", (r) => r.client_name],
  ["Status", (r) => r.status_name],
  ["Ultimate X-Date", (r) => r.ultimate_xdate],
  ["Current Carrier", (r) => r.carrier_name],
  ["Assigned Rep", (r) => r.rep_name],
  ["Lead ID", (r) => r.id],
];

const cell = (v) => {
  const s = v == null ? "" : String(v);
  // Quote anything with a delimiter, quote or newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * The explorer's current question as a CSV. Same criteria as the page, run
 * as the signed-in user, so Row Level Security scopes the export too.
 */
export async function GET(request) {
  // The same roles that can open the explorer page may export from it.
  const me = await getCurrentUser();
  if (!me || !rolesForPath("/explore")?.includes(me.role)) {
    return new Response("You don't have access to the lead explorer.", { status: 403 });
  }

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const criteria = readCriteria(sp);
  try {
    const { rows, total } = await exploreLeads(criteria, { page: 1, perPage: MAX_ROWS });
    const lines = [COLUMNS.map(([h]) => h).join(","), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(","))];
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lighthouse-leads-${stamp}.csv"`,
        "X-Total-Count": String(total),
        "X-Exported-Count": String(rows.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[explore/export]", err?.message ?? err);
    return new Response("Export failed. Try again.", { status: 502 });
  }
}
