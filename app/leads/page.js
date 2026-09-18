import Topbar from "@/components/topbar";
import LeadsView from "@/components/leads-view";
import { getLeads, getLeadCounts, getLookups } from "@/lib/queries";

export const dynamic = "force-dynamic";

const LIMIT = 500;

export default async function LeadsPage() {
  const [leads, options] = await Promise.all([getLeads({ limit: LIMIT }), getLookups()]);

  // The rows on hand answer the totals unless the list hit the cap, in which
  // case ask the database for the true count.
  let total = leads.length;
  let counts = {};
  if (leads.length >= LIMIT) {
    ({ total, counts } = await getLeadCounts());
  } else {
    for (const l of leads) counts[l.status] = (counts[l.status] || 0) + 1;
  }

  const clientCount = new Set(
    leads.map((l) => l.raw.project?.company?.id).filter(Boolean)
  ).size;

  // The table only renders the summary fields; keep the full record out of
  // the payload sent to the browser.
  const rows = leads.map(({ raw, ...l }) => l);

  return (
    <>
      <Topbar
        title="Leads"
        sub={`${total} active leads across ${clientCount} client${clientCount === 1 ? "" : "s"}`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <LeadsView leads={rows} options={options} counts={counts} total={total} />
      </div>
    </>
  );
}
