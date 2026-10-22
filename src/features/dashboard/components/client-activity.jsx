import Link from "@/components/shared/intent-link";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRange } from "@/lib/dates";
import MessageManager from "@/features/dashboard/components/message-manager";

const TONE = { Lead: "cyan", Appointment: "violet", "Appointment-Confirmed": "emerald", "Appointment-Invalid": "rose" };
const TYPES = [{ value: "lead", label: "Leads" }, { value: "appointment", label: "Appointments" }];

/**
 * Recent Activity, under a client's dashboard (Sean, Oct 2026): the leads and
 * appointments developed on their projects, newest first, over the days
 * chosen (the last week to begin with), by project and type. Each opens the
 * lead (its sheet, with the client notes; never the internal ones); the
 * manager's name opens a message to them about it.
 *
 *   rows       getClientActivity()
 *   range      { from, to } shown; `custom` when chosen
 *   projects   [{ id, name }] theirs as campaigns (a DB dev project and the appointment
 *              project it promotes to, together), for the filter
 *   chosen     { project, type } from the address
 *   params     the dashboard's other params, kept by the date form
 */
export default function ClientActivity({ rows, range, projects, chosen, params, timeZone }) {
  const when = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const kept = Object.entries(params ?? {}).filter(([k, v]) => !["af", "ato"].includes(k) && typeof v === "string");
  return (
    <Card data-client-activity>
      <SectionHeader label="Recent Activity" icon={Activity} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3">
        <form action="/" className="inline-flex items-center gap-2">
          {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <span className="text-xs text-muted-foreground">Developed</span>
          <DateRangePicker key={`${range.from}:${range.to}`} fromName="af" toName="ato" defaultFrom={range.from} defaultTo={range.to} max="today" active={range.custom} />
        </form>
        <ParamSelect name="ap" label="Project" placeholder="All projects" value={chosen.project ?? ""} options={projects.map((p) => ({ value: String(p.id), label: p.name }))} />
        <ParamSelect name="at" label="Type" placeholder="Leads & appointments" value={chosen.type ?? ""} options={TYPES} />
        <span className="ml-auto text-xs text-muted-foreground" data-activity-count>
          {rows.length.toLocaleString()} {rows.length === 1 ? "item" : "items"} · {formatRange(range.from, range.to)}
        </span>
      </div>
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {["Company", "Project", "Agent", "Date developed", "Call result", "X-Date", "Manager"].map((h) => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-activity-row={r.kind}>
                <TableCell>
                  <Link href={`/leads/${r.leadId}`} className="font-medium transition-colors hover:text-primary hover:underline" data-activity-lead={r.leadId}>{r.company}</Link>
                  <div className="text-xs text-muted-foreground">{r.location}</div>
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground" title={r.project}>{r.project}</TableCell>
                <TableCell>{r.agent}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{when.format(new Date(r.at))}</TableCell>
                <TableCell><ToneBadge tone={TONE[r.result] ?? "slate"} className="normal-case tracking-normal">{r.result}</ToneBadge></TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{r.xdate}</TableCell>
                <TableCell><MessageManager leadId={r.leadId} managerId={r.managerId} manager={r.manager} company={r.company} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing developed over these days.</p>
      )}
    </Card>
  );
}
