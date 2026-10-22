import { ClipboardCheck } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAppointmentUpdatesFeed } from "@/features/appointments/queries";
import { getClients } from "@/features/clients/queries";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { UPDATE_STATUSES, lineLabel, money, statusColor, statusLabel } from "@/lib/appointment-updates";
import { addDays, daysBetween, formatIso, formatRange, isIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Appointment Updates (Sean, Oct 2026): every update a client makes to an
 * appointment, as it comes in, newest first: when, the client and the
 * business, the appointment, the status (and what it was), the premium,
 * the note, who updated it and the manager who set it. The last 30 days to
 * begin with; by client and status.
 */
export default async function AppointmentUpdates({ searchParams }) {
  const sp = await searchParams;
  const [today, tz, clients] = await Promise.all([getBusinessToday(), getBusinessTimeZone(), getClients()]);
  let from = isIsoDate(sp?.from) ? sp.from : addDays(today, -30);
  let to = isIsoDate(sp?.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  if (daysBetween(from, to) > 366) from = addDays(to, -366);
  const client = /^[1-9]\d{0,17}$/.test(sp?.client ?? "") ? sp.client : "";
  const status = UPDATE_STATUSES.some(([k]) => k === sp?.status) ? sp.status : "";
  const rows = await getAppointmentUpdatesFeed({ from, to, companyId: client || null, status: status || null });
  const when = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const kept = Object.entries(sp ?? {}).filter(([k, v]) => !["from", "to"].includes(k) && typeof v === "string");
  const sold = rows.filter((u) => u.status === "sold").reduce((t, u) => t + (u.total ?? 0), 0);

  return (
    <>
      <Topbar title="Appointment Updates" sub={`${rows.length.toLocaleString()} update${rows.length === 1 ? "" : "s"} · ${formatRange(from, to)}${sold ? ` · ${money(sold)} written` : ""}`} />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <SectionHeader wrap label="Appointment Updates" icon={ClipboardCheck} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3">
            <form action="/reports/appointment-updates" className="inline-flex items-center gap-2">
              {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Updated</span>
              <DateRangePicker key={`${from}:${to}`} defaultFrom={from} defaultTo={to} active={isIsoDate(sp?.from) || isIsoDate(sp?.to)} />
            </form>
            <ParamSelect name="client" label="Client" placeholder="All clients" value={client} options={clients.map((c) => ({ value: String(c.id), label: c.name }))} />
            <ParamSelect name="status" label="Status" placeholder="Any status" value={status} options={UPDATE_STATUSES.map(([value, label]) => ({ value, label }))} />
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <Table data-updates-table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Updated</TableHead>
                    <TableHead>Client · business</TableHead>
                    <TableHead>Appointment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Premium</TableHead>
                    <TableHead className="min-w-60">Notes</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Manager</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.id} data-update-row={u.id}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{when(u.at)}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">{u.client}</div>
                        {u.leadId ? <Link href={`/leads/${u.leadId}?tab=updates`} className="font-medium hover:text-primary">{u.co}</Link> : u.co}
                        <div className="text-xs text-muted-foreground">{u.project}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{u.apptDate ? `${formatIso(u.apptDate, "short")}${u.apptTime ? ` · ${u.apptTime}` : ""}` : "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: statusColor(u.status) }} />{statusLabel(u.status)}
                        </span>
                        {u.previous ? <div className="text-xs text-muted-foreground">was {statusLabel(u.previous)}</div> : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {u.total != null ? (
                          <>
                            <strong>{money(u.total)}</strong>
                            {(u.lines ?? []).map((l) => <div key={l.line} className="whitespace-nowrap text-xs text-muted-foreground">{lineLabel(l.line)} {money(l.premium)} · {l.carrier}</div>)}
                          </>
                        ) : u.potential != null ? <span>{money(u.potential)} <span className="text-xs text-muted-foreground">potential</span></span> : "—"}
                      </TableCell>
                      <TableCell className="max-w-96 whitespace-pre-line break-words text-sm">{u.note ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">{u.by}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{u.manager}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">No appointment updates {client || status ? "match these filters" : "in these days"}.</p>
          )}
        </Card>
      </div>
    </>
  );
}
