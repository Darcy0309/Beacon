import Topbar from "@/components/topbar";
import LeadsView from "@/components/leads-view";
import { getLeads, getLookups, getLeadStatusCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, options, agg] = await Promise.all([
    getLeads(),
    getLookups(),
    getLeadStatusCounts(),
  ]);

  const clientCount = new Set(
    leads.map((l) => l.project?.company?.id).filter(Boolean)
  ).size;

  return (
    <>
      <Topbar
        title="Leads"
        sub={`${agg.total} leads across ${clientCount} client${clientCount === 1 ? "" : "s"}`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <LeadsView leads={leads} options={options} counts={agg.counts} total={agg.total} />
      </div>
    </>
  );
}
