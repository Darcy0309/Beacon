import Link from "@/components/shared/intent-link";
import { Database, Users, CalendarClock, Building2, Download, ListChecks, Map, PieChart } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import MetricBar from "@/components/shared/metric-bar";
import StatusBadge from "@/components/shared/status-badge";
import FilterTable from "@/components/shared/filter-table";
import ExploreCriteria from "@/features/explore/components/explore-criteria";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { exploreLeads, getExploreOptions } from "@/features/explore/queries";
import { readListParams, pageInfo } from "@/lib/paging";
import { readCriteria, criteriaToParams, describe, isEmpty, EXPORT_LIMIT } from "@/features/explore/criteria";

export const dynamic = "force-dynamic";

const BAR_COLORS = [
  "var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)",
  "var(--neon-violet)", "var(--neon-magenta)", "var(--neon-blue)", "var(--neon-rose)",
];

/**
 * One breakdown panel: the counts that answer a slice of the question. The
 * first `shown` rows are always visible and the rest open beneath them, so
 * no count is ever hidden behind "+ N more".
 */
function Breakdown({ label, icon, rows, shown = 8, empty = "Nothing to show." }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.count)));
  const bar = (r, i) => (
    <MetricBar key={`${r.label}-${i}`} label={r.label} value={Number(r.count)} max={max} color={BAR_COLORS[i % BAR_COLORS.length]} />
  );
  const rest = rows.slice(shown);
  return (
    <Card>
      <SectionHeader label={label} icon={icon} />
      <div className="space-y-2 p-4" data-breakdown={label}>
        {rows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p> : null}
        {rows.slice(0, shown).map(bar)}
        {rest.length ? (
          <details className="group">
            <summary className="cursor-pointer list-none pt-1 text-center text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show {rest.length} more</span>
              <span className="hidden group-open:inline">Show fewer</span>
            </summary>
            <div className="mt-2 space-y-2">{rest.map((r, i) => bar(r, i + shown))}</div>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

export default async function ExplorePage({ searchParams }) {
  const sp = await searchParams;
  const criteria = readCriteria(sp);
  const { page, perPage, q } = readListParams(sp);
  const [options, firstTry] = await Promise.all([getExploreOptions(), exploreLeads(criteria, { page, perPage })]);
  let result = firstTry;
  // A page past the end (an old link, or criteria that now match fewer): show page 1.
  let shownPage = page;
  if (result.rows.length === 0 && result.total > 0 && page > 1) {
    result = await exploreLeads(criteria, { page: 1, perPage });
    shownPage = 1;
  }

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
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {total > EXPORT_LIMIT ? (
                    <span data-export-cap className="text-right text-[0.7rem] text-amber-600 dark:text-amber-400">
                      Exports the first {EXPORT_LIMIT.toLocaleString()} of {total.toLocaleString()}. Narrow the criteria for the rest.
                    </span>
                  ) : null}
                  {/* A plain download link: a router Link would fetch the export as a page as well. */}
                  <a
                    href={exportHref}
                    download
                    title={total > EXPORT_LIMIT ? `Exports the first ${EXPORT_LIMIT.toLocaleString()} of ${total.toLocaleString()} leads` : undefined}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Download className="size-3.5" /> Export CSV
                  </a>
                </div>
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
          <Breakdown label="By Renewal Month" icon={CalendarClock} rows={byMonth} shown={12} empty="No renewal dates on these leads." />
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
            paging={pageInfo(total, shownPage, perPage)}
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
                    {l.phone ? <a href={`tel:${String(l.phone).replace(/[^\d+]/g, "")}`} data-lead-id={l.id} className="transition-colors hover:text-primary">{l.phone}</a> : "—"}
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
