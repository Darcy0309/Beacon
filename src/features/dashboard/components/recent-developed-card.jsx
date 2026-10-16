import Link from "@/components/shared/intent-link";
import { ListChecks } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import ResultBadge from "@/components/shared/result-badge";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatIso } from "@/lib/dates";

/** What the card shows: leads, appointments or both (`rk` in the address). */
export const RECENT_KINDS = [["both", "Both"], ["lead", "Leads"], ["appointment", "Appointments"]];

const NOUN = { both: "leads & appointments", lead: "leads", appointment: "appointments" };

const EXPORT_HEADER = ["Date", "Time", "Type", "Manager", "Company", "Contact", "Phone", "City", "Client", "Project", "Call result", "Ultimate X-Date", "Pay (USD)"];
/** "Leads-and-appointments_2026-10-01_to_2026-10-15.csv": what and which days. */
const exportName = (view, kind) => {
  const what = { both: "Leads-and-appointments", lead: "Leads", appointment: "Appointments" }[kind] ?? "Developed";
  const { from, to } = view.range;
  return `${what}_${from}${to !== from ? `_to_${to}` : ""}.csv`;
};

/**
 * Recent Leads & Appointments on the administrator's dashboard: what every
 * manager developed on a day (today by default), a week, a pay period or
 * days of one's own, as the production report counts it — the name, its
 * client and project, its call result now, ultimate X-date, the manager, and
 * when it was developed. `rows`: getDeveloped() for everyone. `kindSwitch`,
 * `switcher`, `nav`: the address's controls; `params`: the address's other
 * values, kept when a range of one's own is picked.
 */
export default function RecentDevelopedCard({ rows, view, kind, kindSwitch, switcher, nav, params }) {
  const custom = view.key === "custom";
  const today = !custom && view.key === "day" && view.anchor === view.today;
  return (
    <Card data-recent-developed>
      <SectionHeader wrap label="Recent Leads & Appointments" icon={ListChecks} action={kindSwitch} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
        <span className="text-xs text-muted-foreground" data-developed-count>
          {rows.length} developed{today ? " today" : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {switcher}
          {/* Days of one's own: the picker submits these with the rest of the address. */}
          <form method="get" action="/" className="inline-flex" data-recent-custom>
            {Object.entries(params).filter(([k]) => !["rl", "rd", "rf", "rt"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input type="hidden" name="rl" value="custom" />
            <DateRangePicker fromName="rf" toName="rt" defaultFrom={custom ? view.range.from : undefined}
              defaultTo={custom ? view.range.to : undefined} max={view.today} maxDays={366} active={custom} />
          </form>
          {custom ? <span className="text-xs tabular-nums text-muted-foreground" data-recent-range>{view.label}</span> : nav}
        </div>
      </div>
      <FilterTable
        columns={["Company", "Client", "Project", "Call result", "Ultimate X-Date", "Manager", "Created"]}
        // By manager and by project (Sean, Oct 2026): each with the ones that have something in these days.
        filters={[{ key: "manager", label: "Manager" }, { key: "project", label: "Project" }]}
        // What is shown, filtered, as a CSV (Sean, Oct 2026): a manager's backup for their production and pay.
        exportCsv={{ name: exportName(view, kind), header: EXPORT_HEADER }}
        placeholder="Search company, phone, client, manager…"
        empty={today ? `No ${NOUN[kind]} developed yet today.` : `No ${NOUN[kind]} developed in these days.`}
        rows={rows.map((r) => ({
          id: r.id,
          search: `${r.company} ${r.phone ?? ""} ${(r.phone ?? "").replace(/\D/g, "")} ${r.contact ?? ""} ${r.client} ${r.project} ${r.manager} ${r.result?.name ?? ""} ${r.type}`,
          facets: { manager: r.manager, project: r.project },
          csv: [r.day, r.time, r.type, r.manager, r.company, r.contact ?? "", r.phone ?? "", r.location === "—" ? "" : r.location,
            r.client, r.project, r.result?.name ?? "", r.xdate === "—" ? "" : r.xdate, r.amount != null ? r.amount.toFixed(2) : ""],
          node: (
            <TableRow data-developed-row={r.id} data-kind={r.kind}>
              <TableCell>
                {r.leadId ? <Link href={`/leads/${r.leadId}`} className="font-medium transition-colors hover:text-primary">{r.company}</Link> : r.company}
                <div className="text-xs text-muted-foreground">{r.location}</div>
              </TableCell>
              <TableCell>{r.client}</TableCell>
              <TableCell className="text-muted-foreground">
                {r.projectId ? <Link href={`/projects/${r.projectId}`} className="transition-colors hover:text-primary">{r.project}</Link> : r.project}
              </TableCell>
              <TableCell><ResultBadge result={r.result} /></TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{r.xdate}</TableCell>
              <TableCell>{r.manager}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {view.key === "day" ? r.time : `${formatIso(r.day, "short")}, ${r.time}`}
                <div className="text-xs" data-developed-type>{r.type}</div>
              </TableCell>
            </TableRow>
          ),
        }))}
      />
    </Card>
  );
}
