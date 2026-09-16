import Topbar from "@/components/topbar";
import LeadsView from "@/components/leads-view";
import { getLeads, getLeadCounts, getLookups } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, { total, counts }, options] = await Promise.all([
    getLeads(),
    getLeadCounts(),
    getLookups(),
  ]);

  const clientCount = new Set(
    leads.map((l) => l.raw.project?.company?.id).filter(Boolean)
  ).size;

  return (
    <>
      <Topbar
        title="Leads"
        sub={`${total} active leads across ${clientCount} client${clientCount === 1 ? "" : "s"}`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <LeadsView leads={leads} options={options} counts={counts} total={total} />
      </div>
    </>
  );
}
