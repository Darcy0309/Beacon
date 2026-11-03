import { Building2 } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import EditName from "@/components/shared/edit-name";
import ToneBadge from "@/components/shared/tone-badge";
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

export const dynamic = "force-dynamic";

const statusTone = { Preferred: "amber", Active: "emerald" };
// A carrier's states written out, up to this many; the rest as "+N".
const STATES_SHOWN = 6;

/**
 * The carriers (Sean, Nov 2026: under Data & Insights, without the tiles): searched by name and
 * filtered by state, each with the states its leads are in (from the carrier fields on our leads),
 * its leads (X-dates) there and the clients they're for; those with leads first, A to Z.
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
            columns={["Carrier", "Association", "States", "X-Dates", "Clients", "Status", { label: "Action", className: "text-right" }]}
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
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: c.color }}>{c.initials}</span>
                      <EditName name={c.name} edit={<CarrierForm carrier={c} />} data-carrier-link />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.lines}</TableCell>
                  <TableCell data-carrier-states title={c.stateCodes.join(", ") || undefined}>
                    <span className="font-semibold tabular-nums">{c.states}</span>
                    {c.states ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.stateCodes.slice(0, STATES_SHOWN).join(" · ")}{c.states > STATES_SHOWN ? ` +${c.states - STATES_SHOWN}` : ""}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums text-primary" data-carrier-xdates>{c.xdates.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums" data-carrier-clients>{c.clients.toLocaleString()}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[c.status] ?? "slate"}>{c.status}</ToneBadge></TableCell>
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
