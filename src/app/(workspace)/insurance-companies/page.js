import { Building2 } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import Link from "@/components/shared/intent-link";
import RowActions from "@/components/shared/row-actions";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/shared/filter-table";
import { listInsuranceCompanies } from "@/features/insurance/queries";
import { readListParams, pageInfo } from "@/lib/paging";
import { US_STATES } from "@/lib/project-info";
import { deleteAgency } from "@/features/insurance/actions";
import CarrierImport from "@/features/insurance/components/carrier-import";
import CarrierForm from "@/features/insurance/components/carrier-form";
import CarrierStates from "@/features/insurance/components/carrier-states";
import { FIGURE_CELL } from "@/features/insurance/figure-cell";

export const dynamic = "force-dynamic";


/**
 * The carriers (Sean, Nov 2026: under Data & Insights, without the tiles): searched by name and
 * filtered by state, each with how many states its leads are in (clicked, which), its leads (X-dates)
 * there (from the carrier fields on our leads) and the clients with it among their Top Carriers;
 * those with leads first, A to Z. A carrier's name opens its report; its menu edits or deletes it.
 */
/** A figure filling its cell: a link to the carrier's report with a hover that says so, or a plain 0. */
function Figure({ n, href, label }) {
  if (!n) return <span className="block px-4 py-3.5 text-center tabular-nums text-muted-foreground">0</span>;
  return (
    <Link href={href} aria-label={label} className={FIGURE_CELL}>{n.toLocaleString()}</Link>
  );
}

export default async function InsuranceCompaniesPage({ searchParams }) {
  const params = readListParams(await searchParams, ["states"]);
  const { rows, total, carriers, withLeads, states } = await listInsuranceCompanies(params);

  return (
    <>
      <Topbar title="Insurance Companies" sub={`${carriers} carriers · ${withLeads} with leads`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <SectionHeader label="Carriers" icon={Building2} action={<div className="flex flex-wrap gap-2"><CarrierImport /><CarrierForm /></div>} />
          <FilterTable
            columns={["Carrier", { label: "States", className: "text-center" }, { label: "X-Dates", className: "text-center" }, { label: "Clients", className: "text-center" }, { label: "Action", className: "text-right" }]}
            filters={[
              { key: "states", label: "State", kind: "multi", all: "All states", options: US_STATES.map((s) => ({ value: s, label: s })) },
            ]}
            placeholder="Search carriers…"
            empty={states.length ? "No carrier has leads in these states." : "No carriers on file."}
            query={params.q}
            selected={states.length ? { states: states.join(",") } : {}}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((c) => {
              const report = `/insurance-companies/${c.id}${states.length ? `?states=${states.join(",")}` : ""}`;
              return {
              id: c.id,
              node: (
                <TableRow data-carrier-row={c.id}>
                  <TableCell>
                    <Link href={report} className="group flex items-center gap-3" data-carrier-link>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: c.color }}>{c.initials}</span>
                      <span className="font-medium transition-colors group-hover:text-primary" data-carrier-name>{c.name}</span>
                    </Link>
                  </TableCell>
                  {/* Each figure its whole cell, centred: the states open their list, the X-dates and clients the carrier's report. */}
                  <TableCell className="p-0" data-carrier-states><CarrierStates name={c.name} byState={c.byState} /></TableCell>
                  <TableCell className="p-0" data-carrier-xdates><Figure n={c.xdates} href={report} label={`${c.name}: ${c.xdates} X-dates, open its report`} /></TableCell>
                  <TableCell className="p-0" data-carrier-clients><Figure n={c.clients} href={report} label={`${c.name}: ${c.clients} clients, open its report`} /></TableCell>
                  <TableCell className="text-right"><RowActions name={c.name} id={c.id} edit={<CarrierForm carrier={c} />} onDelete={deleteAgency} /></TableCell>
                </TableRow>
              ),
              };
            })}
          />
        </Card>
      </div>
    </>
  );
}
