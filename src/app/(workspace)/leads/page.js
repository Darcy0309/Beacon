import { Plus, ListChecks } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import Link from "@/components/shared/intent-link";
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
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { getAppointmentFilters } from "@/features/appointments/queries";
import { appointmentSpan } from "@/lib/appointment-links";
import { addDays, daysBetween, formatRange, isIsoDate } from "@/lib/dates";
import { leadHref, listAddress } from "@/lib/back-link";
import { getBusinessTimeZone } from "@/lib/server/business-day";
import { orderResults } from "@/lib/result-order";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }) {
  const sp = await searchParams;
  // Filtered as the Appointments list is (Sean, Oct 2026): call result and manager (the table's), then
  // client, project and the days a lead was last called or changed.
  const params = readListParams(sp, ["result", "rep"]);
  const id = (v) => (typeof v === "string" && /^[1-9]\d{0,17}$/.test(v) ? v : "");
  if (params.filters.rep && !id(params.filters.rep)) delete params.filters.rep;
  // Call results: several at once ("23,24,25"; Sean, Oct 2026), filtered apart from the table's one-value facets.
  const resultIds = [...new Set(String(params.filters.result ?? "").split(",").filter(id))].slice(0, 60);
  delete params.filters.result;
  const chosen = { client: id(sp?.client), project: id(sp?.project) };
  const timeZone = await getBusinessTimeZone();
  let range = null;
  if (isIsoDate(sp?.from) || isIsoDate(sp?.to)) {
    let from = isIsoDate(sp?.from) ? sp.from : sp.to;
    let to = isIsoDate(sp?.to) ? sp.to : from;
    if (to < from) [from, to] = [to, from];
    if (daysBetween(from, to) > 366) to = addDays(from, 366);
    // The business's days, as instants: from the first day's midnight to the midnight after the last.
    range = { from, to, worked: { from: appointmentSpan(from, "12:00 AM", 0, timeZone).start, to: appointmentSpan(addDays(to, 1), "12:00 AM", 0, timeZone).start } };
  }
  const [{ rows, total }, summary, options, results, filters] = await Promise.all([
    listLeads(params, { projectId: chosen.project || undefined, clientId: chosen.client || null, worked: range?.worked ?? null, resultIds }),
    getLeadCounts(), getLookups(), getCallResults(), getAppointmentFilters(),
  ]);
  const projectOptions = chosen.client ? filters.projects.filter((p) => String(p.clientId) === chosen.client) : filters.projects;
  const managerOptions = filters.managers;
  const filtered = Boolean(range || chosen.client || chosen.project || params.filters.rep || resultIds.length || params.q);
  // This list's address, for each lead's back link; and what the date filter's form carries along.
  const here = listAddress("/leads", sp);
  const kept = Object.entries(sp ?? {}).filter(([k, v]) => !["from", "to", "page"].includes(k) && typeof v === "string");
  // The day a lead was last called or changed, on the business's clock.
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "2-digit", day: "2-digit", year: "numeric" });
  const lastWorked = (raw) => {
    const at = [raw?.date_last_worked, raw?.updated_at].filter(Boolean).map((v) => Date.parse(v)).sort((a, b) => b - a)[0];
    return at ? day.format(new Date(at)) : "—";
  };
  // Filtered by call result, several at once, in the order Sean's sheet lists them, each stage's under its name.
  const resultOptions = orderResults(results).map((r) => ({
    value: String(r.id), label: `${r.name} (${r.project_type === "APPT" ? "Appt" : "DB dev"})`,
    group: r.project_type === "APPT" ? "Appointment setting" : "DB dev",
  }));

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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3" data-lead-filters>
            <form action="/leads" className="inline-flex items-center gap-2">
              {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Last worked</span>
              <DateRangePicker key={`${range?.from}:${range?.to}`} defaultFrom={range?.from} defaultTo={range?.to} max="today" active={Boolean(range)} />
            </form>
            <ParamSelect name="client" label="Client" placeholder="All clients" value={chosen.client} options={filters.clients} clears={["project", "page"]} />
            <ParamSelect name="project" label="Project" placeholder="All projects" value={chosen.project} options={projectOptions} />
            <ParamSelect name="rep" label="Manager" placeholder="Everyone" value={params.filters.rep ?? ""} options={managerOptions} />
            {filtered ? (
              <Link href="/leads" className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline" data-clear-filters>Clear</Link>
            ) : null}
            {range ? <span className="ml-auto text-xs tabular-nums text-muted-foreground">Worked {formatRange(range.from, range.to)}</span> : null}
          </div>
          <FilterTable
            columns={["Company", "Contact", "Phone", "Call result", "Last worked", "X-Date", "Assigned", { label: "Action", className: "text-right" }]}
            filters={[{ key: "result", label: "Call result", kind: "multi", options: resultOptions }]}
            placeholder="Search leads…"
            empty={filtered ? "No leads match these filters." : "No leads yet."}
            query={params.q}
            selected={{ ...params.filters, ...(resultIds.length ? { result: resultIds.join(",") } : {}) }}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((l) => ({
              id: l.id,
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: l.color }}>{l.initials}</span>
                      <div>
                        <Link href={leadHref(l.id, here)} className="font-medium transition-colors hover:text-primary hover:underline" data-lead-link>{l.co}</Link>
                        <div className="text-xs text-muted-foreground">{l.city}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{l.contact}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.phone}</TableCell>
                  <TableCell><ResultBadge result={l.result} /></TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground" data-last-worked>{lastWorked(l.raw)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                  <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      name={l.co}
                      href={leadHref(l.id, here)}
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
