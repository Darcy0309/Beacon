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

/**
 * Today across the team, for an administrator: each account manager (and
 * any agent who worked) — when they started using Lighthouse, their calls,
 * the leads and appointments they developed against the goals they set, and
 * the hours worked so far. `rows`: getDailyProduction().
 */
export default function DailyProductionCard({ rows, timeZone }) {
  const time = (iso) =>
    iso ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : null;
  const total = (key) => rows.reduce((n, r) => n + r[key], 0);
  return (
    <Card data-daily-production>
      <SectionHeader label="Daily Production" icon={Gauge} href="/reports/pay" action="Pay & Hours" />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manager</TableHead>
              <TableHead>Started</TableHead>
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
                <TableCell className="tabular-nums">{time(r.startedAt) ?? <span className="text-muted-foreground">Not yet</span>}</TableCell>
                <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                <TableCell className="text-right"><AgainstGoal done={r.leads} goal={r.leadsGoal} /></TableCell>
                <TableCell className="text-right"><AgainstGoal done={r.appts} goal={r.apptsGoal} /></TableCell>
                <TableCell className="text-right tabular-nums">{r.workedMinutes ? hoursLabel(r.workedMinutes) : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
            {rows.length ? (
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell colSpan={2} className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Team today</TableCell>
                <TableCell className="text-right tabular-nums">{total("calls")}</TableCell>
                <TableCell className="text-right tabular-nums">{total("leads")}</TableCell>
                <TableCell className="text-right tabular-nums">{total("appts")}</TableCell>
                <TableCell className="text-right tabular-nums">{hoursLabel(total("workedMinutes"))}</TableCell>
              </TableRow>
            ) : (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No account managers yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
