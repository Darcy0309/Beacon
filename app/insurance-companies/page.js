import { Building2, Target, MapPin, Star } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/filter-table";
import { getInsuranceCompanies } from "@/lib/queries";
import { deleteAgency } from "@/lib/actions";

export const dynamic = "force-dynamic";

const statusTone = { Preferred: "amber", Active: "emerald" };

export default async function InsuranceCompaniesPage() {
  const carriers = await getInsuranceCompanies();
  const totalXdates = carriers.reduce((s, c) => s + c.xdates, 0);
  const preferred = carriers.filter((c) => c.status === "Preferred").length;
  const states = new Set();
  const maxStates = Math.max(0, ...carriers.map((c) => c.states));

  const tiles = [
    { label: "Carriers", value: String(carriers.length), note: "on file",
      icon: Building2, accent: "var(--neon-cyan)", series: carriers.map((c) => c.xdates), bars: true },
    { label: "Active X-Dates", value: totalXdates.toLocaleString(), note: "renewals tracked",
      icon: Target, accent: "var(--neon-amber)", series: carriers.map((c) => c.xdates) },
    { label: "Preferred", value: String(preferred), note: "high-volume carriers",
      icon: Star, accent: "var(--neon-violet)", series: carriers.map((c) => (c.status === "Preferred" ? 1 : 0)), bars: true },
    { label: "Widest Footprint", value: String(maxStates), note: "states for a single carrier",
      icon: MapPin, accent: "var(--neon-emerald)", series: carriers.map((c) => c.states), bars: true },
  ];

  return (
    <>
      <Topbar title="Insurance Companies" sub={`${carriers.length} carriers · ${totalXdates} X-dates on book`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Carriers" icon={Building2} />
          <FilterTable
            columns={["Carrier", "Association", "States", "Active X-dates", "Status", { label: "Action", className: "text-right" }]}
            filters={[
              { key: "status", label: "Status" },
              { key: "lines", label: "Association", kind: "select" },
            ]}
            placeholder="Search carriers…"
            empty="No carriers on file."
            rows={carriers.map((c) => ({
              id: c.id,
              search: `${c.name} ${c.lines} ${c.status}`,
              facets: { status: c.status, lines: c.lines },
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: c.color }}>{c.initials}</span>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.lines}</TableCell>
                  <TableCell className="tabular-nums">{c.states}</TableCell>
                  <TableCell className="font-semibold tabular-nums text-primary">{c.xdates}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[c.status] ?? "slate"}>{c.status}</ToneBadge></TableCell>
                  <TableCell className="text-right"><RowActions name={c.name} id={c.id} onDelete={deleteAgency} /></TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
