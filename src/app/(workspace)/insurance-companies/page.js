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

export const dynamic = "force-dynamic";


/**
 * The carriers (Sean, Nov 2026: under Data & Insights, without the tiles): searched by name and
 * filtered by state, each with how many states its leads are in (clicked, which), its leads (X-dates)
 * there (from the carrier fields on our leads) and the clients with it among their Top Carriers;
 * those with leads first, A to Z. A carrier's name opens its report; its menu edits or deletes it.
 */
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
            columns={["Carrier", "States", "X-Dates", "Clients", { label: "Action", className: "text-right" }]}
            filters={[
              { key: "states", label: "State", kind: "multi", all: "All states", options: US_STATES.map((s) => ({ value: s, label: s })) },
            ]}
            placeholder="Search carriers…"
            empty={states.length ? "No carrier has leads in these states." : "No carriers on file."}
            query={params.q}
            selected={states.length ? { states: states.join(",") } : {}}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((c) => ({
              id: c.id,
              node: (
                <TableRow data-carrier-row={c.id}>
                  <TableCell>
                    <Link href={`/insurance-companies/${c.id}${states.length ? `?states=${states.join(",")}` : ""}`} className="group flex items-center gap-3" data-carrier-link>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: c.color }}>{c.initials}</span>
                      <span className="font-medium transition-colors group-hover:text-primary" data-carrier-name>{c.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell data-carrier-states><CarrierStates name={c.name} byState={c.byState} /></TableCell>
                  <TableCell className="font-semibold tabular-nums text-primary" data-carrier-xdates>{c.xdates.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums" data-carrier-clients>{c.clients.toLocaleString()}</TableCell>
                  <TableCell className="text-right"><RowActions name={c.name} id={c.id} edit={<CarrierForm carrier={c} />} onDelete={deleteAgency} /></TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
