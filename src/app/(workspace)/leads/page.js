import { Plus, ListChecks } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ResultBadge from "@/components/shared/result-badge";
import RowActions from "@/components/shared/row-actions";
import LeadForm from "@/features/leads/components/lead-form";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { listLeads, getLeadCounts } from "@/features/leads/queries";
import { getLookups } from "@/lib/server/lookups";
import { readListParams, pageInfo } from "@/lib/paging";
import { getCallResults } from "@/features/work/queries";
import { deleteLead } from "@/features/leads/actions";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }) {
  const params = readListParams(await searchParams, ["result"]);
  if (params.filters.result && !/^[1-9]\d{0,17}$/.test(params.filters.result)) delete params.filters.result;
  const [{ rows, total }, summary, options, results] = await Promise.all([listLeads(params), getLeadCounts(), getLookups(), getCallResults()]);
  // Filtered by call result, each stage's results under its name.
  const resultOptions = results.map((r) => ({ value: String(r.id), label: `${r.name} (${r.project_type === "APPT" ? "Appt" : "DB dev"})` }));

  return (
    <>
      <Topbar
        title="Leads"
        sub={`${summary.total.toLocaleString()} lead${summary.total === 1 ? "" : "s"} across ${summary.clients} client${summary.clients === 1 ? "" : "s"}`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <SectionHeader
            label="All leads"
            icon={ListChecks}
            action={<LeadForm options={options} trigger={<Button size="sm"><Plus /> New lead</Button>} />}
          />
          <FilterTable
            columns={["Company", "Contact", "Phone", "Call result", "X-Date", "Assigned", { label: "Action", className: "text-right" }]}
            filters={[{ key: "result", label: "Call result", kind: "select", options: resultOptions }]}
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
                  <TableCell><ResultBadge result={l.result} /></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                  <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      name={l.co}
                      href={`/leads/${l.id}`}
                      id={l.id}
                      edit={<LeadForm lead={l.raw} options={options} />}
                      onDelete={deleteLead}
                      warning="It comes off every list, call list, calendar and count, with its appointments. Nothing is erased: its call history, coverage and notes are kept, and an administrator can restore it under Settings › Deleted records."
                    />
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
