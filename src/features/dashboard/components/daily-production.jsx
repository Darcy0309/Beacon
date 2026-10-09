import Link from "@/components/shared/intent-link";
import { Gauge } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hoursLabel } from "@/lib/pay";
import { cn } from "@/lib/utils";

/** "4 / 5 · 80%", or the count alone with no goal. */
function AgainstGoal({ done, goal }) {
  if (!goal) return <span className="tabular-nums">{done}</span>;
  const pct = Math.round((done / goal) * 100);
  return (
    <span className="tabular-nums">
      {done} / {goal}
      <span className={cn("ml-1.5 text-xs", pct >= 100 ? "text-emerald-400" : "text-muted-foreground")}>{pct}%</span>
    </span>
  );
}

/** Minutes past midnight on the business's clock. */
function minuteOfDay(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
const clockOf = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;

/**
 * The team's production for an administrator: each account manager (and
 * any agent who worked) on a day or over a pay period, week or month —
 * when they started using Lighthouse (on average, over a period), their
 * calls, the leads and appointments they developed against the goals they
 * set, and the hours worked. `rows`: getProduction(); `view`: readView().
 */
export default function DailyProductionCard({ rows, view, switcher, nav, timeZone }) {
  const isDay = view.key === "day";
  const isToday = isDay && view.anchor === view.today;
  const started = (r) => {
    if (!r.starts.length) return null;
    const m = isDay ? minuteOfDay(r.starts[0], timeZone) : Math.round(r.starts.reduce((n, s) => n + minuteOfDay(s, timeZone), 0) / r.starts.length);
    return clockOf(m);
  };
  const total = (key) => rows.reduce((n, r) => n + r[key], 0);
  const cols = isDay ? 6 : 7;
  return (
    <Card data-daily-production>
      <SectionHeader wrap label="Daily Production" icon={Gauge} action={switcher} />
      <div className="flex items-center justify-between gap-2 px-5 py-2">
        <span className="text-xs text-muted-foreground">{isDay ? "Each manager's day" : "Each manager over the period"}</span>
        {nav}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manager</TableHead>
              {isDay ? <TableHead>Started</TableHead> : <><TableHead className="text-right">Days worked</TableHead><TableHead>Usual start</TableHead></>}
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Appointments</TableHead>
              <TableHead className="text-right">Hours worked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId} data-production-row={r.userId}>
                <TableCell className="font-medium">
                  <Link href={`/reports/pay?user=${r.userId}`} className="hover:text-primary">{r.name}</Link>
                  {r.role === "agent" ? <span className="ml-1.5 text-xs text-muted-foreground">agent</span> : null}
                </TableCell>
                {isDay ? (
                  <TableCell className="tabular-nums">{started(r) ?? <span className="text-muted-foreground">{isToday ? "Not yet" : "—"}</span>}</TableCell>
                ) : (
                  <>
                    <TableCell className="text-right tabular-nums">{r.daysWorked}</TableCell>
                    <TableCell className="tabular-nums">{started(r) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  </>
                )}
                <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                <TableCell className="text-right"><AgainstGoal done={r.leads} goal={r.leadsGoal} /></TableCell>
                <TableCell className="text-right"><AgainstGoal done={r.appts} goal={r.apptsGoal} /></TableCell>
                <TableCell className="text-right tabular-nums">{r.workedMinutes ? hoursLabel(r.workedMinutes) : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
            {rows.length ? (
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell colSpan={cols - 4} className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{isToday ? "Team today" : "Team"}</TableCell>
                <TableCell className="text-right tabular-nums">{total("calls")}</TableCell>
                <TableCell className="text-right tabular-nums">{total("leads")}</TableCell>
                <TableCell className="text-right tabular-nums">{total("appts")}</TableCell>
                <TableCell className="text-right tabular-nums">{hoursLabel(total("workedMinutes"))}</TableCell>
              </TableRow>
            ) : (
              <TableRow><TableCell colSpan={cols} className="py-6 text-center text-muted-foreground">No account managers yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
