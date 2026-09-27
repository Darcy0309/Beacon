import Link from "next/link";
import { Database, Users, CalendarClock, Building2, Download, ListChecks, Map, PieChart } from "lucide-react";
import Topbar from "@/components/topbar";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import MetricBar from "@/components/metric-bar";
import StatusBadge from "@/components/status-badge";
import FilterTable from "@/components/filter-table";
import ExploreCriteria from "@/components/explore-criteria";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { exploreLeads, getExploreOptions } from "@/lib/queries";
import { readListParams, pageInfo } from "@/lib/paging";
import { readCriteria, criteriaToParams, describe, isEmpty } from "@/lib/explore";

export const dynamic = "force-dynamic";

const BAR_COLORS = [
  "var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)",
  "var(--neon-violet)", "var(--neon-magenta)", "var(--neon-blue)", "var(--neon-rose)",
];

/** One breakdown panel: the counts that answer a slice of the question. */
function Breakdown({ label, icon, rows, empty = "Nothing to show." }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.count)));
  return (
    <Card>
      <SectionHeader label={label} icon={icon} />
      <div className="space-y-2 p-4">
        {rows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p> : null}
        {rows.slice(0, 8).map((r, i) => (
          <MetricBar
            key={`${r.label}-${i}`}
            label={r.label}
            value={Number(r.count)}
            max={max}
            color={BAR_COLORS[i % BAR_COLORS.length]}
          />
        ))}
        {rows.length > 8 ? (
          <p className="pt-1 text-center text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            + {rows.length - 8} more
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export default async function ExplorePage({ searchParams }) {
  const sp = await searchParams;
  const criteria = readCriteria(sp);
  const { page, perPage, q } = readListParams(sp);
  const [options, result] = await Promise.all([getExploreOptions(), exploreLeads(criteria, { page, perPage })]);

  const { total, rows, byClient, byState, byMonth, byIndustry, byStatus, clientsTouched, withXdate } = result;
  const summary = describe(criteria, options);
  const exportHref = `/api/explore/export?${criteriaToParams(criteria).toString()}`;

  const tiles = [
    { label: "Matching Leads", value: total.toLocaleString(), note: isEmpty(criteria) ? "the whole book" : "match these criteria",
      icon: Database, accent: "var(--neon-cyan)", series: byMonth.map((m) => Number(m.count)), bars: true },
    { label: "Client Accounts", value: String(clientsTouched), note: "hold these leads",
      icon: Users, accent: "var(--neon-emerald)", series: byClient.map((c) => Number(c.count)), bars: true },
    { label: "With a Renewal Date", value: withXdate.toLocaleString(),
      note: total ? `${Math.round((withXdate / total) * 100)}% of matches` : "no matches",
      icon: CalendarClock, accent: "var(--neon-amber)", series: byMonth.map((m) => Number(m.count)) },
    { label: "Industries", value: String(byIndustry.length), note: byIndustry[0]?.label ?? "—",
      icon: Building2, accent: "var(--neon-violet)", series: byIndustry.map((i) => Number(i.count)), bars: true },
  ];

  return (
    <>
      <Topbar title="Lead Explorer" sub={`${total.toLocaleString()} lead${total === 1 ? "" : "s"} · ${summary}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {/* overflow-visible and a raised z-index so the criteria pickers can open over the tiles below. */}
        <Card accent="var(--neon-cyan)" className="z-20 overflow-visible">
          <SectionHeader
            label="Ask the database"
            icon={Database}
            action={
              total > 0 ? (
                <Link
                  href={exportHref}
                  prefetch={false}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Download className="size-3.5" /> Export CSV
                </Link>
              ) : null
            }
          />
          <ExploreCriteria options={options} criteria={criteria} />
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Breakdown label="Leads by Client" icon={Users} rows={byClient} empty="No leads match." />
          <Breakdown label="By Renewal Month" icon={CalendarClock} rows={byMonth} empty="No renewal dates on these leads." />
          <Breakdown label="By State" icon={Map} rows={byState} empty="No leads match." />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Breakdown label="By Industry" icon={Building2} rows={byIndustry} empty="No leads match." />
          <Breakdown label="By Status" icon={PieChart} rows={byStatus} empty="No leads match." />
        </div>

        <Card>
          <SectionHeader label="Matching Leads" icon={ListChecks} />
          <FilterTable
            columns={["Company", "Contact", "Phone", "Client", "Status", "Renewal", "Assigned"]}
            placeholder="Search within these results…"
            empty="No leads match these criteria."
            query={q}
            selected={{}}
            paging={pageInfo(total, page, perPage)}
            rows={rows.map((l) => ({
              id: l.id,
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: l.color }}>{l.initials}</span>
                      <div>
                        <Link href={`/leads/${l.id}`} className="font-medium transition-colors hover:text-primary">{l.co}</Link>
                        <div className="text-xs text-muted-foreground">{l.place}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{l.contact}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {l.phone ? <a href={`tel:${String(l.phone).replace(/[^\d+]/g, "")}`} className="transition-colors hover:text-primary">{l.phone}</a> : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.client}</TableCell>
                  <TableCell><StatusBadge status={{ code: l.status_code, name: l.status_name }} /></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                  <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
