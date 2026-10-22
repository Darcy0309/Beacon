import Link from "@/components/shared/intent-link";
import { ArrowLeft, CalendarSearch, Gauge, ListChecks, X } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import XdateMonths from "@/features/reports/components/xdate-months";
import { getPipelineManagers, getPipelineReport, getXdateMonthLeadsFiltered, getXdatesFiltered, MONTHS, XDATE_BUCKETS } from "@/features/reports/queries";
import PipelineReport from "@/features/reports/components/pipeline-report";
import XdateFilterBar from "@/features/reports/components/xdate-filter-bar";
import { getSalesReps } from "@/features/users/queries";
import { filterParams, pipelineMonths, readXdateFilters } from "@/lib/pipeline";
import { getLookups } from "@/lib/server/lookups";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { pageInfo, readListParams } from "@/lib/paging";
import { mediumDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * X-dates by month: for the whole book, one client or one project, how many
 * names renew in each month of the year, split into appointments, names
 * taken off the list, and viable names still to work. Every number opens
 * the names behind it, underneath.
 */
export default async function XdatesReport({ searchParams }) {
  const sp = await searchParams;
  // A client's people come here from their own project's month bars (Sean, Oct 2026): Row Level Security
  // keeps it to their projects; the client, Sales Rep and manager pickers, and the Pipeline Report, are ours.
  const me = await getCurrentUser();
  const isClient = me?.role === "client";
  const read = readXdateFilters(sp);
  const filters = isClient ? { ...read, companyId: null, repId: null, userIds: [] } : read;
  const month = /^(0|[1-9]|1[0-2])$/.test(sp?.month ?? "") ? Number(sp.month) : null;
  const bucket = XDATE_BUCKETS[sp?.bucket] ? sp.bucket : null;
  const list = readListParams(sp);

  const todayP = getBusinessToday();
  const [options, data, names, today, tz, reps, managers, pipeline] = await Promise.all([
    getLookups(),
    getXdatesFiltered(filters),
    month === null ? null : getXdateMonthLeadsFiltered({ month, bucket, filters, page: list.page, perPage: list.perPage }),
    todayP,
    getBusinessTimeZone(),
    isClient ? [] : getSalesReps(),
    isClient ? [] : getPipelineManagers(),
    // The Pipeline Report (Sean, Oct 2026): the filtered names by project and manager, for the months picked (the next three to begin with).
    isClient ? null : Promise.all([todayP, getBusinessTimeZone()]).then(([t, zone]) => {
      const months = pipelineMonths(filters.months, t);
      return getPipelineReport({ filters, months, timeZone: zone }).then((rows) => ({ rows, months }));
    }),
  ]);

  const client = options.companies.find((c) => c.id === filters.companyId);
  const chosen = options.projects.filter((p) => filters.projectIds.includes(p.id));
  const project = chosen.length === 1 ? chosen[0] : null;
  const scope = project?.name ?? (chosen.length > 1 ? `${chosen.length} projects` : null) ?? client?.name
    ?? (isClient ? me?.company?.name ?? "Your projects" : "The whole book");

  // Links keep the filters, and open one month's names.
  const scoped = () => filterParams(filters);
  const href = (m, b) => {
    const p = scoped();
    p.set("month", String(m));
    if (b) p.set("bucket", b);
    return `/reports/x-dates?${p}#names`;
  };
  const closeHref = `/reports/x-dates${scoped().size ? `?${scoped()}` : ""}`;

  const row = month === null ? null : month === 0 ? data.undated : data.months[month - 1];

  return (
    <>
      <Topbar title="X-Dates by Month" sub={scope} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {/* Opened from a project (its X-Dates by Month, a month's bar): back to it (Sean, Oct 2026). */}
        {project ? (
          <Link href={`/projects/${project.id}`} data-back-to-project
            className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
            <ArrowLeft className="size-3.5" /> Back to project
          </Link>
        ) : null}
        <Card>
          <SectionHeader label="Renewals by Month" icon={CalendarSearch} />
          <XdateFilterBar filters={filters} showClient={!isClient} showManagers={!isClient}
            options={{ companies: options.companies, projects: options.projects, reps, managers }} />
          <div className="p-5">
            <XdateMonths data={data} href={href} today={today} selected={month === null ? null : { month, bucket }} only={filters.months} />
          </div>
        </Card>

        {pipeline ? (
          <Card id="pipeline" className="scroll-mt-24">
            <SectionHeader label="Pipeline Report" icon={Gauge} />
            <PipelineReport rows={pipeline.rows} months={pipeline.months} today={today} linkTo="project"
              fileName={`PipelineReport_${today}.csv`} />
          </Card>
        ) : null}

        {names ? (
          <Card id="names" className="scroll-mt-24">
            <SectionHeader
              label={`${month ? `Renewing in ${MONTHS[month - 1]}` : "No renewal date"} · ${bucket ? XDATE_BUCKETS[bucket] : "All names"}`}
              icon={ListChecks}
              action={
                <Link href={closeHref} scroll={false} className="flex items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75">
                  <X className="size-3" /> Close
                </Link>
              }
            />
            <div className="flex flex-wrap gap-2 border-b border-[var(--panel-border)] px-5 py-3">
              {[[null, "All", row.total], ...Object.entries(XDATE_BUCKETS).map(([key, label]) => [key, label, row[key]])].map(([key, label, n]) => (
                <Link
                  key={label}
                  href={href(month, key)}
                  scroll={false}
                  aria-current={bucket === key ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    bucket === key ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {label} <span className="tabular-nums opacity-70">{n.toLocaleString()}</span>
                </Link>
              ))}
            </div>
            <FilterTable
              searchable={false}
              columns={["Company", "Contact", "Phone", "Renewal", "Project", "Result", "Rep"]}
              empty="No names here."
              paging={pageInfo(names.total, list.page, list.perPage)}
              rows={names.rows.map((l) => ({
                id: l.id,
                node: (
                  <TableRow>
                    <TableCell>
                      <Link href={`/leads/${l.id}`} className="font-medium transition-colors hover:text-primary">{l.company}</Link>
                      <div className="text-xs text-muted-foreground">{l.place}</div>
                    </TableCell>
                    <TableCell>{l.contact}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{l.phone}</TableCell>
                    <TableCell className="tabular-nums">{l.renewal ? mediumDate(l.renewal) : "—"}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground" title={l.project}>{l.project}</TableCell>
                    <TableCell>{l.result}</TableCell>
                    <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
