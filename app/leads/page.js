import { Plus, ListChecks } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import RowActions from "@/components/row-actions";
import LeadForm from "@/components/lead-form";
import SectionHeader from "@/components/section-header";
import FilterTable from "@/components/filter-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { listLeads, getLeadCounts, getLookups } from "@/lib/queries";
import { readListParams, pageInfo } from "@/lib/paging";
import { deleteLead } from "@/lib/actions";

export const dynamic = "force-dynamic";

// Chip labels for the status facet, shorter than the full status names.
const CHIP_LABEL = { appt: "Phone appt", survey: "Survey", hot: "Hot leads", xdate: "X-date", profile: "Profile", new: "New" };

export default async function LeadsPage({ searchParams }) {
  const params = readListParams(await searchParams, ["status"]);
  const [{ rows, total }, summary, options] = await Promise.all([listLeads(params), getLeadCounts(), getLookups()]);

  const statusOptions = options.statuses.map((s) => ({
    value: s.code,
    label: CHIP_LABEL[s.code] ?? s.name,
    count: summary.counts[s.code] ?? 0,
  }));

  return (
    <>
      <Topbar
        title="Leads"
        sub={`${summary.total} active leads across ${summary.clients} client${summary.clients === 1 ? "" : "s"}`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <SectionHeader
            label="All leads"
            icon={ListChecks}
            action={<LeadForm options={options} trigger={<Button size="sm"><Plus /> New lead</Button>} />}
          />
          <FilterTable
            columns={["Company", "Contact", "Phone", "Status", "X-Date", "Assigned", { label: "Action", className: "text-right" }]}
            filters={[{ key: "status", label: "Status", kind: "chips", options: statusOptions }]}
            placeholder="Search leads…"
            empty="No leads yet."
            query={params.q}
            selected={params.filters}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((l) => ({
              id: l.id,
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: l.color }}>{l.initials}</span>
                      <div>
                        <div className="font-medium">{l.co}</div>
                        <div className="text-xs text-muted-foreground">{l.city}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{l.contact}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.phone}</TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                  <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                  <TableCell className="text-right">
                    <RowActions name={l.co} href={`/leads/${l.id}`} id={l.id} onDelete={deleteLead} />
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
