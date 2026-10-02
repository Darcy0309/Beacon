import Link from "@/components/shared/intent-link";
import { CalendarSearch, ListChecks, X } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import ParamSelect from "@/components/shared/param-select";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import XdateMonths from "@/features/reports/components/xdate-months";
import { getXdateMonthLeads, getXdatesByMonth, MONTHS, XDATE_BUCKETS } from "@/features/reports/queries";
import { getLookups } from "@/lib/server/lookups";
import { getBusinessToday } from "@/lib/server/business-day";
import { pageInfo, readListParams } from "@/lib/paging";
import { mediumDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const idParam = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);

/**
 * X-dates by month: for the whole book, one client or one project, how many
 * names renew in each month of the year, split into appointments, names
 * taken off the list, and viable names still to work. Every number opens
 * the names behind it, underneath.
 */
export default async function XdatesReport({ searchParams }) {
  const sp = await searchParams;
  const companyId = idParam(sp?.client);
  const projectId = idParam(sp?.project);
  const month = /^(0|[1-9]|1[0-2])$/.test(sp?.month ?? "") ? Number(sp.month) : null;
  const bucket = XDATE_BUCKETS[sp?.bucket] ? sp.bucket : null;
  const list = readListParams(sp);

  const [options, data, names, today] = await Promise.all([
    getLookups(),
    getXdatesByMonth({ projectId, companyId }),
    month === null ? null : getXdateMonthLeads({ month, bucket, projectId, companyId, page: list.page, perPage: list.perPage }),
    getBusinessToday(),
  ]);

  const client = options.companies.find((c) => c.id === companyId);
  const projects = options.projects.filter((p) => !companyId || p.company_id === companyId);
  const project = options.projects.find((p) => p.id === projectId);
  const scope = project?.name ?? client?.name ?? "The whole book";

  // Links keep the client and project, and open one month's names.
  const scoped = () => {
    const p = new URLSearchParams();
    if (companyId) p.set("client", String(companyId));
    if (projectId) p.set("project", String(projectId));
    return p;
  };
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
        <Card>
          <SectionHeader label="Renewals by Month" icon={CalendarSearch} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--panel-border)] px-5 py-3">
            <ParamSelect name="client" label="Client" value={companyId ? String(companyId) : ""} placeholder="All clients"
              clears={["page", "month", "bucket", "project"]}
              options={options.companies.map((c) => ({ value: String(c.id), label: c.name }))} />
            <ParamSelect name="project" label="Project" value={projectId ? String(projectId) : ""} placeholder="All projects"
              clears={["page", "month", "bucket"]}
              options={projects.map((p) => ({ value: String(p.id), label: p.name }))} />
          </div>
          <div className="p-5">
            <XdateMonths data={data} href={href} today={today} selected={month === null ? null : { month, bucket }} />
          </div>
        </Card>

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
