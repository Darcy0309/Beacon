import { exploreLeads } from "@/features/explore/queries";
import { getCurrentUser } from "@/lib/server/session";
import { readCriteria, EXPORT_LIMIT } from "@/features/explore/criteria";
import { rolesForPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

// Leads read per request: under the database's 10,000-row page, and small enough to stream steadily.
const BATCH = 5000;

const COLUMNS = [
  ["Company", (r) => r.company_name],
  ["Contact", (r) => r.contact_name],
  ["Contact Title", (r) => r.contact_title],
  ["Phone", (r) => r.phone],
  ["Mobile", (r) => r.contact_mobile],
  ["Email", (r) => r.email],
  ["Decision Maker", (r) => r.decision_maker],
  ["DM Title", (r) => r.dm_title],
  ["DM Phone", (r) => r.dm_phone],
  ["DM Mobile", (r) => r.dm_mobile],
  ["DM Email", (r) => r.dm_email],
  ["City", (r) => r.city],
  ["State", (r) => r.state],
  ["ZIP", (r) => r.zip],
  ["County", (r) => r.county],
  ["SIC", (r) => r.sic_code],
  ["Client", (r) => r.client_name],
  ["Status", (r) => r.status_name],
  // The ultimate X-date, else the soonest policy line's: what the renewal-month filter matches.
  ["Renewal Date", (r) => r.renewal_date ?? r.ultimate_xdate],
  ["Ultimate X-Date", (r) => r.ultimate_xdate],
  ["Current Carrier", (r) => r.carrier_name],
  ["Assigned Rep", (r) => r.rep_name],
  ["Lead ID", (r) => r.id],
];

const cell = (v) => {
  const s = v == null ? "" : String(v);
  // Quote anything with a delimiter, quote or newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * The explorer's current question as a CSV. Same criteria as the page, run
 * as the signed-in user, so Row Level Security scopes the export too. At
 * most EXPORT_LIMIT (20,000) leads, newest first, streamed in batches;
 * X-Truncated marks a partial file.
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
    // Read in batches and stream them out: a file of EXPORT_LIMIT (20,000)
    // leads is too big to build whole within the host's response limits.
    // The first batch also says how many leads match.
    const first = await exploreLeads(criteria, { page: 1, perPage: BATCH });
    const total = first.total;
    const count = Math.min(total, EXPORT_LIMIT);
    const encoder = new TextEncoder();
    const line = (r) => COLUMNS.map(([, get]) => cell(get(r))).join(",");
    const body = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`﻿${COLUMNS.map(([h]) => h).join(",")}\r\n`));
          let rows = first.rows;
          let sent = 0;
          for (let page = 1; rows.length && sent < count; ) {
            const take = rows.slice(0, count - sent);
            controller.enqueue(encoder.encode(`${take.map(line).join("\r\n")}\r\n`));
            sent += take.length;
            if (sent >= count || rows.length < BATCH) break;
            page += 1;
            rows = (await exploreLeads(criteria, { page, perPage: BATCH })).rows;
          }
          controller.close();
        } catch (err) {
          console.error("[explore/export]", err?.message ?? err);
          controller.error(err);
        }
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lighthouse-leads-${stamp}.csv"`,
        "X-Total-Count": String(total),
        "X-Exported-Count": String(count),
        // Set when the question matched more leads than one export holds; the page says so beside the button.
        ...(total > count ? { "X-Truncated": "true" } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[explore/export]", err?.message ?? err);
    return new Response("Export failed. Try again.", { status: 502 });
  }
}
